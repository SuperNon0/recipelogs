// Support (lot 5) : les demandes « Signaler un problème » envoyées depuis un
// RecipeLog client. Une demande = un fichier JSON dans /support/<client>/<id>.json,
// lu et complété aussi par le moteur du panel (tes réponses). Écriture atomique
// (fichier temporaire puis renommage) : les deux peuvent écrire sans se gêner.
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { ErreurPasserelle } from "./authentik.mjs";

const RACINE = process.env.SUPPORT_DIR || "/support";
const TYPES = new Set(["bug", "question", "idee"]);
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
const ID_RE = /^[0-9]{8}-[0-9]{6}-[0-9a-f]{4}$/;
const MAX_PAR_JOUR = 30; // par client : protège la boîte de Noë d'un robot ou d'une boucle

const texte = (v, max) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, max) : "");
const dossier = (client) => `${RACINE}/${client}`;

async function ecrire(client, t) {
  await mkdir(dossier(client), { recursive: true });
  const f = `${dossier(client)}/${t.id}.json`;
  const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(t, null, 1), { mode: 0o644 });
  await rename(tmp, f);
}

async function lire(client, id) {
  if (!ID_RE.test(id)) throw new ErreurPasserelle(404, "introuvable", "Demande introuvable.");
  try {
    return JSON.parse(await readFile(`${dossier(client)}/${id}.json`, "utf8"));
  } catch {
    throw new ErreurPasserelle(404, "introuvable", "Demande introuvable.");
  }
}

async function toutes(client) {
  let noms = [];
  try {
    noms = (await readdir(dossier(client))).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const liste = [];
  for (const n of noms) {
    try {
      liste.push(JSON.parse(await readFile(`${dossier(client)}/${n}`, "utf8")));
    } catch {
      /* fichier en cours d'écriture : ignoré cette fois */
    }
  }
  return liste.sort((a, b) => String(b.maj).localeCompare(String(a.maj)));
}

// Ce que voit le client : tout sauf les notes internes.
const pourClient = ({ notes, ...t }) => t;

export async function creerDemande(client, corps) {
  const email = texte(corps.email, 254).toLowerCase();
  const message = texte(corps.message, 5000);
  if (!EMAIL_RE.test(email)) throw new ErreurPasserelle(400, "email_invalide", "Adresse e-mail invalide.");
  if (message.length < 3) throw new ErreurPasserelle(400, "message_vide", "Décris le problème en quelques mots.");
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const deja = (await toutes(client)).filter((t) => String(t.date).startsWith(aujourdhui)).length;
  if (deja >= MAX_PAR_JOUR) throw new ErreurPasserelle(429, "trop_de_demandes", "Trop de demandes aujourd'hui : réessaie demain, ou écris directement à RecipeLog.");
  const c = corps.contexte && typeof corps.contexte === "object" ? corps.contexte : {};
  const maintenant = new Date();
  const id = `${maintenant.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}-${randomBytes(2).toString("hex")}`;
  const t = {
    id,
    client,
    date: maintenant.toISOString(),
    maj: maintenant.toISOString(),
    type: TYPES.has(corps.type) ? corps.type : "question",
    email,
    statut: "ouvert",
    luSupport: false,
    luClient: true,
    contexte: {
      page: texte(c.page, 300),
      navigateur: texte(c.navigateur, 300),
      ecran: texte(c.ecran, 40),
      version: texte(c.version, 40),
      role: texte(c.role, 80),
    },
    messages: [{ de: "client", qui: email, texte: message, date: maintenant.toISOString() }],
  };
  await ecrire(client, t);
  return pourClient(t);
}

export async function listerDemandes(client, email) {
  const e = texte(email, 254).toLowerCase();
  if (!e) return [];
  return (await toutes(client)).filter((t) => t.email === e).map(pourClient);
}

// Messages de suivi : 60 par jour et par client au plus (même protection que pour les demandes).
const suivis = new Map(); // client -> { jour, n }
function compterSuivi(client) {
  const jour = new Date().toISOString().slice(0, 10);
  const c = suivis.get(client);
  const n = c && c.jour === jour ? c.n + 1 : 1;
  suivis.set(client, { jour, n });
  if (n > 60) throw new ErreurPasserelle(429, "trop_de_demandes", "Trop de messages aujourd'hui : réessaie demain, ou écris directement à RecipeLog.");
}

export async function ajouterMessage(client, id, corps) {
  compterSuivi(client);
  const t = await lire(client, id);
  const email = texte(corps.email, 254).toLowerCase();
  if (t.email !== email) throw new ErreurPasserelle(404, "introuvable", "Demande introuvable.");
  const message = texte(corps.message, 5000);
  if (message.length < 1) throw new ErreurPasserelle(400, "message_vide", "Le message est vide.");
  if (t.messages.length >= 100) throw new ErreurPasserelle(400, "trop_long", "Cette conversation est trop longue : ouvre une nouvelle demande.");
  const date = new Date().toISOString();
  t.messages.push({ de: "client", qui: email, texte: message, date });
  t.statut = "ouvert";
  t.luSupport = false;
  t.luClient = true;
  t.maj = date;
  await ecrire(client, t);
  return pourClient(t);
}

export async function marquerLu(client, id, email) {
  const t = await lire(client, id);
  if (t.email !== texte(email, 254).toLowerCase()) throw new ErreurPasserelle(404, "introuvable", "Demande introuvable.");
  if (!t.luClient) {
    t.luClient = true;
    await ecrire(client, t);
  }
  return pourClient(t);
}

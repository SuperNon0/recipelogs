// Lecture des factures par IA (lot 7), côté panel : nombre de lectures par
// mois de chaque client (reglages.json, lu par la passerelle) et compteurs
// tenus par la passerelle (usage/<client>.json). Le moteur sert ces routes :
//   GET  /ia          état de la clé, quotas, lectures du mois et du mois d'avant
//   POST /ia/quota    { client: "maison" | "*", limite: 50 | null }  (null = revenir au défaut)
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const NOM_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
// Prix de Claude Opus 5.5 en dollars par million de mots-jetons (pour une estimation du coût).
const PRIX_ENTREE = Number(process.env.IA_PRIX_ENTREE ?? 4);
const PRIX_SORTIE = Number(process.env.IA_PRIX_SORTIE ?? 20);

export class RefusIA extends Error {}

const dossier = (donnees) => `${donnees}/ia`;

async function lire(f, defaut) {
  try {
    return JSON.parse(await readFile(f, "utf8"));
  } catch {
    return defaut;
  }
}

const moisDe = (d) => d.toISOString().slice(0, 7);
function moisPrecedent(d = new Date()) {
  return moisDe(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 15)));
}

export const cout = (u) => Math.round(((u.entree ?? 0) * PRIX_ENTREE + (u.sortie ?? 0) * PRIX_SORTIE) / 10_000) / 100;

export async function resume(donnees) {
  const d = dossier(donnees);
  const [etat, reglages] = await Promise.all([lire(`${d}/etat.json`, {}), lire(`${d}/reglages.json`, {})]);
  const maintenant = moisDe(new Date());
  const avant = moisPrecedent();
  const usage = {};
  let fichiers = [];
  try {
    fichiers = (await readdir(`${d}/usage`)).filter((f) => f.endsWith(".json"));
  } catch {
    fichiers = [];
  }
  for (const f of fichiers) {
    const nom = f.slice(0, -5);
    if (!NOM_RE.test(nom)) continue;
    const u = await lire(`${d}/usage/${f}`, {});
    const vide = { lectures: 0, entree: 0, sortie: 0 };
    const m = { ...vide, ...(u[maintenant] ?? {}) };
    const p = { ...vide, ...(u[avant] ?? {}) };
    usage[nom] = { mois: { ...m, cout: cout(m) }, precedent: { ...p, cout: cout(p) } };
  }
  return {
    cle: etat.cle === true,
    modeles: Array.isArray(etat.modeles) ? etat.modeles : [],
    passerelleVue: typeof etat.depuis === "string" ? etat.depuis : null,
    mois: maintenant,
    defaut: typeof reglages.defaut === "number" ? reglages.defaut : null,
    clients: reglages.clients && typeof reglages.clients === "object" ? reglages.clients : {},
    usage,
  };
}

export async function reglerQuota(donnees, corps) {
  const client = corps?.client;
  const limite = corps?.limite;
  if (client !== "*" && !(typeof client === "string" && NOM_RE.test(client))) throw new RefusIA("Client inconnu.");
  if (limite !== null && !(Number.isInteger(limite) && limite >= 0 && limite <= 100_000)) throw new RefusIA("Le nombre de lectures doit être un entier de 0 à 100 000.");
  if (client === "*" && limite === null) throw new RefusIA("Donne un nombre de lectures par défaut.");
  const d = dossier(donnees);
  const f = `${d}/reglages.json`;
  const r = await lire(f, {});
  r.clients = r.clients && typeof r.clients === "object" ? r.clients : {};
  if (client === "*") r.defaut = limite;
  else if (limite === null) delete r.clients[client];
  else r.clients[client] = limite;
  await mkdir(d, { recursive: true });
  const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(r, null, 1), { mode: 0o644 });
  await rename(tmp, f);
  return r;
}

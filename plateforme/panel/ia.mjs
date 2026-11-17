// Lecture des factures par IA (lot 7), côté panel : nombre de lectures par
// mois de chaque client (reglages.json, lu par la passerelle) et compteurs
// tenus par la passerelle (usage/<client>.json). Le moteur sert ces routes :
//   GET  /ia          état de la clé, quotas, lectures du mois et du mois d'avant
//   POST /ia/quota    { client: "maison" | "*", limite: 50 | null }  (null = revenir au défaut)
//   POST /ia/factures { client: "maison" | "*", attente: 30 | null, pages: 10 | null }
//                     factures prises en photo dans l'appli : combien en attente, pages par facture
//   POST /ia/cle      { cle: "sk-ant-…" }  règle la clé Claude de la plateforme (essayée avant), { cle: null } la retire
//                     La clé est écrite dans ia/cle.json (droits 600, lue par la passerelle seule) et
//                     n'est jamais renvoyée au navigateur : le panel n'en voit que les 4 derniers caractères.
import { chown, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
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

// Ce qu'on montre d'une clé : jamais plus que son début connu et ses 4 derniers caractères.
const masquer = (c) => `sk-ant-…${c.slice(-4)}`;

export async function resume(donnees) {
  const d = dossier(donnees);
  const [etat, reglages, fichierCle] = await Promise.all([lire(`${d}/etat.json`, {}), lire(`${d}/reglages.json`, {}), lire(`${d}/cle.json`, null)]);
  const clePanel = typeof fichierCle?.cle === "string" && fichierCle.cle.trim() ? fichierCle.cle.trim() : null;
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
    // cle : la plateforme fournit-elle l'IA ? source : « panel » (réglée ici) ou « installation » (IA_ANTHROPIC_CLE).
    cle: !!clePanel || etat.cle === true,
    cleInfo: clePanel
      ? { source: "panel", fin: masquer(clePanel), depuis: typeof fichierCle.depuis === "string" ? fichierCle.depuis : null, installationAussi: etat.cle === true }
      : etat.cle === true
        ? { source: "installation", fin: null, depuis: null, installationAussi: true }
        : { source: null, fin: null, depuis: null, installationAussi: false },
    modeles: Array.isArray(etat.modeles) ? etat.modeles : [],
    passerelleVue: typeof etat.depuis === "string" ? etat.depuis : null,
    mois: maintenant,
    defaut: typeof reglages.defaut === "number" ? reglages.defaut : null,
    clients: reglages.clients && typeof reglages.clients === "object" ? reglages.clients : {},
    factures: {
      defaut: { attente: reglages.factures?.defaut?.attente ?? null, pages: reglages.factures?.defaut?.pages ?? null },
      clients: reglages.factures?.clients && typeof reglages.factures.clients === "object" ? reglages.factures.clients : {},
    },
    usage,
  };
}

async function ecrireReglages(donnees, r) {
  const d = dossier(donnees);
  const f = `${d}/reglages.json`;
  await mkdir(d, { recursive: true });
  const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(r, null, 1), { mode: 0o644 });
  await rename(tmp, f);
}

/** Factures prises en photo (« Nouvelle facture ») : nombre en attente et pages par facture. null = suivre le défaut. */
export async function reglerFactures(donnees, corps) {
  const client = corps?.client;
  if (client !== "*" && !(typeof client === "string" && NOM_RE.test(client))) throw new RefusIA("Client inconnu.");
  const verifier = (v, max, quoi) => {
    if (v === null || v === undefined) return null;
    if (!(Number.isInteger(v) && v >= 0 && v <= max)) throw new RefusIA(`${quoi} : un entier de 0 à ${max.toLocaleString("fr-FR")}.`);
    return v;
  };
  const attente = verifier(corps?.attente, 10_000, "Factures en attente");
  const pages = verifier(corps?.pages, 20, "Pages par facture");
  if (pages === 0) throw new RefusIA("Pages par facture : 1 au moins (mets 0 en attente pour couper la fonction).");
  if (client === "*" && (attente === null || pages === null)) throw new RefusIA("Donne les deux nombres par défaut.");
  const r = await lire(`${dossier(donnees)}/reglages.json`, {});
  r.factures = r.factures && typeof r.factures === "object" ? r.factures : {};
  r.factures.clients = r.factures.clients && typeof r.factures.clients === "object" ? r.factures.clients : {};
  if (client === "*") r.factures.defaut = { attente, pages };
  else if (attente === null && pages === null) delete r.factures.clients[client];
  else r.factures.clients[client] = { ...(attente === null ? {} : { attente }), ...(pages === null ? {} : { pages }) };
  await ecrireReglages(donnees, r);
  return r;
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

const CLE_RE = /^sk-ant-[A-Za-z0-9_-]{20,300}$/;
const ANTHROPIC = (process.env.IA_ANTHROPIC_URL || "https://api.anthropic.com").replace(/\/+$/, "");

/** Demande à Anthropic la liste des modèles avec cette clé : gratuit, et dit si la clé est acceptée. */
export async function essayerCle(cle, f = fetch) {
  try {
    const r = await f(`${ANTHROPIC}/v1/models?limit=1`, {
      headers: { "x-api-key": cle, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15_000),
    });
    if (r.ok) return { ok: true };
    if (r.status === 401 || r.status === 403) return { ok: false, refusee: true };
    return { ok: false, refusee: false, detail: `Anthropic a répondu ${r.status}` };
  } catch (e) {
    return { ok: false, refusee: false, detail: `Anthropic injoignable (${e.message})` };
  }
}

/**
 * Règle ({ cle: "sk-ant-…" }) ou retire ({ cle: null }) la clé Claude de la plateforme.
 * Rend { avertissement } quand la clé n'a pas pu être essayée (elle est quand même gardée).
 */
export async function reglerCle(donnees, corps, f = fetch) {
  const d = dossier(donnees);
  const fichier = `${d}/cle.json`;
  if (corps?.cle === null) {
    await unlink(fichier).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
    return { avertissement: null };
  }
  const cle = typeof corps?.cle === "string" ? corps.cle.trim() : "";
  if (!CLE_RE.test(cle)) throw new RefusIA("Ce n'est pas une clé Claude : elle commence par « sk-ant- » (console.anthropic.com → API Keys).");
  const essai = await essayerCle(cle, f);
  if (!essai.ok && essai.refusee) throw new RefusIA("Anthropic refuse cette clé (fausse, supprimée ou désactivée). Rien n'a été changé.");
  await mkdir(d, { recursive: true });
  const tmp = `${fichier}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify({ cle, depuis: new Date().toISOString() }), { mode: 0o600 });
  // La passerelle tourne en « node » (1000) : elle seule doit pouvoir la lire.
  await chown(tmp, 1000, 1000).catch(() => {});
  await rename(tmp, fichier);
  return { avertissement: essai.ok ? null : `Clé gardée, mais pas pu l'essayer (${essai.detail}). Fais une lecture de test pour vérifier.` };
}

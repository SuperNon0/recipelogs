// Lecture des factures par IA (lot 7), côté panel : nombre de lectures par
// mois de chaque client (reglages.json, lu par la passerelle) et compteurs
// tenus par la passerelle (usage/<client>.json). Le moteur sert ces routes :
//   GET  /ia          état de la clé, quotas, lectures du mois et du mois d'avant
//   POST /ia/quota    { client: "maison" | "*", limite: 50 | null }  (null = revenir au défaut)
//   POST /ia/factures { client: "maison" | "*", attente: 30 | null, pages: 10 | null }
//                     factures prises en photo dans l'appli : combien en attente, pages par facture
//   POST /ia/cle      { fournisseur: "anthropic"|"gemini"|"openai", modele, cle, prix: { entree, sortie } }
//                     règle l'IA de la plateforme (clé et modèle essayés avant) ; cle vide = garder celle
//                     déjà mise pour la même IA (changer seulement de modèle) ; { cle: null } la retire.
//                     La clé est écrite dans ia/cle.json (droits 600, lue par la passerelle seule) et
//                     n'est jamais renvoyée au navigateur : le panel n'en voit que les 4 derniers caractères.
import { chown, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const NOM_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
// Prix de Claude Opus 5.5 en dollars par million de mots-jetons : estimation des lectures
// comptées avant que la passerelle ne note elle-même le coût (« cout » dans usage).
const PRIX_ENTREE = Number(process.env.IA_PRIX_ENTREE ?? 4);
const PRIX_SORTIE = Number(process.env.IA_PRIX_SORTIE ?? 20);

// IA proposées pour la clé de la plateforme, avec des modèles conseillés et leur prix
// (dollars par million de jetons lus / écrits, à vérifier chez le fournisseur : modifiables dans le panel).
export const IA_PROPOSEES = {
  anthropic: {
    nom: "Claude (Anthropic)",
    ou: "https://platform.claude.com/settings/keys",
    modeles: [
      { id: "claude-haiku-5-5", nom: "Claude Haiku 5.5", note: "le moins cher, rapide", prix: { entree: 0.1, sortie: 0.5 } },
      { id: "claude-sonnet-5-5", nom: "Claude Sonnet 5.5", note: "plus précis", prix: { entree: 2, sortie: 10 } },
      { id: "claude-opus-5-5", nom: "Claude Opus 5.5", note: "le plus précis, le plus cher", prix: { entree: 4, sortie: 20 } },
    ],
  },
  gemini: {
    nom: "Gemini (Google)",
    ou: "https://aistudio.google.com/apikey",
    modeles: [
      { id: "gemini-2.5-flash", nom: "Gemini 2.5 Flash", note: "pas cher, bon sur les photos", prix: { entree: 0.3, sortie: 2.5 } },
      { id: "gemini-2.5-flash-lite", nom: "Gemini 2.5 Flash-Lite", note: "le moins cher de Google", prix: { entree: 0.1, sortie: 0.4 } },
      { id: "gemini-2.5-pro", nom: "Gemini 2.5 Pro", note: "plus précis", prix: { entree: 1.25, sortie: 10 } },
    ],
  },
  openai: {
    nom: "ChatGPT (OpenAI)",
    ou: "https://platform.openai.com/api-keys",
    modeles: [
      { id: "gpt-5-mini", nom: "GPT-5 mini", note: "pas cher", prix: { entree: 0.25, sortie: 2 } },
      { id: "gpt-5-nano", nom: "GPT-5 nano", note: "le moins cher, moins précis", prix: { entree: 0.05, sortie: 0.4 } },
      { id: "gpt-5", nom: "GPT-5", note: "plus précis", prix: { entree: 1.25, sortie: 10 } },
    ],
  },
};

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

export const cout = (u) =>
  typeof u.cout === "number" ? Math.round(u.cout * 100) / 100 : Math.round(((u.entree ?? 0) * PRIX_ENTREE + (u.sortie ?? 0) * PRIX_SORTIE) / 10_000) / 100;

// Ce qu'on montre d'une clé : jamais plus que ses 4 derniers caractères.
const masquer = (c) => `…${c.slice(-4)}`;

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
      ? {
          source: "panel",
          fournisseur: IA_PROPOSEES[fichierCle.fournisseur] ? fichierCle.fournisseur : "anthropic",
          modele: typeof fichierCle.modele === "string" ? fichierCle.modele : "claude-opus-5-5",
          prix: fichierCle.prix ?? null,
          fin: masquer(clePanel),
          depuis: typeof fichierCle.depuis === "string" ? fichierCle.depuis : null,
          installationAussi: etat.cle === true,
        }
      : etat.cle === true
        ? { source: "installation", fournisseur: "anthropic", modele: Array.isArray(etat.modeles) ? etat.modeles[0] ?? "claude-opus-5-5" : "claude-opus-5-5", prix: { entree: PRIX_ENTREE, sortie: PRIX_SORTIE }, fin: null, depuis: null, installationAussi: true }
        : { source: null, fournisseur: null, modele: null, prix: null, fin: null, depuis: null, installationAussi: false },
    proposees: IA_PROPOSEES,
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

const ANTHROPIC = (process.env.IA_ANTHROPIC_URL || "https://api.anthropic.com").replace(/\/+$/, "");
const OPENAI = (process.env.IA_OPENAI_URL || "https://api.openai.com").replace(/\/+$/, "");
const GEMINI = (process.env.IA_GEMINI_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
const NOM_IA = { anthropic: "Anthropic", gemini: "Google", openai: "OpenAI" };
const FORMES = {
  anthropic: { re: /^sk-ant-[A-Za-z0-9_-]{20,300}$/, aide: "Une clé Claude commence par « sk-ant- »." },
  openai: { re: /^sk-[A-Za-z0-9_-]{20,300}$/, aide: "Une clé ChatGPT commence par « sk- »." },
  gemini: { re: /^[A-Za-z0-9_-]{30,100}$/, aide: "Une clé Gemini ressemble à « AIza… » (aistudio.google.com → Get API key)." },
};
const MODELE_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Demande au fournisseur la fiche du modèle avec cette clé : gratuit, et dit si la clé
 * est acceptée et si le modèle existe.
 */
export async function essayerCle(fournisseur, cle, modele, f = fetch) {
  const m = encodeURIComponent(modele);
  const [url, headers] =
    fournisseur === "anthropic"
      ? [`${ANTHROPIC}/v1/models/${m}`, { "x-api-key": cle, "anthropic-version": "2023-06-01" }]
      : fournisseur === "openai"
        ? [`${OPENAI}/v1/models/${m}`, { authorization: `Bearer ${cle}` }]
        : [`${GEMINI}/v1beta/models/${m}`, { "x-goog-api-key": cle }];
  try {
    const r = await f(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (r.ok) return { ok: true };
    const texte = await r.text().catch(() => "");
    // Google répond 400 « API_KEY_INVALID » pour une fausse clé.
    if (r.status === 401 || r.status === 403 || (fournisseur === "gemini" && r.status === 400 && /API_KEY/i.test(texte))) return { ok: false, refusee: true };
    if (r.status === 404) return { ok: false, modeleInconnu: true };
    return { ok: false, detail: `${NOM_IA[fournisseur]} a répondu ${r.status}` };
  } catch (e) {
    return { ok: false, detail: `${NOM_IA[fournisseur]} injoignable (${e.message})` };
  }
}

const prixValide = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000;

/**
 * Règle l'IA de la plateforme, ou la retire ({ cle: null }).
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
  const fournisseur = corps?.fournisseur ?? "anthropic";
  if (!IA_PROPOSEES[fournisseur]) throw new RefusIA("IA inconnue : Claude, Gemini ou ChatGPT.");
  const modele = typeof corps?.modele === "string" && corps.modele.trim() ? corps.modele.trim() : IA_PROPOSEES[fournisseur].modeles[0].id;
  if (!MODELE_RE.test(modele)) throw new RefusIA("Nom de modèle invalide (lettres, chiffres, points et tirets).");
  let cle = typeof corps?.cle === "string" ? corps.cle.trim() : "";
  if (!cle) {
    // Garder la clé déjà mise, si c'est la même IA (on change seulement de modèle ou de prix).
    const avant = await lire(fichier, null);
    if (avant?.fournisseur === fournisseur || (!avant?.fournisseur && fournisseur === "anthropic")) cle = typeof avant?.cle === "string" ? avant.cle : "";
    if (!cle) throw new RefusIA(`Colle la clé ${IA_PROPOSEES[fournisseur].nom}.`);
  } else if (!FORMES[fournisseur].re.test(cle)) {
    throw new RefusIA(`Ce n'est pas une clé ${IA_PROPOSEES[fournisseur].nom}. ${FORMES[fournisseur].aide}`);
  }
  const conseil = IA_PROPOSEES[fournisseur].modeles.find((m) => m.id === modele)?.prix ?? null;
  const prix = prixValide(corps?.prix?.entree) && prixValide(corps?.prix?.sortie) ? { entree: corps.prix.entree, sortie: corps.prix.sortie } : conseil;
  const essai = await essayerCle(fournisseur, cle, modele, f);
  if (essai.refusee) throw new RefusIA(`${NOM_IA[fournisseur]} refuse cette clé (fausse, supprimée ou désactivée). Rien n'a été changé.`);
  if (essai.modeleInconnu) throw new RefusIA(`La clé marche, mais le modèle « ${modele} » n'existe pas chez ${NOM_IA[fournisseur]}. Rien n'a été changé.`);
  await mkdir(d, { recursive: true });
  const tmp = `${fichier}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify({ fournisseur, modele, cle, ...(prix ? { prix } : {}), depuis: new Date().toISOString() }), { mode: 0o600 });
  // La passerelle tourne en « node » (1000) : elle seule doit pouvoir la lire.
  await chown(tmp, 1000, 1000).catch(() => {});
  await rename(tmp, fichier);
  return { avertissement: essai.ok ? null : `Gardée, mais pas pu l'essayer (${essai.detail}). Fais une lecture de test pour vérifier.` };
}

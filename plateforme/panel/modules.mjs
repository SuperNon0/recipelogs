// Modules en option de chaque client : le panel coche ou décoche des parties de
// son RecipeLog (cahiers, courses, prix fournisseurs, utilisateurs…) et règle
// leurs limites (recettes, place pour les fichiers…). Un module coupé disparaît
// des menus de son site, ses pages renvoient vers l'accueil et ses outils Claude
// (MCP) ne sont plus proposés. Ses données ne sont jamais effacées.
//
// Fichier ia/modules.json (dossier partagé avec la passerelle, qui le donne à
// l'appli du client par GET /v1/modules) :
//   { clients: { maison: { factures: false } },
//     limites: { maison: { recettes: 200, fichiersMo: 2048, marquePdf: true } },
//     offres:  { maison: "Essentiel" } }
// Seuls les modules coupés sont notés : un module absent est allumé, et un module
// ajouté plus tard est donc allumé chez tout le monde. Une limite absente ou à 0 =
// pas de limite. offres = nom de la dernière offre appliquée (affichage seulement).
//
// Un sous-module (factures sous fournisseurs…) garde sa propre case : couper le
// parent coupe aussi ses sous-modules sans toucher à leur case, et le rallumer
// les remet comme avant.
//
// Le moteur sert ces routes :
//   GET  /modules   { modules: MODULES, limites: LIMITES, clients, valeurs, offres }
//   POST /modules   { client, modules?: { factures: false }, limites?: { recettes: 200 }, offre?: "Pro" | null }
//
// Ce qui se règle ailleurs mais s'affiche sous la flèche de son module dans le panel :
// nombre de comptes (Utilisateurs), accès et clé secrète MCP (options de l'instance,
// redémarrage), analyse des documents et lectures IA (ia.mjs, Factures).
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const NOM_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

/** Les modules, dans l'ordre de l'onglet. parent = sous-module. Même liste dans src/lib/modules.ts (appli). */
export const MODULES = [
  { cle: "utilisateurs", nom: "Utilisateurs", aide: "Plusieurs comptes : le responsable invite son équipe. Coupé : seul le responsable se connecte, il ne peut inviter personne (les comptes déjà là restent, mais ne peuvent plus être gérés)." },
  { cle: "roles", parent: "utilisateurs", nom: "Rôles personnalisés", aide: "Créer ses propres rôles (Apprenti, Chef…) en cochant ce que chacun peut faire et voir. Coupé : il ne reste que Administrateur et Membre (tout sauf les comptes et les réglages du site)." },
  { cle: "cahiers", nom: "Cahiers de recettes", aide: "Les cahiers : plusieurs recettes rassemblées dans un PDF à imprimer ou partager." },
  { cle: "themes", nom: "Thèmes PDF personnalisés", aide: "Créer ses propres thèmes (couleurs, polices, mise en page) pour les PDF des recettes et des cahiers. Coupé : la page Thèmes PDF disparaît, les PDF gardent les thèmes déjà faits." },
  { cle: "courses", nom: "Listes de courses", aide: "Les listes de courses faites à partir des recettes et des cahiers." },
  { cle: "production", nom: "Production", aide: "La page Production : les recettes à faire, les quantités et la fiche de production à imprimer." },
  { cle: "fournisseurs", nom: "Prix fournisseurs", aide: "Les fournisseurs, leurs produits, l'historique des prix et le coût de revient des recettes. Coupé : ses sous-modules sont coupés aussi." },
  { cle: "factures", parent: "fournisseurs", nom: "Factures", aide: "Enregistrer les factures (photo, PDF, à la main) et suivre les prix payés." },
  { cle: "mercuriales", parent: "fournisseurs", nom: "Mercuriales", aide: "Importer les mercuriales (listes de prix) des fournisseurs." },
  { cle: "commandes", parent: "fournisseurs", nom: "Commandes fournisseurs", aide: "Préparer et envoyer un bon de commande à un fournisseur, avec l'historique." },
  { cle: "ventes", parent: "fournisseurs", nom: "Produits vendus et marges", aide: "Le prix de vente, la TVA et la marge de chaque recette, et la page Produits vendus. Il a besoin du coût de revient, donc des prix fournisseurs." },
  { cle: "imports", nom: "Imports et exports", aide: "Faire entrer des recettes venues d'ailleurs, ou en sortir pour les mettre dans un autre RecipeLog. Coupé : ses sous-modules sont coupés aussi." },
  { cle: "import-recipekeeper", parent: "imports", nom: "RecipeKeeper", aide: "Importer les recettes exportées de l'appli Recipe Keeper." },
  { cle: "import-json", parent: "imports", nom: "Fichier JSON (import et export)", aide: "Importer un fichier de recettes, et exporter les recettes cochées pour les importer dans un autre RecipeLog." },
  { cle: "import-video", parent: "imports", nom: "Vidéos et pages web", aide: "Créer une recette à partir d'un lien TikTok, Instagram, YouTube ou d'une page de recette." },
];
const CLES = new Set(MODULES.map((m) => m.cle));

/**
 * Limites réglables sous la flèche d'une ligne (ligne = clé du module, ou « recettes » et
 * « fichiers », toujours là). Un nombre à 0 ou vide = pas de limite ; une case = oui / non.
 * Même liste dans src/lib/modules.ts (appli).
 */
export const LIMITES = [
  { cle: "recettes", ligne: "recettes", nom: "Recettes au plus", unite: "recettes", max: 1_000_000, aide: "Nombre de recettes que le client peut avoir (variantes et sous-recettes comprises). Atteint : il ne peut plus en créer, importer ni dupliquer, mais garde et modifie les siennes. 0 = pas de limite." },
  { cle: "fichiersMo", ligne: "fichiers", nom: "Place pour les fichiers", unite: "Mo", max: 10_000_000, aide: "Place pour les factures, mercuriales et photos envoyées sur son site (1 024 Mo = 1 Go). Pleine : il ne peut plus en envoyer, sans rien perdre. 0 = pas de limite." },
  { cle: "roles", ligne: "roles", nom: "Rôles au plus", unite: "rôles", max: 1000, aide: "Nombre de rôles qu'il peut créer, en plus d'Administrateur. 0 = pas de limite." },
  { cle: "cahiers", ligne: "cahiers", nom: "Cahiers au plus", unite: "cahiers", max: 100_000, aide: "Nombre de cahiers de recettes. 0 = pas de limite." },
  { cle: "themes", ligne: "themes", nom: "Thèmes au plus", unite: "thèmes", max: 1000, aide: "Nombre de thèmes PDF qu'il peut créer, en plus du thème de base. 0 = pas de limite." },
  { cle: "marquePdf", ligne: "themes", type: "case", nom: "« Fait avec RecipeLog » en bas des PDF", aide: "Ajoute une petite ligne « Fait avec RecipeLog » en bas de chaque page des PDF (recettes, cahiers, production). Utile pour un essai ou une petite offre." },
  { cle: "mercurialePages", ligne: "mercuriales", nom: "Pages par mercuriale", unite: "pages", max: 50, aide: "Nombre de photos (pages) d'une mercuriale scannée. Vide ou 0 = 20, la valeur de départ ; 50 au plus." },
  { cle: "videosMois", ligne: "import-video", nom: "Liens lus par mois", unite: "liens", max: 100_000, aide: "Nombre de vidéos et pages de recette que Claude peut lire par mois pour ce client (outil lire_video). 0 = pas de limite." },
];
const LIM = new Map(LIMITES.map((l) => [l.cle, l]));

export class RefusModules extends Error {}

const fichier = (donnees) => `${donnees}/ia/modules.json`;

async function lire(donnees) {
  try {
    const j = JSON.parse(await readFile(fichier(donnees), "utf8"));
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/** Limites propres (ce qui est inconnu ou vide est retiré). */
export function nettoyerLimites(l) {
  const sortie = {};
  for (const [k, v] of Object.entries(objet(l))) {
    const d = LIM.get(k);
    if (!d) continue;
    if (d.type === "case") {
      if (v === true) sortie[k] = true;
    } else if (Number.isInteger(v) && v > 0 && v <= d.max) sortie[k] = v;
  }
  return sortie;
}

/** Modules coupés et limites de chaque client. */
export async function resume(donnees) {
  const r = await lire(donnees);
  const clients = {};
  for (const [nom, m] of Object.entries(objet(r.clients))) {
    if (!NOM_RE.test(nom)) continue;
    const coupes = Object.fromEntries(Object.entries(objet(m)).filter(([k, v]) => CLES.has(k) && v === false));
    if (Object.keys(coupes).length) clients[nom] = coupes;
  }
  const valeurs = {};
  for (const [nom, l] of Object.entries(objet(r.limites))) {
    const n = nettoyerLimites(l);
    if (NOM_RE.test(nom) && Object.keys(n).length) valeurs[nom] = n;
  }
  const offres = Object.fromEntries(Object.entries(objet(r.offres)).filter(([nom, o]) => NOM_RE.test(nom) && typeof o === "string"));
  return { modules: MODULES, limites: LIMITES, clients, valeurs, offres };
}

/** Pour une offre (Tarifs) : modules coupés (liste de clés) et limites, nettoyés. */
export function nettoyerOffre(o) {
  const coupes = Array.isArray(o?.coupes) ? [...new Set(o.coupes.filter((k) => CLES.has(k)))] : [];
  return { coupes, limites: nettoyerLimites(o?.limites) };
}

/** { client, modules?: { cle: true|false }, limites?: { cle: valeur|null }, offre? } : seul ce qui est donné change. */
export async function regler(donnees, corps) {
  const client = corps?.client;
  if (!(typeof client === "string" && NOM_RE.test(client))) throw new RefusModules("Client inconnu.");
  const m = corps?.modules === undefined ? {} : corps.modules;
  const l = corps?.limites === undefined ? {} : corps.limites;
  if (!m || typeof m !== "object" || Array.isArray(m)) throw new RefusModules("Modules : coché ou non.");
  if (!l || typeof l !== "object" || Array.isArray(l)) throw new RefusModules("Limites illisibles.");
  for (const [k, v] of Object.entries(m)) {
    if (!CLES.has(k)) throw new RefusModules(`Module inconnu : ${k}.`);
    if (typeof v !== "boolean") throw new RefusModules(`Module ${k} : coché ou non.`);
  }
  for (const [k, v] of Object.entries(l)) {
    const d = LIM.get(k);
    if (!d) throw new RefusModules(`Limite inconnue : ${k}.`);
    if (v === null) continue;
    if (d.type === "case" ? typeof v !== "boolean" : !(Number.isInteger(v) && v >= 0 && v <= d.max)) {
      throw new RefusModules(d.type === "case" ? `${d.nom} : oui ou non.` : `${d.nom} : un nombre entier de 0 à ${d.max.toLocaleString("fr-FR")}.`);
    }
  }
  if (corps?.offre !== undefined && corps.offre !== null && !(typeof corps.offre === "string" && corps.offre.length <= 40)) throw new RefusModules("Offre illisible.");
  const r = await lire(donnees);
  r.clients = objet(r.clients);
  r.limites = objet(r.limites);
  r.offres = objet(r.offres);
  const apres = { ...objet(r.clients[client]) };
  for (const [k, v] of Object.entries(m)) {
    if (v) delete apres[k];
    else apres[k] = false;
  }
  if (Object.keys(apres).length) r.clients[client] = apres;
  else delete r.clients[client];
  const lim = nettoyerLimites({ ...objet(r.limites[client]), ...Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v ?? undefined])) });
  if (Object.keys(lim).length) r.limites[client] = lim;
  else delete r.limites[client];
  if (corps?.offre !== undefined) {
    if (corps.offre) r.offres[client] = corps.offre.trim();
    else delete r.offres[client];
  }
  await ecrire(donnees, r);
  return { coupes: apres, limites: lim };
}

async function ecrire(donnees, r) {
  const d = `${donnees}/ia`;
  await mkdir(d, { recursive: true });
  const f = fichier(donnees);
  const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(r, null, 1), { mode: 0o644 });
  await rename(tmp, f);
}

/** Client supprimé : on oublie ses modules, ses limites et son offre. */
export async function oublier(donnees, client) {
  const r = await lire(donnees);
  let change = false;
  for (const k of ["clients", "limites", "offres"]) {
    if (r[k] && typeof r[k] === "object" && client in r[k]) {
      delete r[k][client];
      change = true;
    }
  }
  if (change) await ecrire(donnees, r);
}

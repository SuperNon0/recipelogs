// Modules en option de chaque client : le panel coche ou décoche des parties de
// son RecipeLog (cahiers, courses, prix fournisseurs…). Un module coupé disparaît
// des menus de son site, ses pages renvoient vers l'accueil et ses outils Claude
// (MCP) ne sont plus proposés. Ses données ne sont jamais effacées.
//
// Fichier ia/modules.json (dossier partagé avec la passerelle, qui le donne à
// l'appli du client par GET /v1/modules) :
//   { clients: { maison: { factures: false, courses: false } } }
// Seuls les modules coupés sont notés : un module absent est allumé, et un module
// ajouté plus tard est donc allumé chez tout le monde.
//
// Un sous-module (factures sous fournisseurs…) garde sa propre case : couper le
// parent coupe aussi ses sous-modules sans toucher à leur case, et le rallumer
// les remet comme avant.
//
// Le moteur sert ces routes :
//   GET  /modules                 { modules: MODULES, clients: { maison: { factures: false } } }
//   POST /modules                 { client: "maison", modules: { factures: false, courses: true } }
//
// L'accès Claude (MCP) n'est pas ici : c'est une option de l'instance (redémarrage),
// que le panel affiche dans le même onglet.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const NOM_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

/** Les modules, dans l'ordre de l'onglet. parent = sous-module. Même liste dans src/lib/modules.ts (appli). */
export const MODULES = [
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

/** Modules coupés de chaque client : { maison: { factures: false } }. */
export async function resume(donnees) {
  const r = await lire(donnees);
  const clients = {};
  for (const [nom, m] of Object.entries(r.clients && typeof r.clients === "object" ? r.clients : {})) {
    if (!NOM_RE.test(nom) || !m || typeof m !== "object") continue;
    const coupes = Object.fromEntries(Object.entries(m).filter(([k, v]) => CLES.has(k) && v === false));
    if (Object.keys(coupes).length) clients[nom] = coupes;
  }
  return { modules: MODULES, clients };
}

/** { client, modules: { cle: true|false } } : seules les cases données changent. */
export async function regler(donnees, corps) {
  const client = corps?.client;
  if (!(typeof client === "string" && NOM_RE.test(client))) throw new RefusModules("Client inconnu.");
  const m = corps?.modules;
  if (!m || typeof m !== "object" || Array.isArray(m)) throw new RefusModules("Modules : rien à changer.");
  for (const [k, v] of Object.entries(m)) {
    if (!CLES.has(k)) throw new RefusModules(`Module inconnu : ${k}.`);
    if (typeof v !== "boolean") throw new RefusModules(`Module ${k} : coché ou non.`);
  }
  const r = await lire(donnees);
  r.clients = r.clients && typeof r.clients === "object" ? r.clients : {};
  const avant = r.clients[client] && typeof r.clients[client] === "object" ? r.clients[client] : {};
  const apres = { ...avant };
  for (const [k, v] of Object.entries(m)) {
    if (v) delete apres[k];
    else apres[k] = false;
  }
  if (Object.keys(apres).length) r.clients[client] = apres;
  else delete r.clients[client];
  const d = `${donnees}/ia`;
  await mkdir(d, { recursive: true });
  const f = fichier(donnees);
  const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(r, null, 1), { mode: 0o644 });
  await rename(tmp, f);
  return apres;
}

/** Client supprimé : on oublie ses modules. */
export async function oublier(donnees, client) {
  const r = await lire(donnees);
  if (!r.clients?.[client]) return;
  delete r.clients[client];
  const f = fichier(donnees);
  const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(r, null, 1), { mode: 0o644 });
  await rename(tmp, f);
}

/**
 * Modules en option (plateforme) : le panel admin coche ou décoche des parties de
 * RecipeLog pour chaque client (onglet « Modules », plateforme/panel/modules.mjs).
 * Un module coupé disparaît des menus, ses pages renvoient vers l'accueil, ses
 * outils Claude (MCP) ne sont plus proposés. Ses données ne sont jamais effacées.
 *
 * Le panel ne note que les cases décochées ; la passerelle les donne par
 * GET /v1/modules. Couper un module coupe aussi ses sous-modules. Hors de la
 * plateforme (site perso, démo) : tout est allumé.
 */
import type { Permission } from "@/lib/auth/permissions";

export const MODULE_CLES = [
  "utilisateurs",
  "roles",
  "cahiers",
  "themes",
  "courses",
  "production",
  "fournisseurs",
  "factures",
  "mercuriales",
  "commandes",
  "ventes",
  "imports",
  "import-recipekeeper",
  "import-json",
  "import-video",
] as const;
export type ModuleCle = (typeof MODULE_CLES)[number];

/** Sous-module → module parent (même arbre que le panel). */
export const PARENT: Partial<Record<ModuleCle, ModuleCle>> = {
  roles: "utilisateurs",
  factures: "fournisseurs",
  mercuriales: "fournisseurs",
  commandes: "fournisseurs",
  ventes: "fournisseurs",
  "import-recipekeeper": "imports",
  "import-json": "imports",
  "import-video": "imports",
};

const estCle = (v: unknown): v is ModuleCle => typeof v === "string" && (MODULE_CLES as readonly string[]).includes(v);

/** Cases décochées → modules vraiment coupés (un parent coupé coupe ses sous-modules ; « Imports » sans aucun sous-module allumé est coupé). */
export function modulesEffectifs(decoches: Iterable<string>): Set<ModuleCle> {
  const off = new Set<ModuleCle>();
  for (const c of decoches) if (estCle(c)) off.add(c);
  for (const c of MODULE_CLES) {
    const p = PARENT[c];
    if (p && off.has(p)) off.add(c);
  }
  if (off.has("import-recipekeeper") && off.has("import-json") && off.has("import-video")) off.add("imports");
  return off;
}

/** Permissions retirées à tout le monde quand un module est coupé (boutons et menus marqués data-needs, can()). */
export const PERMISSIONS_DU_MODULE: Partial<Record<ModuleCle, Permission[]>> = {
  utilisateurs: ["accounts.manage"],
  cahiers: ["cookbooks.edit"],
  courses: ["shopping.edit"],
  production: ["production.edit"],
  fournisseurs: ["costs.view", "costs.edit"],
  imports: ["import.run"],
};

export function permissionsSansModules(perms: Permission[], off: Set<ModuleCle>): Permission[] {
  const retirees = new Set<Permission>();
  for (const m of off) for (const p of PERMISSIONS_DU_MODULE[m] ?? []) retirees.add(p);
  return retirees.size ? perms.filter((p) => !retirees.has(p)) : perms;
}

/** Pages (et API) de chaque module : du plus précis au plus large. */
const ROUTES: [string, ModuleCle][] = [
  ["/settings/comptes", "utilisateurs"],
  ["/fournisseurs/commandes", "commandes"],
  ["/api/commandes", "commandes"],
  ["/produits-vendus", "ventes"],
  ["/factures", "factures"],
  ["/api/factures", "factures"],
  ["/fournisseurs", "fournisseurs"],
  ["/settings/ingredients/prix", "fournisseurs"],
  ["/settings/ia", "fournisseurs"],
  ["/cookbooks", "cahiers"],
  ["/api/cookbooks", "cahiers"],
  ["/settings/themes", "themes"],
  ["/shopping", "courses"],
  ["/production", "production"],
  ["/settings/import-recipekeeper", "import-recipekeeper"],
  ["/settings/import-json", "import-json"],
  ["/settings/export", "import-json"],
  ["/settings/import-video", "import-video"],
];

/** Le module d'une adresse (null = toujours là). /fournisseurs/12/commande = commandes. */
export function moduleDeLaPage(path: string): ModuleCle | null {
  if (/^\/fournisseurs\/\d+\/commande(\/|$)/.test(path)) return "commandes";
  for (const [prefixe, m] of ROUTES) if (path === prefixe || path.startsWith(`${prefixe}/`)) return m;
  return null;
}

/** Outils Claude (MCP) de chaque module ; les autres outils restent toujours proposés. */
const OUTILS: Record<string, ModuleCle> = {
  lister_cahiers: "cahiers",
  voir_cahier: "cahiers",
  creer_cahier: "cahiers",
  ajouter_recettes_cahier: "cahiers",
  ajouter_chapitre_cahier: "cahiers",
  retirer_recette_cahier: "cahiers",
  supprimer_cahier: "cahiers",
  lister_listes_courses: "courses",
  voir_liste_courses: "courses",
  creer_liste_courses: "courses",
  ajouter_recette_a_liste: "courses",
  retirer_recette_de_liste: "courses",
  ajouter_article_liste: "courses",
  cocher_articles: "courses",
  ranger_liste_courses: "courses",
  supprimer_liste_courses: "courses",
  voir_fiche_production: "production",
  ajouter_a_production: "production",
  modifier_production: "production",
  retirer_de_production: "production",
  comparer_prix_fournisseurs: "fournisseurs",
  voir_fournisseur: "fournisseurs",
  historique_prix: "fournisseurs",
  ranger_produits: "fournisseurs",
  relier_produit_ingredient: "fournisseurs",
  creer_fournisseur: "fournisseurs",
  modifier_fournisseur: "fournisseurs",
  supprimer_fournisseur: "fournisseurs",
  ajouter_produit_fournisseur: "fournisseurs",
  modifier_produit_fournisseur: "fournisseurs",
  supprimer_produit_fournisseur: "fournisseurs",
  ajouter_prix: "fournisseurs",
  corriger_prix: "fournisseurs",
  supprimer_prix: "fournisseurs",
  regrouper_produits: "fournisseurs",
  fusionner_produits: "fournisseurs",
  enregistrer_facture: "factures",
  lister_factures_a_traiter: "factures",
  voir_facture_a_traiter: "factures",
  supprimer_facture_a_traiter: "factures",
  joindre_fichier_facture: "factures",
  lister_factures: "factures",
  voir_facture: "factures",
  supprimer_facture: "factures",
  modifier_facture: "factures",
  enregistrer_mercuriale: "mercuriales",
  passer_commande: "commandes",
  lister_commandes: "commandes",
  a_commander_aujourd_hui: "commandes",
  voir_commande: "commandes",
  supprimer_commande: "commandes",
  produits_vendus: "ventes",
  importer_recettes_json: "import-json",
  exporter_recettes_json: "import-json",
  lire_video: "import-video",
};

export function moduleDeLOutil(nom: string): ModuleCle | null {
  return OUTILS[nom] ?? null;
}

// ------------------------------------------------------------ lecture sur la passerelle

/** Limites réglées dans le panel (sous la flèche de chaque module). Absente = pas de limite. */
export type Limites = {
  recettes?: number;
  fichiersMo?: number;
  roles?: number;
  cahiers?: number;
  themes?: number;
  /** « Fait avec RecipeLog » en bas des PDF. */
  marquePdf?: boolean;
  mercurialePages?: number;
  videosMois?: number;
};

const NOMBRES = ["recettes", "fichiersMo", "roles", "cahiers", "themes", "mercurialePages", "videosMois"] as const;

export function lireLimites(v: unknown): Limites {
  const out: Limites = {};
  if (!v || typeof v !== "object") return out;
  const o = v as Record<string, unknown>;
  for (const k of NOMBRES) {
    const n = o[k];
    if (typeof n === "number" && Number.isInteger(n) && n > 0) out[k] = n;
  }
  if (o.marquePdf === true) out.marquePdf = true;
  return out;
}

type Etat = { off: Set<ModuleCle>; limites: Limites };
let cache: (Etat & { jusqua: number }) | null = null;

/**
 * Modules coupés et limites de ce site. Lu sur la passerelle et gardé une minute ; si elle
 * ne répond pas, on garde la dernière réponse (ou tout allumé) : on ne coupe jamais par erreur.
 */
async function etat(): Promise<Etat> {
  const url = process.env.RECIPELOG_PASSERELLE_URL?.trim().replace(/\/+$/, "");
  const cle = process.env.RECIPELOG_PASSERELLE_CLE?.trim();
  if (!url || !cle) return { off: new Set(), limites: {} };
  if (cache && Date.now() < cache.jusqua) return cache;
  try {
    const r = await fetch(`${url}/v1/modules`, {
      headers: { Authorization: `Bearer ${cle}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    // Ancienne passerelle (404) : pas de modules, tout est allumé.
    if (r.status === 404) {
      cache = { off: new Set(), limites: {}, jusqua: Date.now() + 60_000 };
      return cache;
    }
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { coupes?: unknown; limites?: unknown };
    const off = modulesEffectifs(Array.isArray(j.coupes) ? j.coupes.filter((x): x is string => typeof x === "string") : []);
    cache = { off, limites: lireLimites(j.limites), jusqua: Date.now() + 60_000 };
    return cache;
  } catch {
    cache = { off: cache?.off ?? new Set<ModuleCle>(), limites: cache?.limites ?? {}, jusqua: Date.now() + 15_000 };
    return cache;
  }
}

export async function modulesCoupes(): Promise<Set<ModuleCle>> {
  return (await etat()).off;
}

export async function limites(): Promise<Limites> {
  return (await etat()).limites;
}

export async function moduleActif(m: ModuleCle): Promise<boolean> {
  return !(await modulesCoupes()).has(m);
}

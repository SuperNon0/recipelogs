/**
 * Liste des permissions qu'un rôle peut recevoir (Réglages → Comptes → Rôles).
 * L'administrateur crée ses rôles (Apprenti, Chef…) et coche ce que chacun
 * peut faire. Fichier sans accès à la base : utilisable côté client.
 *
 * Ajouter une permission = une entrée ici, puis la garde correspondante
 * (requireAccess dans les Server Actions, requirePage dans les pages).
 * Les rôles déjà créés ne l'ont pas tant qu'on ne la coche pas.
 */

export const PERMISSIONS = [
  {
    key: "recipes.view_all",
    group: "Recettes",
    label: "Voir toutes les recettes",
    help: "Coché : le rôle voit toutes les recettes. Décoché : il ne voit que les recettes des catégories choisies juste en dessous (par exemple « Maison Chanka »), et les sous-recettes qu'elles utilisent. Les cahiers qui contiennent une recette cachée et le reste de la production lui sont aussi cachés.",
  },
  {
    key: "recipes.edit",
    group: "Recettes",
    label: "Créer et modifier des recettes",
    help: "Créer une recette, la modifier, la dupliquer, gérer ses sous-recettes et ses variantes, la mettre en favori, la ranger dans un dossier et ajouter des commentaires.",
  },
  {
    key: "recipes.delete",
    group: "Recettes",
    label: "Supprimer des recettes",
    help: "Supprimer définitivement une ou plusieurs recettes.",
  },
  {
    key: "costs.view",
    group: "Prix et chiffres",
    label: "Voir les prix et les coûts",
    help: "Voir le prix d'achat des ingrédients, le coût de revient des recettes et le prix de vente conseillé. Sans cette permission, ces chiffres n'apparaissent nulle part.",
  },
  {
    key: "costs.edit",
    group: "Prix et chiffres",
    label: "Modifier les prix",
    help: "Changer le prix d'achat des ingrédients et le coefficient de prix de vente d'une recette. Va avec « Voir les prix et les coûts ».",
  },
  {
    key: "cookbooks.edit",
    group: "Cahiers, courses, production",
    label: "Gérer les cahiers",
    help: "Créer, modifier et supprimer les cahiers de recettes (chapitres, ordre, recettes figées).",
  },
  {
    key: "shopping.edit",
    group: "Cahiers, courses, production",
    label: "Gérer les listes de courses",
    help: "Créer et supprimer des listes de courses, y ajouter des recettes ou des articles, cocher ce qui est acheté.",
  },
  {
    key: "production.edit",
    group: "Cahiers, courses, production",
    label: "Gérer la production",
    help: "Ajouter des recettes à la page Production, changer les quantités à produire, vider la production.",
  },
  {
    key: "pdf.export",
    group: "Cahiers, courses, production",
    label: "Imprimer en PDF",
    help: "Télécharger ou imprimer les recettes, les cahiers, les listes de courses et les fiches de production en PDF.",
  },
  {
    key: "organize.edit",
    group: "Rangement et import",
    label: "Ranger : dossiers, catégories, ingrédients, thèmes",
    help: "Créer, renommer et supprimer les dossiers et les catégories, gérer les fiches d'ingrédients (noms, fusions, allergènes, poids d'une pièce) et les thèmes des PDF.",
  },
  {
    key: "import.run",
    group: "Rangement et import",
    label: "Importer des recettes",
    help: "Importer des recettes depuis un fichier JSON ou une sauvegarde Recipe Keeper.",
  },
  {
    key: "accounts.manage",
    group: "Administration",
    label: "Gérer les comptes et les rôles",
    help: "Accepter ou refuser les demandes d'accès, bloquer ou supprimer un compte, créer et modifier les rôles, « voir comme » un autre compte, régler la connexion Cloudflare.",
  },
  {
    key: "site.update",
    group: "Administration",
    label: "Mettre à jour le site",
    help: "Utiliser le bouton « Mettre à jour le site », changer le lien du logo et le partage public.",
  },
  {
    key: "mcp.manage",
    group: "Administration",
    label: "Gérer l'accès Claude (MCP)",
    help: "Voir, créer, changer ou couper la clé secrète qui permet à Claude de lire et modifier RecipeLog.",
  },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

/** read : simplement consulter le site (tout compte actif ayant un rôle). */
export type Access = "read" | Permission;

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

export function isPermission(v: unknown): v is Permission {
  return typeof v === "string" && (ALL_PERMISSIONS as string[]).includes(v);
}

/** Garde seulement les clés connues (une permission retirée du code disparaît des rôles). */
export function cleanPermissions(list: readonly unknown[]): Permission[] {
  return ALL_PERMISSIONS.filter((p) => list.includes(p));
}

/** Permissions effectives d'un rôle : toutes pour le rôle Administrateur. */
export function rolePermissions(role: { isAdmin: boolean; permissions: readonly string[] } | null): Permission[] {
  if (!role) return [];
  return role.isAdmin ? [...ALL_PERMISSIONS] : cleanPermissions(role.permissions);
}

export function permissionGroups(): { group: string; items: (typeof PERMISSIONS)[number][] }[] {
  const out: { group: string; items: (typeof PERMISSIONS)[number][] }[] = [];
  for (const p of PERMISSIONS) {
    const g = out.find((x) => x.group === p.group);
    if (g) g.items.push(p);
    else out.push({ group: p.group, items: [p] });
  }
  return out;
}

export const STATUS_LABEL = {
  pending: "En attente",
  active: "Actif",
  refused: "Refusé",
  blocked: "Bloqué",
} as const;

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { recipeMass } from "./massAdjust";
import type { TreeNode } from "./recipeTree";
import { allergensOf, costOfIngredient, loadIngredientInfo, pieceWeightOf } from "./ingredientInfo";

export function normalizeForSearch(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export type RecipeListItem = {
  id: number;
  name: string;
  photoPath: string | null;
  favorite: boolean;
  rating: number | null;
  totalMassG: number;
  tags: string[];
  categories: { id: number; name: string; color: string }[];
  folderId: number | null;
  /** Nombre de sous-recettes utilisées par cette recette. */
  subCount: number;
  /** Nombre de variantes rangées sous cette recette. */
  variantCount: number;
  updatedAt: Date;
};

export async function listRecipes(opts: {
  q?: string;
  tag?: string;
  categoryId?: number;
  favoritesOnly?: boolean;
  /** Filtre par dossier : number = ce dossier, "none" = sans dossier, undefined = tous. */
  folderId?: number | "none";
  /** Montrer aussi les variantes (sinon rangées sous leur recette, sauf en recherche). */
  withVariants?: boolean;
}): Promise<RecipeListItem[]> {
  const where: Prisma.RecipeWhereInput = {};
  if (!opts.withVariants && !hasSearchFilter(opts)) where.variantTargets = { none: {} };

  if (opts.q && opts.q.trim()) {
    const normalized = normalizeForSearch(opts.q);
    where.OR = [
      { nameNormalized: { contains: normalized, mode: "insensitive" } },
      { name: { contains: opts.q.trim(), mode: "insensitive" } },
    ];
  }
  if (opts.favoritesOnly) where.favorite = true;
  if (opts.tag) where.tags = { some: { name: opts.tag } };
  if (opts.categoryId) {
    where.categories = { some: { categoryId: opts.categoryId } };
  }
  if (opts.folderId === "none") {
    where.folderId = null;
  } else if (typeof opts.folderId === "number") {
    where.folderId = opts.folderId;
  }

  const recipes = await prisma.recipe.findMany({
    where,
    include: {
      tags: true,
      categories: { include: { category: true } },
      ingredients: { select: { name: true, quantityG: true, quantityGMax: true, unit: true } },
      _count: { select: { parentLinks: true, variantSources: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const info = await loadIngredientInfo(
    recipes.flatMap((r) => r.ingredients.filter((i) => i.unit === "pièce").map((i) => i.name ?? "")),
  );

  return recipes.map((r) => ({
    id: r.id,
    name: r.name,
    photoPath: r.photoPath,
    favorite: r.favorite,
    rating: r.rating,
    totalMassG: recipeMass(
      r.ingredients.map((i) => ({ ...i, pieceG: pieceWeightOf(info, i.name ?? "") })),
    ).avg,
    tags: r.tags.map((t) => t.name),
    categories: r.categories.map((c) => ({
      id: c.category.id,
      name: c.category.name,
      color: c.category.color,
    })),
    folderId: r.folderId,
    subCount: r._count.parentLinks,
    variantCount: r._count.variantSources,
    updatedAt: r.updatedAt,
  }));
}

/** Recherche ou filtre actif : les variantes sont alors montrées comme les autres recettes. */
function hasSearchFilter(opts: { q?: string; tag?: string; categoryId?: number; favoritesOnly?: boolean }): boolean {
  return !!(opts.q?.trim() || opts.tag || opts.categoryId || opts.favoritesOnly);
}

/** Nombre de variantes rangées sous leur recette (donc absentes de la liste), dans un dossier ou partout. */
export async function countHiddenVariants(folderId?: number | "none"): Promise<number> {
  return prisma.recipe.count({
    where: {
      variantTargets: { some: {} },
      ...(folderId === "none" ? { folderId: null } : typeof folderId === "number" ? { folderId } : {}),
    },
  });
}

/** Lignes sérialisables (date en texte ISO) pour le tableau des recettes. */
export function toRecipeRows(list: RecipeListItem[]) {
  return list.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function listAllFolders() {
  return prisma.folder.findMany({
    orderBy: { name: "asc" },
    include: {
      // Les variantes sont rangées sous leur recette : elles ne comptent pas dans le dossier.
      _count: { select: { recipes: { where: { variantTargets: { none: {} } } } } },
    },
  });
}

export type FolderWithCount = Awaited<ReturnType<typeof listAllFolders>>[number];

export async function getRecipeDetail(id: number) {
  return prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: {
        orderBy: { position: "asc" },
        include: { ingredientBase: true },
      },
      stepsBlock: true,
      tags: true,
      folder: true,
      categories: { include: { category: true } },
      comments: { orderBy: { createdAt: "desc" } },
      // Recettes qui utilisent celle-ci comme sous-recette.
      childLinks: {
        orderBy: { parent: { name: "asc" } },
        select: { id: true, label: true, parent: { select: { id: true, name: true } } },
      },
      parentLinks: {
        orderBy: { position: "asc" },
        include: {
          child: {
            include: {
              ingredients: {
                orderBy: { position: "asc" },
                include: { ingredientBase: true },
              },
              stepsBlock: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Charge l'arbre complet d'une recette : ses ingrédients et, récursivement, ses
 * sous-recettes à tous les niveaux. `visited` casse les cycles éventuels
 * (une recette qui se contiendrait indirectement elle-même).
 */
export async function loadRecipeTree(recipeId: number): Promise<TreeNode | null> {
  const tree = await loadTreeNode(recipeId, new Set());
  if (tree) await attachIngredientInfo(tree);
  return tree;
}

/** Tous les nœuds d'un arbre (la racine puis ses sous-recettes, à tous les niveaux). */
export function treeNodes(node: TreeNode): TreeNode[] {
  return [node, ...node.subLinks.flatMap((l) => treeNodes(l.child))];
}

/** Complète les ingrédients de l'arbre avec leur fiche (poids par pièce, allergènes, prix). 1 requête. */
async function attachIngredientInfo(tree: TreeNode) {
  const nodes = treeNodes(tree);
  const info = await loadIngredientInfo(nodes.flatMap((n) => n.ingredients.map((i) => i.name)));
  for (const n of nodes) {
    for (const ing of n.ingredients) {
      if (ing.unit === "titre") continue; // intertitre : pas un ingrédient
      ing.pieceG = pieceWeightOf(info, ing.name);
      ing.allergens = allergensOf(info, ing.name);
      ing.cost = costOfIngredient(info, ing.name);
    }
  }
}

async function loadTreeNode(recipeId: number, visited: Set<number>): Promise<TreeNode | null> {
  if (visited.has(recipeId)) return null;
  const next = new Set(visited);
  next.add(recipeId);

  const r = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      ingredients: { orderBy: { position: "asc" }, include: { ingredientBase: true } },
      stepsBlock: true,
      parentLinks: { orderBy: { position: "asc" } },
    },
  });
  if (!r) return null;

  const subLinks = [];
  for (const link of r.parentLinks) {
    const child = await loadTreeNode(link.childId, next);
    if (!child) continue; // cycle ou enfant introuvable → ignoré
    subLinks.push({
      id: link.id,
      label: link.label,
      childId: link.childId,
      childName: child.name,
      calcMode: link.calcMode,
      calcValue: Number(link.calcValue),
      pivotIngredientId: link.pivotIngredientId,
      isLocked: link.isLocked,
      isExact: link.isExact,
      child,
    });
  }

  return {
    id: r.id,
    name: r.name,
    steps: r.stepsBlock?.content ?? null,
    ingredients: r.ingredients.map((i) => ({
      id: i.id,
      name: i.name ?? i.ingredientBase?.name ?? "—",
      quantityG: Number(i.quantityG),
      quantityGMax: i.quantityGMax != null ? Number(i.quantityGMax) : null,
      unit: i.unit ?? "g",
    })),
    subLinks,
  };
}

export async function listAllIngredientBases() {
  const bases = await prisma.ingredientBase.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true, createdAt: true, updatedAt: true },
  });

  // Compte les recettes distinctes par base : lien direct OU correspondance de nom (insensible à la casse)
  const rows: { id: number; recipe_count: bigint }[] = await prisma.$queryRaw`
    SELECT ib.id, COUNT(DISTINCT i.recipe_id) AS recipe_count
    FROM ingredients_base ib
    LEFT JOIN ingredients i
      ON i.ingredient_base_id = ib.id
      OR LOWER(i.name) = LOWER(ib.name)
    GROUP BY ib.id
  `;
  const countMap = new Map(rows.map((r) => [r.id, Number(r.recipe_count)]));

  return bases.map((b) => ({
    ...b,
    _count: { usages: countMap.get(b.id) ?? 0 },
  }));
}

export async function getIngredientBaseDetail(id: number) {
  const base = await prisma.ingredientBase.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      defaultUnit: true,
      pieceG: true,
      allergens: true,
      price: true,
      priceUnit: true,
      prices: { orderBy: { createdAt: "desc" }, take: 6, select: { price: true, priceUnit: true, createdAt: true } },
    },
  });
  if (!base) return null;

  // Recettes qui utilisent cet ingrédient (par ID ou par nom insensible à la casse)
  const usages = await prisma.ingredient.findMany({
    where: {
      OR: [
        { ingredientBaseId: id },
        { name: { equals: base.name, mode: "insensitive" } },
      ],
    },
    select: {
      recipeId: true,
      name: true,
      quantityG: true,
      unit: true,
      recipe: { select: { id: true, name: true } },
    },
    distinct: ["recipeId"],
    orderBy: { recipe: { name: "asc" } },
  });

  // Recettes qui l'utilisent à travers une sous-recette (à tous les niveaux).
  const links = await prisma.subRecipe.findMany({ select: { parentId: true, childId: true, label: true } });
  const via = new Map<number, string>();
  let frontier = usages.map((u) => u.recipeId);
  const reached = new Set(frontier);
  while (frontier.length) {
    const next: number[] = [];
    for (const l of links) {
      if (frontier.includes(l.childId) && !reached.has(l.parentId)) {
        reached.add(l.parentId);
        via.set(l.parentId, l.label);
        next.push(l.parentId);
      }
    }
    frontier = next;
  }
  const viaRecipes = via.size
    ? await prisma.recipe.findMany({ where: { id: { in: [...via.keys()] } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];

  return {
    base: {
      id: base.id,
      name: base.name,
      pieceG: base.pieceG != null ? Number(base.pieceG) : null,
      allergens: base.allergens,
      price: base.price != null ? Number(base.price) : null,
      priceUnit: base.priceUnit ?? (base.defaultUnit === "pièce" ? "pièce" : base.defaultUnit === "L" ? "L" : "kg"),
      priceHistory: base.prices.map((p) => ({ price: Number(p.price), unit: p.priceUnit, date: p.createdAt.toISOString() })),
    },
    recipes: usages.map((u) => ({
      id: u.recipe.id,
      name: u.recipe.name,
      ingredientName: u.name ?? base.name,
      quantityG: Number(u.quantityG),
      unit: u.unit,
    })),
    viaRecipes: viaRecipes.map((r) => ({ id: r.id, name: r.name, via: via.get(r.id) ?? "" })),
  };
}

/** Tous les ingrédients avec leur prix actuel et le précédent (page « Prix des ingrédients »). */
export async function listIngredientPrices() {
  const bases = await prisma.ingredientBase.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      defaultUnit: true,
      price: true,
      priceUnit: true,
      prices: { orderBy: { createdAt: "desc" }, take: 2, select: { price: true, priceUnit: true, createdAt: true } },
    },
  });
  return bases.map((b) => {
    const [cur, prev] = b.prices;
    return {
      id: b.id,
      name: b.name,
      price: b.price != null ? Number(b.price) : null,
      priceUnit: b.priceUnit ?? (b.defaultUnit === "pièce" ? "pièce" : b.defaultUnit === "L" ? "L" : "kg"),
      since: b.price != null && cur ? cur.createdAt.toISOString() : null,
      previous: b.price != null && prev ? { price: Number(prev.price), unit: prev.priceUnit } : null,
    };
  });
}

export async function listAllTags(): Promise<string[]> {
  const rows = await prisma.tag.findMany({
    distinct: ["name"],
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => r.name);
}

export async function listAllCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

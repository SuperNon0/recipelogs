import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

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
  updatedAt: Date;
};

export async function listRecipes(opts: {
  q?: string;
  tag?: string;
  categoryId?: number;
  favoritesOnly?: boolean;
  /** Filtre par dossier : number = ce dossier, "none" = sans dossier, undefined = tous. */
  folderId?: number | "none";
}): Promise<RecipeListItem[]> {
  const where: Prisma.RecipeWhereInput = {};

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
      ingredients: { select: { quantityG: true, quantityGMax: true, unit: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return recipes.map((r) => ({
    id: r.id,
    name: r.name,
    photoPath: r.photoPath,
    favorite: r.favorite,
    rating: r.rating,
    totalMassG: r.ingredients.reduce((sum, ing) => {
      const q = ing.quantityGMax != null
        ? (Number(ing.quantityG) + Number(ing.quantityGMax)) / 2
        : Number(ing.quantityG);
      if (!ing.unit || ing.unit === "g") return sum + q;
      if (ing.unit === "cc") return sum + q * 5;
      if (ing.unit === "cs") return sum + q * 15;
      return sum;
    }, 0),
    tags: r.tags.map((t) => t.name),
    categories: r.categories.map((c) => ({
      id: c.category.id,
      name: c.category.name,
      color: c.category.color,
    })),
    folderId: r.folderId,
    updatedAt: r.updatedAt,
  }));
}

export async function listAllFolders() {
  return prisma.folder.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { recipes: true } },
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
      categories: { include: { category: true } },
      comments: { orderBy: { createdAt: "desc" } },
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

export async function listRecipesMinimal(excludeId?: number) {
  const where = excludeId ? { id: { not: excludeId } } : undefined;
  const recipes = await prisma.recipe.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return recipes;
}

export async function listAllIngredientBases() {
  const bases = await prisma.ingredientBase.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, createdAt: true },
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
    select: { id: true, name: true },
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
      recipe: { select: { id: true, name: true } },
    },
    distinct: ["recipeId"],
    orderBy: { recipe: { name: "asc" } },
  });

  return {
    base,
    recipes: usages.map((u) => ({ id: u.recipe.id, name: u.recipe.name, ingredientName: u.name })),
  };
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

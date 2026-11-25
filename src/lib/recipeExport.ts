import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Export des recettes au format de l'import JSON (Réglages → Import JSON), pour les
 * copier dans un autre RecipeLog. Les sous-recettes sont décrites par le nom de la
 * recette utilisée (sub_recipes) : l'import les relie si cette recette est dans le
 * fichier ou existe déjà là-bas.
 */
export type ExportSubRecipe = {
  recipe: string;
  label: string;
  calc_mode: "coefficient" | "mass_target" | "pivot_ingredient";
  calc_value: number;
  /** Ingrédient pivot : sa place (0, 1…) dans la sous-recette. */
  pivot_position: number | null;
  is_locked: boolean;
  is_exact: boolean;
  position: number;
};

export type ExportRecipe = {
  id: number;
  name: string;
  ingredients: { name: string; quantity: number; quantity_max?: number; unit: string }[];
  steps: string;
  notes: string | null;
  source: string | null;
  folder: string | null;
  folder_color: string | null;
  categories: string[];
  category_colors: Record<string, string>;
  tags: string[];
  favorite: boolean;
  rating: number | null;
  yield_count: number | null;
  yield_label: string | null;
  sale_coef: number | null;
  sale_price: number | null;
  sale_vat: number | null;
  mold: unknown;
  sub_recipes: ExportSubRecipe[];
};

/** Fichier d'export : l'import reconnaît ce format et crée les dossiers et catégories qui manquent. */
export type ExportFile = { recipelog_export: 1; exporte_le: string; recettes: ExportRecipe[] };

const INCLUDE = {
  ingredients: { orderBy: { position: "asc" } },
  stepsBlock: true,
  tags: true,
  folder: { select: { name: true, color: true } },
  categories: { include: { category: { select: { name: true, color: true } } } },
  parentLinks: { orderBy: { position: "asc" }, include: { child: { select: { name: true, ingredients: { select: { id: true }, orderBy: { position: "asc" } } } } } },
} satisfies Prisma.RecipeInclude;

/**
 * Recettes demandées (et, avec sousRecettes, toutes celles qu'elles utilisent, même
 * plusieurs niveaux plus bas), les sous-recettes d'abord. visible = recettes que le
 * visiteur a le droit de voir (rôle limité à certaines catégories).
 */
export async function exportRecipes(ids: number[], opts: { sousRecettes: boolean; visible: Prisma.RecipeWhereInput }): Promise<ExportRecipe[]> {
  const voulues = new Set(ids);
  if (opts.sousRecettes) {
    let aVoir = [...voulues];
    while (aVoir.length) {
      const liens = await prisma.subRecipe.findMany({ where: { parentId: { in: aVoir } }, select: { childId: true } });
      aVoir = liens.map((l) => l.childId).filter((c) => !voulues.has(c));
      for (const c of aVoir) voulues.add(c);
    }
  }
  const recettes = await prisma.recipe.findMany({
    where: { AND: [{ id: { in: [...voulues] } }, opts.visible] },
    orderBy: { name: "asc" },
    include: INCLUDE,
  });
  // Les sous-recettes avant les recettes qui les utilisent (plus lisible, et l'import n'en dépend pas).
  const parNom = new Map(recettes.map((r) => [r.name, r]));
  const ordre: typeof recettes = [];
  const vues = new Set<number>();
  const placer = (r: (typeof recettes)[number], pile: Set<number>) => {
    if (vues.has(r.id) || pile.has(r.id)) return;
    pile.add(r.id);
    for (const l of r.parentLinks) {
      const enfant = parNom.get(l.child.name);
      if (enfant) placer(enfant, pile);
    }
    vues.add(r.id);
    ordre.push(r);
  };
  for (const r of recettes) placer(r, new Set());

  return ordre.map((r) => ({
    id: r.id,
    name: r.name,
    ingredients: r.ingredients.map((i) => ({
      name: i.name ?? "",
      quantity: Number(i.quantityG),
      ...(i.quantityGMax != null ? { quantity_max: Number(i.quantityGMax) } : {}),
      unit: i.unit,
    })),
    steps: r.stepsBlock?.content ?? "",
    notes: r.notesTips,
    source: r.source,
    folder: r.folder?.name ?? null,
    folder_color: r.folder?.color ?? null,
    categories: r.categories.map((c) => c.category.name),
    category_colors: Object.fromEntries(r.categories.map((c) => [c.category.name, c.category.color])),
    tags: r.tags.map((t) => t.name),
    favorite: r.favorite,
    rating: r.rating,
    yield_count: r.yieldCount,
    yield_label: r.yieldLabel,
    sale_coef: r.saleCoef != null ? Number(r.saleCoef) : null,
    sale_price: r.salePrice != null ? Number(r.salePrice) : null,
    sale_vat: r.saleVat != null ? Number(r.saleVat) : null,
    mold: r.mold ?? null,
    sub_recipes: r.parentLinks.map((l) => {
      const p = l.pivotIngredientId != null ? l.child.ingredients.findIndex((i) => i.id === l.pivotIngredientId) : -1;
      return {
        recipe: l.child.name,
        label: l.label,
        calc_mode: l.calcMode,
        calc_value: Number(l.calcValue),
        pivot_position: p >= 0 ? p : null,
        is_locked: l.isLocked,
        is_exact: l.isExact,
        position: l.position,
      };
    }),
  }));
}

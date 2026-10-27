import { prisma } from "./prisma";

/**
 * Ce que la fiche d'un ingrédient (Réglages → Ingrédients) apporte aux calculs
 * des recettes. Les lignes d'une recette sont reliées à la base par leur nom
 * (insensible à la casse), comme partout ailleurs dans l'app.
 */
export type IngredientInfo = {
  /** Poids d'une pièce en grammes (unité « pièce »). */
  pieceG: number | null;
  /** Allergènes INCO cochés (clés de lib/allergens.ts). */
  allergens: string[];
};

const key = (name: string) => name.trim().toLowerCase();

/** Infos des ingrédients nommés, indexées par nom en minuscules. 1 requête. */
export async function loadIngredientInfo(names: Iterable<string>): Promise<Map<string, IngredientInfo>> {
  const wanted = [...new Set([...names].map((n) => n.trim()).filter(Boolean))];
  const out = new Map<string, IngredientInfo>();
  if (wanted.length === 0) return out;
  const bases = await prisma.ingredientBase.findMany({
    where: { name: { in: wanted, mode: "insensitive" } },
    select: { name: true, pieceG: true, allergens: true },
  });
  for (const b of bases) {
    out.set(key(b.name), { pieceG: b.pieceG != null ? Number(b.pieceG) : null, allergens: b.allergens });
  }
  return out;
}

/** Poids d'une pièce d'un ingrédient (null si inconnu ou si l'unité n'est pas « pièce »). */
export function pieceWeightOf(
  info: Map<string, IngredientInfo>,
  name: string,
  unit: string | null | undefined,
): number | null {
  if (unit !== "pièce") return null;
  return info.get(key(name))?.pieceG ?? null;
}

/** Poids par pièce de tous les ingrédients qui en ont un (pour le formulaire de recette). */
export async function listPieceWeights(): Promise<Record<string, number>> {
  const rows = await prisma.ingredientBase.findMany({
    where: { pieceG: { not: null } },
    select: { name: true, pieceG: true },
  });
  return Object.fromEntries(rows.map((r) => [key(r.name), Number(r.pieceG)]));
}

/** Allergènes d'un ingrédient d'après sa fiche (liste vide si inconnu). */
export function allergensOf(info: Map<string, IngredientInfo>, name: string): string[] {
  return info.get(key(name))?.allergens ?? [];
}

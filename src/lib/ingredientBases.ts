import { prisma } from "./prisma";

/**
 * Ajoute dans `ingredients_base` les noms absents (comparaison insensible à
 * la casse : « Lait » et « lait » ne créent qu'une entrée).
 * Idempotent, en 2 requêtes quel que soit le nombre de noms.
 */
export async function ensureIngredientBases(names: string[]): Promise<number> {
  const byLower = new Map<string, string>();
  for (const raw of names) {
    const n = raw.trim();
    if (n && !byLower.has(n.toLowerCase())) byLower.set(n.toLowerCase(), n);
  }
  if (byLower.size === 0) return 0;

  const existing = await prisma.ingredientBase.findMany({
    where: { name: { in: [...byLower.values()], mode: "insensitive" } },
    select: { name: true },
  });
  for (const e of existing) byLower.delete(e.name.toLowerCase());
  if (byLower.size === 0) return 0;

  const { count } = await prisma.ingredientBase.createMany({
    data: [...byLower.values()].map((name) => ({ name })),
    skipDuplicates: true,
  });
  return count;
}

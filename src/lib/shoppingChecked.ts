type Item = { name: string; unit: string | null; quantityG: number | null; checked: boolean; recipeId: number | null };
type NextItem = { name: string; unit: string; quantityG: number | null };

const key = (item: { name: string; unit: string | null }) => `${item.name.trim().toLowerCase()}|${item.unit ?? "g"}`;

/** Une quantité achetée ne couvre plus la ligne si son besoin augmente. */
export function checkedAfterRegeneration(previous: Item[], next: NextItem[]): Set<string> {
  const bought = new Map<string, number | null>();
  for (const item of previous) {
    if (item.recipeId !== null && item.checked) bought.set(key(item), item.quantityG);
  }
  return new Set(next.filter((item) => {
    const k = key(item);
    if (!bought.has(k)) return false;
    const before = bought.get(k)!;
    return item.quantityG === null ? before === null : before !== null && item.quantityG <= before;
  }).map(key));
}

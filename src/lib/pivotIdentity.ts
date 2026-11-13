type IngredientIdentity = { id: number; name: string | null };

/** A removed or ambiguous pivot must never silently target another ingredient. */
export function matchPivotIngredient<T extends IngredientIdentity>(
  old: IngredientIdentity,
  previous: IngredientIdentity[],
  fresh: T[],
): T {
  const key = (i: IngredientIdentity) => (i.name ?? "").trim().toLowerCase();
  const matches = fresh.filter((i) => key(i) === key(old));
  if (previous.filter((i) => key(i) === key(old)).length !== 1 || matches.length !== 1) {
    throw new Error(`L’ingrédient « ${old.name ?? "sans nom"} » sert de pivot dans une recette parente. Modifie d’abord ce pivot avant de supprimer, renommer ou rendre ambigu cet ingrédient.`);
  }
  return matches[0];
}

import type { TreeNode } from "./recipeTree";

/**
 * Les 14 allergènes à déclaration obligatoire (règlement INCO, annexe II),
 * dans l'ordre officiel. `key` est la valeur enregistrée en base.
 */
export const ALLERGENS = [
  { key: "gluten", label: "Gluten" },
  { key: "crustaces", label: "Crustacés" },
  { key: "oeufs", label: "Œufs" },
  { key: "poissons", label: "Poissons" },
  { key: "arachides", label: "Arachides" },
  { key: "soja", label: "Soja" },
  { key: "lait", label: "Lait" },
  { key: "fruits_a_coque", label: "Fruits à coque" },
  { key: "celeri", label: "Céleri" },
  { key: "moutarde", label: "Moutarde" },
  { key: "sesame", label: "Sésame" },
  { key: "sulfites", label: "Sulfites" },
  { key: "lupin", label: "Lupin" },
  { key: "mollusques", label: "Mollusques" },
] as const;

export type AllergenKey = (typeof ALLERGENS)[number]["key"];

const KEYS = new Set<string>(ALLERGENS.map((a) => a.key));

/** Garde seulement les clés connues, sans doublon, dans l'ordre officiel. */
export function cleanAllergens(keys: readonly string[]): AllergenKey[] {
  const set = new Set(keys.filter((k) => KEYS.has(k)));
  return ALLERGENS.filter((a) => set.has(a.key)).map((a) => a.key);
}

export function allergenLabel(key: string): string {
  return ALLERGENS.find((a) => a.key === key)?.label ?? key;
}

/** Un allergène de la recette et les ingrédients qui l'apportent. */
export type AllergenHit = { key: AllergenKey; label: string; sources: string[] };

/**
 * Allergènes d'une recette, sous-recettes imbriquées comprises (tous niveaux),
 * dans l'ordre officiel. Chaque source est le nom de l'ingrédient, suivi de la
 * sous-recette qui le contient (« Beurre (Crème) »).
 */
export function collectAllergens(node: TreeNode): AllergenHit[] {
  const sources = new Map<string, Set<string>>();
  const walk = (n: TreeNode, where: string | null) => {
    for (const ing of n.ingredients) {
      for (const k of ing.allergens ?? []) {
        if (!sources.has(k)) sources.set(k, new Set());
        sources.get(k)!.add(where ? `${ing.name} (${where})` : ing.name);
      }
    }
    for (const l of n.subLinks) walk(l.child, l.label);
  };
  walk(node, null);
  return ALLERGENS.filter((a) => sources.has(a.key)).map((a) => ({
    key: a.key,
    label: a.label,
    sources: [...sources.get(a.key)!],
  }));
}

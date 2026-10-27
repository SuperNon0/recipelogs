import { z } from "zod";

/**
 * « titre » n'est pas une vraie unité : la ligne est un intertitre (« Pâte »,
 * « Crème »…) dans la liste d'ingrédients, sans quantité, ignoré des calculs.
 */
export const INGREDIENT_UNITS = ["g", "L", "cc", "cs", "pièce", "QS", "titre"] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

/** Vrai si la ligne d'ingrédient est un intertitre de section. */
export const isSectionTitle = (unit: string | null | undefined) => unit === "titre";

export const ingredientInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantityG: z.coerce.number().nonnegative().max(1_000_000),
  quantityGMax: z.coerce.number().nonnegative().max(1_000_000).nullable().optional(),
  unit: z.enum(INGREDIENT_UNITS).default("g"),
  ingredientBaseId: z.coerce.number().int().positive().optional().nullable(),
});

export const recipeFormSchema = z.object({
  name: z.string().trim().min(1).max(200),
  source: z.string().trim().max(500).optional().or(z.literal("")),
  notesTips: z.string().trim().max(5000).optional().or(z.literal("")),
  steps: z.string().trim().max(50_000).optional().or(z.literal("")),
  favorite: z.coerce.boolean().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  categoryIds: z.array(z.coerce.number().int().positive()).optional(),
  folderId: z.coerce.number().int().positive().nullable().optional(),
  yieldCount: z.coerce.number().int().positive().max(100_000).nullable().optional(),
  yieldLabel: z.string().trim().max(80).optional().or(z.literal("")),
  ingredients: z.array(ingredientInputSchema).min(1).max(100),
});

export type RecipeFormInput = z.infer<typeof recipeFormSchema>;

import { z } from "zod";

export const ingredientInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantityG: z.coerce.number().positive().max(1_000_000),
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
  ingredients: z.array(ingredientInputSchema).min(1).max(100),
});

export type RecipeFormInput = z.infer<typeof recipeFormSchema>;

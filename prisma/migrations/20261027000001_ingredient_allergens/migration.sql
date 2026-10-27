-- Allergènes INCO cochés sur les ingrédients de la base.
ALTER TABLE "ingredients_base" ADD COLUMN "allergens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Poids d'une pièce sur les ingrédients de la base, rendement sur les recettes.
ALTER TABLE "ingredients_base" ADD COLUMN "piece_g" DECIMAL(10,3);
ALTER TABLE "recipes" ADD COLUMN "yield_count" INTEGER;
ALTER TABLE "recipes" ADD COLUMN "yield_label" VARCHAR(80);

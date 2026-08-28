-- Fix pivot orphelin :
-- Les SubRecipe stockaient le pivot par ID (`pivot_ingredient_id`), mais
-- `updateRecipe` supprime puis recrée tous les ingrédients d'une recette,
-- ce qui rend chaque référence orpheline. On ajoute une colonne
-- `pivot_ingredient_name` (résolue au nom, robuste aux édits) et on
-- backfill depuis les ingrédients existants tant qu'ils vivent encore.
-- La colonne `pivot_ingredient_id` est conservée pour l'instant (migration
-- douce, rollback trivial ; suppression prévue dans un lot ultérieur).

ALTER TABLE "sub_recipes" ADD COLUMN "pivot_ingredient_name" TEXT;

UPDATE "sub_recipes" sr
SET "pivot_ingredient_name" = i."name"
FROM "ingredients" i
WHERE sr."pivot_ingredient_id" = i."id"
  AND sr."pivot_ingredient_name" IS NULL
  AND i."name" IS NOT NULL;

-- Une recette n'appartient qu'à une seule famille de variantes (doublons éventuels retirés, le plus ancien lien est gardé).
DELETE FROM "variants" v USING "variants" w WHERE v."variant_recipe_id" = w."variant_recipe_id" AND v."id" > w."id";
CREATE UNIQUE INDEX "variants_variant_recipe_id_key" ON "variants"("variant_recipe_id");

-- Fiche de production : rendement au moment de l'ajout (null = multiplicateur), pour que « 60 éclairs » reste 60 éclairs si le rendement change.
ALTER TABLE "production_items" ADD COLUMN "yield_count" INTEGER;
UPDATE "production_items" p SET "yield_count" = r."yield_count" FROM "recipes" r WHERE r."id" = p."recipe_id" AND r."yield_count" > 0;

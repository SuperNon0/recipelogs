-- Activer l'extension unaccent pour la recherche sans accents
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Ajouter nameNormalized pour la recherche insensible aux accents
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "name_normalized" TEXT;

-- Remplir nameNormalized pour les recettes existantes
UPDATE "recipes" SET "name_normalized" = unaccent(LOWER("name")) WHERE "name_normalized" IS NULL;

-- Convertir les ingrédients en mL vers g (1 mL ≈ 1 g)
UPDATE "ingredients" SET "unit" = 'g' WHERE "unit" = 'mL';

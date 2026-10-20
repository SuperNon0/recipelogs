-- Les recettes importées (CSV / HTML) ou dupliquées n'avaient pas de nom
-- normalisé : la recherche sans accents ne les trouvait pas.
UPDATE "recipes" SET "name_normalized" = unaccent(LOWER("name")) WHERE "name_normalized" IS NULL;

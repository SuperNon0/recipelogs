-- Index sur nameNormalized pour accélérer la recherche
CREATE INDEX IF NOT EXISTS "recipes_name_normalized_idx" ON "recipes"("name_normalized");

-- Index sur categoryId pour accélérer le filtre par catégorie
CREATE INDEX IF NOT EXISTS "recipes_categories_category_id_idx" ON "recipes_categories"("category_id");

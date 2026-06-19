-- Accélère la recherche par nom (LIKE/ILIKE) sur la table ingredients_base
-- via un index GIN trigram. Nécessite l'extension pg_trgm (déjà activée).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ingredients_base_name_trgm"
  ON "ingredients_base" USING gin ("name" gin_trgm_ops);

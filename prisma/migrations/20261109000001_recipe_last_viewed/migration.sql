-- Historique : date de la dernière ouverture de chaque recette.
ALTER TABLE "recipes" ADD COLUMN "last_viewed_at" TIMESTAMP(3);

CREATE INDEX "recipes_last_viewed_at_idx" ON "recipes"("last_viewed_at" DESC);

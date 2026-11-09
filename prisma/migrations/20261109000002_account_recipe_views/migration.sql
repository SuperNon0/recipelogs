CREATE TABLE "account_recipe_views" (
  "account_id" INTEGER NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "recipe_id" INTEGER NOT NULL REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("account_id", "recipe_id")
);
CREATE INDEX "account_recipe_views_account_id_viewed_at_idx"
  ON "account_recipe_views"("account_id", "viewed_at" DESC);

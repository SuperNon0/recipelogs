-- Prix d'achat des ingrédients (+ historique) et coefficient de vente des recettes.
ALTER TABLE "ingredients_base" ADD COLUMN "price" DECIMAL(10,4);
ALTER TABLE "ingredients_base" ADD COLUMN "price_unit" TEXT;
ALTER TABLE "recipes" ADD COLUMN "sale_coef" DECIMAL(6,2);

CREATE TABLE "ingredient_prices" (
    "id" SERIAL NOT NULL,
    "base_id" INTEGER NOT NULL,
    "price" DECIMAL(10,4) NOT NULL,
    "price_unit" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingredient_prices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ingredient_prices_base_id_created_at_idx" ON "ingredient_prices"("base_id", "created_at" DESC);
ALTER TABLE "ingredient_prices" ADD CONSTRAINT "ingredient_prices_base_id_fkey" FOREIGN KEY ("base_id") REFERENCES "ingredients_base"("id") ON DELETE CASCADE ON UPDATE CASCADE;

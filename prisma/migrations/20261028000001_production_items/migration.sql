-- Recettes à produire (fiche de production) : une ligne par recette, avec la quantité voulue.
CREATE TABLE "production_items" (
    "id" SERIAL NOT NULL,
    "recipe_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,3) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_items_recipe_id_key" ON "production_items"("recipe_id");

ALTER TABLE "production_items" ADD CONSTRAINT "production_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

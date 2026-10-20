-- Unité des articles de liste de courses (g, cc, cs, pièce, QS…).
-- NULL = grammes (articles existants et articles ajoutés à la main).
ALTER TABLE "shopping_list_items" ADD COLUMN "unit" TEXT;

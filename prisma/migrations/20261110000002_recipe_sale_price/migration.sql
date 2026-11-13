-- Prix de vente d'une recette (produit fini) et TVA comprise dedans, pour calculer la marge.
ALTER TABLE "recipes" ADD COLUMN "sale_price" DECIMAL(10,2);
ALTER TABLE "recipes" ADD COLUMN "sale_vat" DECIMAL(4,2);

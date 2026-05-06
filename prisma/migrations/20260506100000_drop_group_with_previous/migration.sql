-- Suppression de la fonctionnalité « Coller à la précédente » (toggle retiré de l'UI).
ALTER TABLE "cookbooks_recipes" DROP COLUMN "group_with_previous";

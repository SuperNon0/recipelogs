-- Les photos de recettes ne sont plus utilisées : on détache celles déjà importées.
UPDATE "recipes" SET "photo_path" = NULL WHERE "photo_path" IS NOT NULL;

-- Création de la table folders + ajout du folder_id sur recipes.
-- Suppression d'un dossier : les recettes passent en folder_id = NULL (« sans dossier »).

CREATE TABLE "folders" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#888888',
    "icon" TEXT,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "folders_name_key" ON "folders"("name");

ALTER TABLE "recipes" ADD COLUMN "folder_id" INTEGER;

CREATE INDEX "recipes_folder_id_idx" ON "recipes"("folder_id");

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_folder_id_fkey"
  FOREIGN KEY ("folder_id") REFERENCES "folders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

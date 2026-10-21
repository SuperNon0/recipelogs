"use client";

import { useState } from "react";
import { FolderInput, FolderOpen } from "lucide-react";
import { createFolder, updateFolder, deleteFolder } from "@/app/actions/settings";
import { Help } from "@/components/ui/Help";
import { ColoredItemList, type ColoredItem } from "./settings/ColoredItemList";
import { AddRecipesToFolderModal } from "./AddRecipesToFolderModal";

type Folder = {
  id: number;
  name: string;
  color: string;
  _count: { recipes: number };
};

/** Gestion des dossiers : créer, renommer, couleur, ranger des recettes, supprimer. */
export function FolderManager({ folders }: { folders: Folder[] }) {
  const [addingTo, setAddingTo] = useState<ColoredItem | null>(null);
  const items = folders.map((f) => ({ id: f.id, name: f.name, color: f.color, count: f._count.recipes }));

  return (
    <>
      <ColoredItemList
        items={items}
        icon={FolderOpen}
        noun={{ the: "le dossier", of: "du dossier" }}
        newLabel="Nouveau dossier"
        placeholder="Ex. Tartes"
        hrefOf={(f) => `/?folder=${f.id}`}
        extraEntries={(f) => [
          { label: "Ranger des recettes ici…", icon: FolderInput, onSelect: () => setAddingTo(f) },
        ]}
        confirmDelete={(f) =>
          f.count > 0
            ? `Supprimer le dossier « ${f.name} » ?\n\nLes ${f.count} recette${f.count > 1 ? "s" : ""} de ce dossier passeront en « Sans dossier ». Aucune recette ne sera supprimée.`
            : `Supprimer le dossier « ${f.name} » ?`
        }
        create={createFolder}
        update={updateFolder}
        remove={deleteFolder}
        emptyTitle="Aucun dossier"
        emptyText="Crée un dossier pour ranger tes recettes par famille (tartes, entremets…)."
        head={(newButton) => (
          <div className="page-head">
            <h1>
              Dossiers
              <Help title="Dossiers">
                Range tes recettes par famille (tartes, entremets…). Une recette est dans un seul
                dossier, ou dans « Sans dossier ». Clic droit (ou bouton à trois points) sur un
                dossier pour le renommer, changer sa couleur, y ranger des recettes ou le supprimer.
                Supprimer un dossier ne supprime aucune recette.
              </Help>
            </h1>
            {newButton}
            <p className="sub">
              {folders.length} dossier{folders.length > 1 ? "s" : ""} · une recette est rangée dans
              un dossier au plus
            </p>
          </div>
        )}
      />
      {addingTo && <AddRecipesToFolderModal folder={addingTo} onClose={() => setAddingTo(null)} />}
    </>
  );
}

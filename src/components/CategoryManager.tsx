"use client";

import { Tag } from "lucide-react";
import { createCategory, updateCategory, deleteCategory } from "@/app/actions/settings";
import { Help } from "@/components/ui/Help";
import { ColoredItemList } from "./settings/ColoredItemList";

type Category = { id: number; name: string; color: string; count: number };

/** Gestion des catégories : créer, renommer, couleur, supprimer. */
export function CategoryManager({ categories }: { categories: Category[] }) {
  return (
    <ColoredItemList
      items={categories}
      icon={Tag}
      noun={{ the: "la catégorie", of: "de la catégorie" }}
      newLabel="Nouvelle catégorie"
      placeholder="Ex. Chocolat"
      hrefOf={(c) => `/?category=${c.id}`}
      confirmDelete={(c) => `Supprimer la catégorie « ${c.name} » ? Les recettes ne seront pas supprimées.`}
      create={createCategory}
      update={updateCategory}
      remove={deleteCategory}
      emptyTitle="Aucune catégorie"
      emptyText="Crée des catégories pour décrire tes recettes (chocolat, fruits rouges…)."
      head={(newButton) => (
        <div className="page-head">
          <h1>
            Catégories
            <Help title="Catégories">
              Des étiquettes libres pour décrire une recette (chocolat, sans gluten…). Une recette
              peut en avoir plusieurs, contrairement aux dossiers. Elles servent de filtres sur la
              liste des recettes. Supprimer une catégorie ne supprime aucune recette.
            </Help>
          </h1>
          {newButton}
          <p className="sub">
            {categories.length} catégorie{categories.length > 1 ? "s" : ""} · plusieurs possibles par
            recette
          </p>
        </div>
      )}
    />
  );
}

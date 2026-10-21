import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createShoppingList } from "@/app/actions/shopping";
import { Help } from "@/components/ui/Help";

export default function NewShoppingListPage() {
  return (
    <div className="sh-narrow">
      <Link href="/shopping" className="crumb">
        <ChevronLeft size={14} /> Listes de courses
      </Link>
      <div className="page-head">
        <h1>Nouvelle liste</h1>
        <p className="sub">Tu ajouteras ensuite des recettes et des articles depuis la liste.</p>
      </div>

      <form action={createShoppingList} className="fl-card flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center">
            <label htmlFor="sh-name" className="fl-label">
              Nom de la liste
            </label>
            <Help title="Liste de courses">
              Une liste regroupe les ingrédients de plusieurs recettes. Les ingrédients identiques
              sont additionnés en une seule ligne, et tu peux ajouter des articles à la main.
            </Help>
          </div>
          <input
            id="sh-name"
            name="name"
            required
            maxLength={200}
            className="fl-input"
            placeholder="Ex. Commande du lundi"
            autoFocus
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Link href="/shopping" className="fl-btn fl-btn-secondary">
            Annuler
          </Link>
          <button type="submit" className="fl-btn fl-btn-primary">
            Créer la liste
          </button>
        </div>
      </form>
    </div>
  );
}

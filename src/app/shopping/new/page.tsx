import Link from "next/link";
import { createShoppingList } from "@/app/actions/shopping";

export default function NewShoppingListPage() {
  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
          Nouvelle liste
        </h1>
        <Link
          href="/shopping"
          className="fl-label hover:text-[color:var(--text)]"
        >
          ← Retour
        </Link>
      </div>

      <form action={createShoppingList} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="fl-label">Nom de la liste *</span>
          <input
            name="name"
            required
            maxLength={200}
            className="fl-input"
            placeholder="Ex : Commande du lundi"
            autoFocus
          />
        </label>

        <div className="flex gap-2 pt-2">
          <button type="submit" className="fl-btn fl-btn-primary">
            Créer la liste
          </button>
          <Link href="/shopping" className="fl-btn fl-btn-secondary">
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}

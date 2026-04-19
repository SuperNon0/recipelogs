import Link from "next/link";
import { createCookbook } from "@/app/actions/cookbooks";

export default function NewCookbookPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
          Nouveau cahier
        </h1>
        <Link
          href="/cookbooks"
          className="fl-label hover:text-[color:var(--text)]"
        >
          ← Retour
        </Link>
      </div>

      <form action={createCookbook} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="fl-label">Nom du cahier *</span>
          <input
            name="name"
            required
            maxLength={200}
            className="fl-input"
            placeholder="Ex : Mes classiques de l'été"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="fl-label">Description</span>
          <textarea
            name="description"
            rows={3}
            maxLength={2000}
            className="fl-input"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="fl-label">Format</span>
          <select name="format" defaultValue="A4" className="fl-input">
            <option value="A4">A4</option>
            <option value="A5">A5</option>
          </select>
        </label>

        <div className="flex gap-2 pt-2">
          <button type="submit" className="fl-btn fl-btn-primary">
            Créer le cahier
          </button>
          <Link href="/cookbooks" className="fl-btn fl-btn-secondary">
            Annuler
          </Link>
        </div>
      </form>
    </div>
  );
}

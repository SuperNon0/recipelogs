import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { createCookbook } from "@/app/actions/cookbooks";
import { Help } from "@/components/ui/Help";

export default function NewCookbookPage() {
  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/cookbooks" className="crumb">
        <ChevronLeft size={14} /> Cahiers
      </Link>
      <div className="page-head">
        <h1>Nouveau cahier</h1>
        <p className="sub">
          Tu pourras ensuite ajouter des recettes, des chapitres et choisir un thème.
        </p>
      </div>

      <form action={createCookbook} className="fl-card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Nom du cahier</span>
          <input
            name="name"
            required
            maxLength={200}
            className="fl-input"
            placeholder="Ex. mes classiques de l'été"
            autoFocus
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Description (facultatif)</span>
          <textarea name="description" rows={3} maxLength={2000} className="fl-input" placeholder="Affichée sous le titre, sur la couverture" />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label" style={{ display: "flex", alignItems: "center" }}>
            Format de page
            <Help title="Format de page">
              Taille du papier du PDF. A4 = feuille classique (21 × 29,7 cm). A5 = moitié d&apos;A4
              (14,8 × 21 cm), pratique pour un classeur de cuisine. Modifiable plus tard.
            </Help>
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <label className="fl-chip cb-radio">
              <input type="radio" name="format" value="A4" defaultChecked /> A4
            </label>
            <label className="fl-chip cb-radio">
              <input type="radio" name="format" value="A5" /> A5
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
          <Link href="/cookbooks" className="fl-btn fl-btn-secondary">
            Annuler
          </Link>
          <button type="submit" className="fl-btn fl-btn-primary">
            <Plus size={16} /> Créer le cahier
          </button>
        </div>
      </form>
    </div>
  );
}

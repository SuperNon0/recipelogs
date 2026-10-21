"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { Download, FolderOpen, Library, ShoppingBasket, Trash2 } from "lucide-react";
import { ContextArea, MoreButton, type MenuSpec } from "@/components/ui/Menu";
import { ThemeThumb } from "@/components/ThemeThumb";
import { AddCookbookToShoppingListDialog } from "@/components/AddCookbookToShoppingListButton";
import { confirmDeleteCookbook } from "@/components/DeleteCookbookButton";
import { deleteCookbook } from "@/app/actions/cookbooks";
import { RECIPE_LAYOUT_LABELS, type CookbookTheme } from "@/lib/pdf/theme";
import { formatRelativeDate } from "@/lib/format";

export type CookbookCardData = {
  id: number;
  name: string;
  description: string | null;
  format: string;
  recipeCount: number;
  hasCover: boolean;
  hasToc: boolean;
  theme: CookbookTheme;
  /** Date ISO (sérialisable). */
  updatedAt: string;
};

/** Menu d'actions d'un cahier (clic droit, appui long ou bouton « ⋯ »). */
export function useCookbookMenu(cb: { id: number; name: string; recipeCount: number; open?: boolean }) {
  const [shopping, setShopping] = useState(false);
  const [, startTransition] = useTransition();

  const download = useCallback(() => {
    window.location.href = `/cookbooks/${cb.id}/pdf`;
  }, [cb.id]);
  const remove = useCallback(() => {
    if (confirmDeleteCookbook(cb.name)) startTransition(() => deleteCookbook(cb.id));
  }, [cb.id, cb.name]);

  const getSpec = useCallback((): MenuSpec => {
    const openItem = { label: "Ouvrir", icon: FolderOpen, href: `/cookbooks/${cb.id}` };
    const pdf = { label: "Télécharger le PDF", icon: Download, onSelect: download };
    const courses = {
      label: "Ajouter aux courses",
      icon: ShoppingBasket,
      disabled: cb.recipeCount === 0,
      onSelect: () => setShopping(true),
    };
    return {
      title: cb.name,
      icon: Library,
      quick: cb.open === false ? [pdf, courses] : [openItem, pdf, courses],
      items: [
        ...(cb.open === false ? [] : [openItem]),
        pdf,
        courses,
        { separator: true },
        { label: "Supprimer le cahier…", icon: Trash2, danger: true, onSelect: remove },
      ],
    };
  }, [cb.id, cb.name, cb.recipeCount, cb.open, download, remove]);

  const dialogs = shopping ? (
    <AddCookbookToShoppingListDialog
      cookbookId={cb.id}
      cookbookName={cb.name}
      recipeCount={cb.recipeCount}
      onClose={() => setShopping(false)}
    />
  ) : null;

  return { getSpec, dialogs };
}

/** Bouton « ⋯ » de l'en-tête d'un cahier ouvert. */
export function CookbookMoreButton({ id, name, recipeCount }: { id: number; name: string; recipeCount: number }) {
  const menu = useCookbookMenu({ id, name, recipeCount, open: false });
  return (
    <>
      <MoreButton spec={menu.getSpec} label="Plus d'actions sur le cahier" className="fl-btn fl-btn-secondary fl-btn-icon" horizontal />
      {menu.dialogs}
    </>
  );
}

/** Grille des cahiers : vignette du thème, nom, nombre de recettes. */
export function CookbookGrid({ cookbooks }: { cookbooks: CookbookCardData[] }) {
  return (
    <div className="cb-grid">
      {cookbooks.map((c) => (
        <CookbookCard key={c.id} c={c} />
      ))}
    </div>
  );
}

function CookbookCard({ c }: { c: CookbookCardData }) {
  const menu = useCookbookMenu({ id: c.id, name: c.name, recipeCount: c.recipeCount });
  return (
    <ContextArea spec={menu.getSpec} className="cb-card">
      <Link href={`/cookbooks/${c.id}`} className="cb-card-link">
        <div className="cb-card-thumb">
          <ThemeThumb config={c.theme} width={64} />
        </div>
        <div className="cb-card-body">
          <b>{c.name}</b>
          <small style={{ color: "var(--muted)", fontSize: 12 }}>
            {c.recipeCount} recette{c.recipeCount > 1 ? "s" : ""} · modifié {formatRelativeDate(c.updatedAt)}
          </small>
          {c.description && <p>{c.description}</p>}
          <div className="cb-card-meta">
            <span className="fl-tag">{c.format}</span>
            <span className="fl-tag">{RECIPE_LAYOUT_LABELS[c.theme.recipeLayout]}</span>
            {c.hasCover && <span className="fl-tag">Couverture</span>}
            {c.hasToc && <span className="fl-tag">Sommaire</span>}
          </div>
        </div>
      </Link>
      <MoreButton spec={menu.getSpec} label={`Actions pour ${c.name}`} />
      {menu.dialogs}
    </ContextArea>
  );
}

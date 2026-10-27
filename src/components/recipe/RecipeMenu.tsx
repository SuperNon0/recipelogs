"use client";

import { createContext, useCallback, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Copy,
  ExternalLink,
  FileDown,
  FolderInput,
  FolderX,
  GitBranch,
  Library,
  Link2,
  Pencil,
  ShoppingBasket,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import type { MenuEntry, MenuSpec } from "@/components/ui/Menu";
import { AddToCookbookDialog } from "@/components/AddToCookbookModal";
import { AddToShoppingListDialog } from "@/components/AddToShoppingListModal";
import { RecipePdfDialog, type PdfThemeOption } from "@/components/RecipePdfDialog";
import { LinkVariantDialog, NewVariantDialog } from "./Variants";
import { deleteRecipe, deleteRecipes, duplicateRecipe, toggleFavorite } from "@/app/actions/recipes";
import { assignRecipesToFolder } from "@/app/actions/settings";
import { formatG } from "@/lib/format";

export type FolderOption = { id: number; name: string; color: string };

type Ctx = { folders: FolderOption[]; themes: PdfThemeOption[] };
const RecipeMenuCtx = createContext<Ctx>({ folders: [], themes: [] });

/** Données partagées par tous les menus de recettes d'une page (dossiers, thèmes PDF). */
export function RecipeMenuProvider({
  folders,
  themes,
  children,
}: Ctx & { children: React.ReactNode }) {
  return <RecipeMenuCtx.Provider value={{ folders, themes }}>{children}</RecipeMenuCtx.Provider>;
}

export type RecipeMenuTarget = {
  id: number;
  name: string;
  favorite: boolean;
  folderId: number | null;
  totalMassG?: number;
  /** Couleur de la vignette dans la feuille téléphone. */
  color?: string;
  subtitle?: string;
};

type Dialog = "pdf" | "cookbook" | "shopping" | "variant" | "link-variant" | null;

/**
 * Menu d'actions d'une recette (clic droit, bouton « ⋯ », appui long) et les
 * fenêtres qu'il ouvre. `onPage` : on est sur la fiche de la recette
 * (supprimer redirige vers l'accueil, « Ouvrir » est masqué).
 */
export function useRecipeMenu(r: RecipeMenuTarget, opts: { onPage?: boolean } = {}) {
  const { folders, themes } = useContext(RecipeMenuCtx);
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [, startTransition] = useTransition();

  const getSpec = useCallback((): MenuSpec => {
    const moveTo: MenuEntry[] = [
      ...folders.map((f) => ({
        label: f.name,
        checked: f.id === r.folderId,
        dot: f.color,
        onSelect: () =>
          startTransition(async () => {
            await assignRecipesToFolder(f.id, [r.id]);
            router.refresh();
          }),
      })),
      { separator: true as const },
      {
        label: "Sans dossier",
        icon: FolderX,
        checked: r.folderId === null,
        onSelect: () =>
          startTransition(async () => {
            await assignRecipesToFolder(null, [r.id]);
            router.refresh();
          }),
      },
    ];

    const remove = () => {
      if (!confirm(`Supprimer définitivement « ${r.name} » ?\n\nCette action est irréversible.`)) return;
      startTransition(async () => {
        if (opts.onPage) await deleteRecipe(r.id);
        else {
          await deleteRecipes([r.id]);
          router.refresh();
        }
      });
    };

    return {
      title: r.name,
      icon: BookOpen,
      head: (
        <>
          <span style={{ width: 44, height: 44, borderRadius: 11, flex: "none", background: `linear-gradient(140deg, ${r.color ?? "#3b475e"}55, ${r.color ?? "#3b475e"}bb)` }} />
          <div style={{ minWidth: 0 }}>
            <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</b>
            <small>{r.subtitle ?? (r.totalMassG ? formatG(r.totalMassG) : "")}</small>
          </div>
        </>
      ),
      quick: [
        { label: "Modifier", icon: Pencil, href: `/recipes/${r.id}/edit` },
        { label: "Cahier", icon: Library, onSelect: () => setDialog("cookbook") },
        { label: "Courses", icon: ShoppingBasket, onSelect: () => setDialog("shopping") },
        { label: "PDF", icon: FileDown, onSelect: () => setDialog("pdf") },
      ],
      items: [
        ...(!opts.onPage ? [{ label: "Ouvrir", icon: ExternalLink, href: `/recipes/${r.id}`, hint: "Entrée" }] : []),
        { label: "Modifier", icon: Pencil, href: `/recipes/${r.id}/edit` },
        {
          label: "Dupliquer",
          icon: Copy,
          onSelect: () => startTransition(async () => { await duplicateRecipe(r.id); }),
        },
        { label: "Nouvelle variante…", icon: GitBranch, onSelect: () => setDialog("variant") },
        { label: "Relier une variante…", icon: Link2, onSelect: () => setDialog("link-variant") },
        { separator: true },
        { label: "Ajouter à un cahier…", icon: Library, onSelect: () => setDialog("cookbook") },
        { label: "Ajouter aux courses…", icon: ShoppingBasket, onSelect: () => setDialog("shopping") },
        { label: "Télécharger le PDF…", icon: FileDown, onSelect: () => setDialog("pdf") },
        { separator: true },
        { label: "Déplacer vers", icon: FolderInput, submenu: moveTo },
        {
          label: r.favorite ? "Retirer des favoris" : "Ajouter aux favoris",
          icon: r.favorite ? StarOff : Star,
          onSelect: () =>
            startTransition(async () => {
              await toggleFavorite(r.id);
              router.refresh();
            }),
        },
        { separator: true },
        { label: "Supprimer…", icon: Trash2, danger: true, onSelect: remove },
      ],
    };
  }, [r, folders, opts.onPage, router]);

  const dialogs =
    dialog === "pdf" ? (
      <RecipePdfDialog recipeId={r.id} recipeName={r.name} themes={themes} onClose={() => setDialog(null)} />
    ) : dialog === "cookbook" ? (
      <AddToCookbookDialog recipeId={r.id} recipeName={r.name} onClose={() => setDialog(null)} />
    ) : dialog === "shopping" ? (
      <AddToShoppingListDialog recipeId={r.id} recipeName={r.name} onClose={() => setDialog(null)} />
    ) : dialog === "variant" ? (
      <NewVariantDialog recipeId={r.id} recipeName={r.name} onClose={() => setDialog(null)} />
    ) : dialog === "link-variant" ? (
      <LinkVariantDialog recipeId={r.id} recipeName={r.name} onClose={() => setDialog(null)} />
    ) : null;

  return { getSpec, dialogs, openDialog: setDialog };
}

"use client";

import Link from "next/link";
import { Check, Layers, Star } from "lucide-react";
import { ContextArea, MoreButton } from "@/components/ui/Menu";
import { useRecipeSelection } from "@/components/RecipeSelection";
import { useRecipeMenu, type FolderOption } from "./RecipeMenu";
import { formatG, formatRelativeDate } from "@/lib/format";

export type RecipeRowData = {
  id: number;
  name: string;
  photoPath: string | null;
  favorite: boolean;
  rating: number | null;
  totalMassG: number;
  tags: string[];
  categories: { id: number; name: string; color: string }[];
  folderId: number | null;
  subCount: number;
  variantCount?: number;
  /** Date ISO (sérialisable). */
  updatedAt: string;
};

/**
 * Liste des recettes en tableau : vignette, nom, dossier, masse, date, note.
 * Clic : ouvre la recette. Clic droit / « ⋯ » / appui long : menu d'actions.
 * En mode sélection : un clic coche la ligne.
 */
export function RecipeTable({
  recipes,
  folders,
  from,
  showFolder = true,
}: {
  recipes: RecipeRowData[];
  folders: FolderOption[];
  from?: string;
  showFolder?: boolean;
}) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  return (
    <div className="rtable" data-folder={showFolder ? "1" : undefined}>
      <div className="rrow rhead desk-only" aria-hidden>
        <span />
        <span>Recette</span>
        {showFolder && <span>Dossier</span>}
        <span className="r">Masse</span>
        <span>Modifiée</span>
        <span>Note</span>
        <span />
      </div>
      {recipes.map((r) => (
        <RecipeRow key={r.id} r={r} folder={r.folderId ? byId.get(r.folderId) ?? null : null} from={from} showFolder={showFolder} />
      ))}
    </div>
  );
}

function RecipeRow({
  r,
  folder,
  from,
  showFolder,
}: {
  r: RecipeRowData;
  folder: FolderOption | null;
  from?: string;
  showFolder: boolean;
}) {
  const { selectionMode, isSelected, toggle } = useRecipeSelection();
  const color = folder?.color ?? r.categories[0]?.color ?? "#3b475e";
  const sub = [
    r.subCount > 0 ? `${r.subCount} sous-recette${r.subCount > 1 ? "s" : ""}` : null,
    r.variantCount ? `${r.variantCount} variante${r.variantCount > 1 ? "s" : ""}` : null,
    ...r.categories.map((c) => c.name),
    ...r.tags.slice(0, 2),
  ]
    .filter(Boolean)
    .join(" · ");
  const menu = useRecipeMenu({
    id: r.id,
    name: r.name,
    favorite: r.favorite,
    folderId: r.folderId,
    totalMassG: r.totalMassG,
    color,
    subtitle: [folder?.name, r.totalMassG > 0 ? formatG(Math.round(r.totalMassG)) : null, r.subCount ? `${r.subCount} sous-recette${r.subCount > 1 ? "s" : ""}` : null].filter(Boolean).join(" · "),
  });
  const href = from ? `/recipes/${r.id}?from=${encodeURIComponent(from)}` : `/recipes/${r.id}`;
  const selected = selectionMode && isSelected(r.id);

  const cells = (
    <>
      <span className="rthumb" style={{ "--c": color } as React.CSSProperties}>
        {r.subCount > 0 && <Layers size={16} />}
        {selectionMode && (
          <span className="rcheck" data-on={selected ? "true" : undefined}>
            {selected && <Check size={14} />}
          </span>
        )}
      </span>
      <span className="rname">
        <b>{r.name}</b>
        {sub && <small>{sub}</small>}
      </span>
      {showFolder && (
        <span className="rfolder desk-only">
          {folder ? (
            <>
              <span className="dot" style={{ background: folder.color }} />
              {folder.name}
            </>
          ) : (
            <span style={{ color: "var(--muted)" }}>—</span>
          )}
        </span>
      )}
      <span className="rmass num">{r.totalMassG > 0 ? formatG(Math.round(r.totalMassG)) : "—"}</span>
      <span className="rdate desk-only">{formatRelativeDate(r.updatedAt)}</span>
      <span className="rrating desk-only">
        {r.rating ? (
          <>
            <Star size={13} fill="currentColor" />
            {r.rating}/5
          </>
        ) : null}
      </span>
      <span className="rfav desk-only">
        {r.favorite && <Star size={15} fill="currentColor" aria-label="Favori" />}
      </span>
    </>
  );

  return (
    <ContextArea spec={menu.getSpec} className="rrow" selected={selected}>
      {selectionMode ? (
        <button type="button" className="rlink" onClick={() => toggle(r.id)} aria-pressed={selected}>
          {cells}
        </button>
      ) : (
        <Link href={href} className="rlink">
          {cells}
        </Link>
      )}
      <MoreButton spec={menu.getSpec} label={`Actions pour ${r.name}`} />
      {menu.dialogs}
    </ContextArea>
  );
}

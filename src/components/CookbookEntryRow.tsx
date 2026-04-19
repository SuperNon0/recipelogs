"use client";

import { useTransition } from "react";
import {
  convertToLinked,
  moveCookbookEntry,
  refreshSnapshot,
  removeFromCookbook,
} from "@/app/actions/cookbooks";

export type CookbookEntryRowData = {
  id: number;
  position: number;
  recipeName: string;
  recipeId: number;
  linkMode: "linked" | "snapshot";
  subrecipeMode: "single" | "separate";
  snapshotDate: Date | null;
};

export function CookbookEntryRow({
  cookbookId,
  entry,
  isFirst,
  isLast,
}: {
  cookbookId: number;
  entry: CookbookEntryRowData;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const linkBadge =
    entry.linkMode === "linked"
      ? { emoji: "🔗", label: "Liée", color: "var(--accent-2)" }
      : { emoji: "📌", label: "Figée", color: "var(--pending)" };

  const subBadge =
    entry.subrecipeMode === "single"
      ? { emoji: "📄", label: "Fiche unique" }
      : { emoji: "📚", label: "Séparées" };

  return (
    <div className="fl-card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3
              className="fl-title-serif"
              style={{ fontSize: "1.1rem" }}
            >
              {entry.recipeName}
            </h3>
            <span
              className="fl-tag"
              style={{
                background: `${linkBadge.color}22`,
                color: linkBadge.color,
                borderColor: `${linkBadge.color}66`,
              }}
            >
              {linkBadge.emoji} {linkBadge.label}
            </span>
            <span className="fl-tag">
              {subBadge.emoji} {subBadge.label}
            </span>
          </div>
          {entry.linkMode === "snapshot" && entry.snapshotDate && (
            <div className="fl-label mt-1">
              Figée le{" "}
              {new Date(entry.snapshotDate).toLocaleDateString("fr-FR")}
            </div>
          )}
        </div>

        <div className="flex gap-1 flex-shrink-0">
          <button
            type="button"
            disabled={isFirst || pending}
            onClick={() =>
              startTransition(() =>
                moveCookbookEntry(entry.id, -1, cookbookId),
              )
            }
            className="fl-btn fl-btn-secondary"
            style={{ padding: "0.35rem 0.55rem" }}
            aria-label="Monter"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={isLast || pending}
            onClick={() =>
              startTransition(() =>
                moveCookbookEntry(entry.id, 1, cookbookId),
              )
            }
            className="fl-btn fl-btn-secondary"
            style={{ padding: "0.35rem 0.55rem" }}
            aria-label="Descendre"
          >
            ↓
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {entry.linkMode === "linked" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(() => refreshSnapshot(entry.id, cookbookId))
            }
            className="fl-btn fl-btn-pending"
            style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
          >
            📌 Figer à cette date
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => refreshSnapshot(entry.id, cookbookId))
              }
              className="fl-btn fl-btn-edit"
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
            >
              🔄 Mettre à jour le snapshot
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => convertToLinked(entry.id, cookbookId))
              }
              className="fl-btn fl-btn-secondary"
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
            >
              🔗 Reconvertir en liée
            </button>
          </>
        )}
        <a
          href={`/recipes/${entry.recipeId}`}
          className="fl-btn fl-btn-secondary"
          style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
        >
          Voir la fiche
        </a>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm(`Retirer « ${entry.recipeName} » du cahier ?`)) {
              startTransition(() =>
                removeFromCookbook(entry.id, cookbookId),
              );
            }
          }}
          className="fl-btn fl-btn-danger"
          style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
        >
          Retirer
        </button>
      </div>
    </div>
  );
}

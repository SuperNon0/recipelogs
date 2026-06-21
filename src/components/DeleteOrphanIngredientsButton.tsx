"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteIngredientBasesBulk } from "@/app/actions/settings";

type Orphan = { id: number; name: string };

/**
 * Bouton « Nettoyer la base » : supprime tous les ingrédients qui ne sont
 * plus utilisés dans aucune recette (0 recette). Un clic ouvre une fenêtre
 * qui liste précisément ce qui va être supprimé avant confirmation.
 */
export function DeleteOrphanIngredientsButton({ orphans }: { orphans: Orphan[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const count = orphans.length;

  function handleConfirm() {
    if (count === 0) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteIngredientBasesBulk(orphans.map((o) => o.id));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setOpen(true); }}
        disabled={count === 0}
        className="fl-btn"
        style={{
          fontSize: "0.85rem",
          alignSelf: "flex-start",
          borderColor: "var(--danger)",
          color: count === 0 ? "var(--muted)" : "var(--danger)",
          opacity: count === 0 ? 0.6 : 1,
        }}
        title={
          count === 0
            ? "Aucun ingrédient inutilisé à supprimer"
            : `Supprimer ${count} ingrédient${count > 1 ? "s" : ""} inutilisé${count > 1 ? "s" : ""}`
        }
      >
        🧹 Supprimer les ingrédients sans recette
        {count > 0 ? ` (${count})` : ""}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="fl-card"
            style={{
              width: "100%",
              maxWidth: 480,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              maxHeight: "85vh",
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
                Supprimer les ingrédients sans recette
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="fl-label hover:text-[color:var(--text)]"
                style={{ fontSize: "0.8rem" }}
              >
                ✕
              </button>
            </div>

            <p className="fl-label" style={{ color: "var(--muted)" }}>
              {count} ingrédient{count > 1 ? "s" : ""} ne {count > 1 ? "sont" : "est"} plus
              utilisé{count > 1 ? "s" : ""} dans aucune recette et {count > 1 ? "seront" : "sera"}{" "}
              supprimé{count > 1 ? "s" : ""} de la base. Les recettes ne sont pas modifiées.
            </p>

            <div
              className="flex flex-col rounded-md"
              style={{
                border: "1px solid var(--border)",
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {orphans.map((o, idx) => (
                <span
                  key={o.id}
                  className="px-3 py-2 text-sm"
                  style={{
                    color: "var(--text)",
                    fontFamily: "var(--font-mono)",
                    borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  {o.name}
                </span>
              ))}
            </div>

            {error && (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="fl-btn"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending || count === 0}
                className="fl-btn"
                style={{
                  background: "var(--danger)",
                  color: "#fff",
                  borderColor: "var(--danger)",
                  opacity: pending ? 0.6 : 1,
                }}
              >
                {pending
                  ? "Suppression…"
                  : `🗑 Supprimer ${count} ingrédient${count > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { syncAllIngredientBases } from "@/app/actions/settings";
import { useRouter } from "next/navigation";

export function SyncIngredientsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ created: number } | null>(null);

  function handleSync() {
    setResult(null);
    startTransition(async () => {
      const r = await syncAllIngredientBases();
      if (r.ok) {
        setResult({ created: r.created ?? 0 });
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={handleSync}
        disabled={pending}
        className="fl-btn fl-btn-secondary"
        style={{ fontSize: "0.85rem" }}
      >
        {pending ? "Synchronisation…" : "🔄 Synchroniser depuis toutes les recettes"}
      </button>
      {result && (
        <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
          {result.created > 0
            ? `✓ ${result.created} ingrédient${result.created > 1 ? "s" : ""} ajouté${result.created > 1 ? "s" : ""}`
            : "✓ Tout était déjà à jour"}
        </p>
      )}
    </div>
  );
}

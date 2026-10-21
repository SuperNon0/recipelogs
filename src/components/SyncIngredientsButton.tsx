"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { syncAllIngredientBases } from "@/app/actions/settings";
import { useRouter } from "next/navigation";
import { Help } from "@/components/ui/Help";

/** Rangée « Synchroniser » : ajoute à la base les ingrédients manquants des recettes. */
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
    <div className="fl-row">
      <span className="ic">
        <RefreshCw size={16} className={pending ? "set-spin" : undefined} />
      </span>
      <span className="set-tx">
        <b>
          <span>Synchroniser</span>
          <Help title="Synchroniser la base">
            Parcourt toutes les recettes et ajoute à la base les ingrédients qui n&apos;y sont pas
            encore. Ça arrive surtout après un import. Rien n&apos;est supprimé ni modifié dans les
            recettes ; tu peux le relancer sans risque.
          </Help>
        </b>
        <small style={result ? { color: "var(--accent-2)" } : undefined}>
          {result
            ? result.created > 0
              ? `${result.created} ingrédient${result.created > 1 ? "s" : ""} ajouté${result.created > 1 ? "s" : ""}`
              : "Tout était déjà à jour"
            : "Ajoute les ingrédients manquants depuis toutes les recettes"}
        </small>
      </span>
      <button type="button" onClick={handleSync} disabled={pending} className="fl-btn fl-btn-secondary">
        {pending ? "En cours…" : "Lancer"}
      </button>
    </div>
  );
}

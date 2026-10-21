"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { repairImportedIngredientsAction } from "@/app/actions/settings";
import { Help } from "@/components/ui/Help";

/** Rangée « Réparer les recettes importées » (quantités sur une ligne à part, ligne de total). */
export function RepairIngredientsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleRepair() {
    setResult(null);
    startTransition(async () => {
      const r = await repairImportedIngredientsAction();
      if (!r.ok) return setResult(r.error);
      setResult(
        r.fixed > 0
          ? `${r.fixed} ligne${r.fixed > 1 ? "s" : ""} corrigée${r.fixed > 1 ? "s" : ""} dans ${r.recipes} recette${r.recipes > 1 ? "s" : ""}`
          : "Rien à réparer",
      );
      router.refresh();
    });
  }

  return (
    <div className="fl-row">
      <span className="ic">
        <Wrench size={16} />
      </span>
      <span className="set-tx">
        <b>
          <span>Réparer les recettes importées</span>
          <Help
            title="Réparer les recettes importées"
            example="« Abricots frais » 0 g suivi d'une ligne « 800g » devient « Abricots frais » 800 g."
          >
            Certaines recettes importées de Recipe Keeper ont la quantité sur une ligne à part, comme
            si c&apos;était un ingrédient, ou leur total recopié en dernière ligne (ce qui doublait la
            masse). La réparation recolle les quantités et retire ces lignes. Elle se fait déjà toute
            seule après une mise à jour ; tu peux la relancer sans risque.
          </Help>
        </b>
        <small style={result ? { color: "var(--accent-2)" } : undefined}>
          {result ?? "Recolle les quantités séparées et retire les lignes de total"}
        </small>
      </span>
      <button type="button" onClick={handleRepair} disabled={pending} className="fl-btn fl-btn-secondary">
        {pending ? "En cours…" : "Lancer"}
      </button>
    </div>
  );
}

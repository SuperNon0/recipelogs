"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { setIngredientPrice } from "@/app/actions/settings";
import { PRICE_UNITS } from "@/lib/cost";

/**
 * Champ prix d'achat (€ par kg, L ou pièce) d'un ingrédient, enregistré en
 * quittant le champ ou en changeant l'unité. Chaque nouveau prix part dans
 * l'historique (voir setIngredientPrice).
 */
export function PriceInput({ id, initial, initialUnit, label }: { id: number; initial: number | null; initialUnit: string; label?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial != null ? String(initial).replace(".", ",") : "");
  const [unit, setUnit] = useState(initialUnit);
  const [last, setLast] = useState({ value, unit });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (nextUnit = unit) => {
    const v = value.trim();
    if (v === last.value && nextUnit === last.unit) return;
    const n = v === "" ? null : Number(v.replace(",", "."));
    if (n != null && (!Number.isFinite(n) || n < 0)) return setError("Prix invalide.");
    setError(null);
    startTransition(async () => {
      const r = await setIngredientPrice(id, n, nextUnit);
      if (!r.ok) return setError(r.error);
      setLast({ value: v, unit: nextUnit });
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="ing-fact-v">
      <SaveState pending={pending} saved={saved && value.trim() === last.value && unit === last.unit} error={error} />
      <div className="stepper">
        <input
          value={value}
          inputMode="decimal"
          placeholder="—"
          aria-label={label ? `Prix d'achat de ${label} en euros` : "Prix d'achat en euros"}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          onBlur={() => save()}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
        <span className="x">€ /</span>
      </div>
      <select
        className="fl-input ing-fact-unit"
        value={unit}
        aria-label="Unité du prix"
        onChange={(e) => { setUnit(e.target.value); setSaved(false); if (value.trim()) save(e.target.value); }}
      >
        {PRICE_UNITS.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
    </div>
  );
}

/** Petit état « enregistré / erreur » commun aux champs de la fiche. */
export function SaveState({ pending, saved, error }: { pending: boolean; saved: boolean; error: string | null }) {
  if (error) return <span className="ing-fact-msg" data-err="true">{error}</span>;
  if (pending) return <span className="ing-fact-msg">…</span>;
  if (saved) return <span className="ing-fact-msg"><Check size={13} /> Enregistré</span>;
  return null;
}

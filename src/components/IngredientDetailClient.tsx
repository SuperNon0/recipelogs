"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, ChevronRight, Merge, Pencil } from "lucide-react";
import { renameIngredientBase, mergeIngredientBases, setIngredientAllergens, setIngredientPieceWeight, setIngredientPrice } from "@/app/actions/settings";
import { PRICE_UNITS, formatEuro } from "@/lib/cost";
import { ALLERGENS } from "@/lib/allergens";
import { Help } from "@/components/ui/Help";
import { EmptyState } from "@/components/EmptyState";
import { MergeIngredientModal, RenameIngredientModal } from "@/components/settings/IngredientModals";

type Recipe = { id: number; name: string; ingredientName: string };

/** Fiche d'un ingrédient de la base : renommer, fusionner, recettes qui l'utilisent. */
export function IngredientDetailClient({
  base,
  recipes,
  otherBases,
}: {
  base: {
    id: number;
    name: string;
    pieceG: number | null;
    allergens: string[];
    price: number | null;
    priceUnit: string;
    priceHistory: { price: number; unit: string; date: string }[];
  };
  recipes: Recipe[];
  otherBases: { id: number; name: string; count?: number }[];
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [merging, setMerging] = useState(false);

  async function handleMerge(target: { id: number; name: string }): Promise<string | null> {
    if (!confirm(`Fusionner « ${base.name} » dans « ${target.name} » ?\n\nToutes les recettes utilisant « ${base.name} » seront mises à jour avec « ${target.name} ». Cette action est irréversible.`)) return null;
    const r = await mergeIngredientBases(base.id, target.id);
    if (!r.ok) return r.error;
    router.push("/settings/ingredients");
    return null;
  }

  return (
    <>
      <div className="page-head">
        <h1>{base.name}</h1>
        <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setRenaming(true)}>
          <Pencil size={15} /> Renommer
        </button>
        <button
          type="button"
          className="fl-btn fl-btn-secondary"
          onClick={() => setMerging(true)}
          disabled={otherBases.length === 0}
        >
          <Merge size={15} /> Fusionner…
        </button>
        <p className="sub">
          {recipes.length === 0
            ? "Aucune recette n'utilise cet ingrédient"
            : `${recipes.length} recette${recipes.length > 1 ? "s utilisent" : " utilise"} cet ingrédient`}
        </p>
      </div>

      <section className="fl-card ing-facts">
        <PriceField id={base.id} initial={base.price} initialUnit={base.priceUnit} history={base.priceHistory} />
        <AllergensField id={base.id} initial={base.allergens} />
        <PieceWeightField id={base.id} initial={base.pieceG} />
      </section>

      <div className="sect-title" style={{ marginTop: 8 }}>
        <h2>Recettes</h2>
      </div>
      {recipes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Aucune recette"
          description="Aucune recette n'utilise cet ingrédient pour le moment."
        />
      ) : (
        <div className="fl-list">
          {recipes.map((r) => (
            <Link key={r.id} href={`/recipes/${r.id}`} className="fl-row">
              <span className="ic">
                <BookOpen size={16} />
              </span>
              <span className="set-tx">
                <b>
                  <span>{r.name}</span>
                </b>
                {r.ingredientName !== base.name && <small>Écrit « {r.ingredientName} » dans la recette</small>}
              </span>
              <ChevronRight size={16} className="set-chev" />
            </Link>
          ))}
        </div>
      )}

      {renaming && (
        <RenameIngredientModal
          name={base.name}
          onClose={() => setRenaming(false)}
          onSubmit={async (fd) => {
            const r = await renameIngredientBase(base.id, fd);
            if (!r.ok) return r.error;
            router.refresh();
            return null;
          }}
        />
      )}
      {merging && (
        <MergeIngredientModal
          sourceLabel={`« ${base.name} »`}
          options={otherBases}
          onConfirm={handleMerge}
          onClose={() => setMerging(false)}
        />
      )}
    </>
  );
}

/** Petit état « enregistré / erreur » commun aux champs de la fiche. */
function SaveState({ pending, saved, error }: { pending: boolean; saved: boolean; error: string | null }) {
  if (error) return <span className="ing-fact-msg" data-err="true">{error}</span>;
  if (pending) return <span className="ing-fact-msg">…</span>;
  if (saved) return <span className="ing-fact-msg"><Check size={13} /> Enregistré</span>;
  return null;
}

/** Poids d'une pièce : enregistré quand on quitte le champ (ou Entrée). */
function PieceWeightField({ id, initial }: { id: number; initial: number | null }) {
  const [value, setValue] = useState(initial != null ? String(initial).replace(".", ",") : "");
  const [last, setLast] = useState(value);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const v = value.trim();
    if (v === last) return;
    const n = v === "" ? null : Number(v.replace(",", "."));
    if (n != null && (!Number.isFinite(n) || n <= 0)) return setError("Poids invalide.");
    setError(null);
    startTransition(async () => {
      const r = await setIngredientPieceWeight(id, n);
      if (!r.ok) return setError(r.error);
      setLast(v);
      setSaved(true);
    });
  };

  return (
    <div className="ing-fact">
      <div className="ing-fact-l">
        <b>
          Poids d&apos;une pièce
          <Help title="Poids d'une pièce" example="Œuf entier ≈ 50 g, jaune ≈ 20 g, blanc ≈ 30 g, feuille de gélatine ≈ 2 g.">
            Quand une recette compte cet ingrédient à la pièce, chaque pièce pèse ce poids : elle
            entre alors dans la masse totale, les pourcentages et le multiplicateur. Laisse vide si
            l&apos;ingrédient ne s&apos;utilise pas à la pièce.
          </Help>
        </b>
        <small>Pour les recettes qui l&apos;utilisent à la pièce</small>
      </div>
      <div className="ing-fact-v">
        <SaveState pending={pending} saved={saved && value.trim() === last} error={error} />
        <div className="stepper">
          <input
            value={value}
            inputMode="decimal"
            placeholder="—"
            aria-label="Poids d'une pièce en grammes"
            onChange={(e) => { setValue(e.target.value); setSaved(false); }}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
          <span className="x">g</span>
        </div>
      </div>
    </div>
  );
}

/** Les 14 allergènes : un clic coche ou décoche, enregistré tout de suite. */
function AllergensField({ id, initial }: { id: number; initial: string[] }) {
  const [on, setOn] = useState<string[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const toggle = (key: string) => {
    const next = on.includes(key) ? on.filter((k) => k !== key) : [...on, key];
    const prev = on;
    setOn(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await setIngredientAllergens(id, next);
      if (!r.ok) {
        setOn(prev);
        return setError(r.error);
      }
      setSaved(true);
    });
  };

  return (
    <div className="ing-fact ing-fact-col">
      <div className="ing-fact-l">
        <b>
          Allergènes
          <Help title="Allergènes" example="Beurre : Lait. Farine de blé : Gluten. Praliné : Fruits à coque.">
            Les 14 allergènes à déclarer (règlement INCO). Coche ceux que contient cet ingrédient :
            chaque recette qui l&apos;utilise, même en sous-recette, les affiche toute seule, sur la
            fiche et dans le PDF.
          </Help>
          <span style={{ marginLeft: "auto", fontWeight: 400 }}>
            <SaveState pending={pending} saved={saved} error={error} />
          </span>
        </b>
        <small>{on.length === 0 ? "Aucun allergène coché" : `${on.length} coché${on.length > 1 ? "s" : ""}`}</small>
      </div>
      <div className="ing-allergens" role="group" aria-label="Allergènes">
        {ALLERGENS.map((a) => (
          <button key={a.key} type="button" className="fl-chip" aria-pressed={on.includes(a.key)} onClick={() => toggle(a.key)}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Prix d'achat (€ par kg, L ou pièce), enregistré en quittant le champ ; les anciens prix restent en historique. */
function PriceField({
  id,
  initial,
  initialUnit,
  history,
}: {
  id: number;
  initial: number | null;
  initialUnit: string;
  history: { price: number; unit: string; date: string }[];
}) {
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

  // L'historique commence par le prix actuel : on montre les précédents.
  const older = history.slice(1, 4);

  return (
    <div className="ing-fact">
      <div className="ing-fact-l">
        <b>
          Prix d&apos;achat
          <Help title="Prix d'achat" example="Beurre à 7,90 € le kg : 250 g de beurre coûtent 1,98 €.">
            Le prix payé pour cet ingrédient (hors taxes si tu raisonnes en HT). Il sert au coût de
            revient de chaque recette qui l&apos;utilise, sous-recettes comprises. Les anciens prix
            sont gardés en dessous.
          </Help>
        </b>
        <small>
          {older.length > 0
            ? "Avant : " + older.map((h) => `${formatEuro(h.price)}/${h.unit} (${new Date(h.date).toLocaleDateString("fr-FR")})`).join(" · ")
            : "Pour le coût de revient des recettes"}
        </small>
      </div>
      <div className="ing-fact-v">
        <SaveState pending={pending} saved={saved && value.trim() === last.value && unit === last.unit} error={error} />
        <div className="stepper">
          <input
            value={value}
            inputMode="decimal"
            placeholder="—"
            aria-label="Prix d'achat en euros"
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
    </div>
  );
}

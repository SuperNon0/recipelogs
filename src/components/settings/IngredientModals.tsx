"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Search } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";

type BaseOption = { id: number; name: string; count?: number };

/** Explication commune de la fusion d'ingrédients. */
export function MergeHelp() {
  return (
    <Help
      title="Fusionner des ingrédients"
      example="« beurre doux » et « Beurre » fusionnés dans « Beurre » : toutes les recettes affichent « Beurre » et la base n'en garde qu'un."
    >
      Sert à réunir des doublons (fautes de frappe, pluriels, variantes d&apos;écriture). Dans toutes
      les recettes, l&apos;ingrédient fusionné est remplacé par celui que tu choisis, puis il est
      retiré de la base. Les quantités ne changent pas. Action irréversible.
    </Help>
  );
}

/**
 * Fenêtre « Fusionner dans… » : choix de l'ingrédient qui reste.
 * `onConfirm` renvoie un message d'erreur, ou null si la fusion a réussi.
 */
export function MergeIngredientModal({
  sourceLabel,
  options,
  onConfirm,
  onClose,
}: {
  /** Ex. « farine T55 » ou « 3 ingrédients ». */
  sourceLabel: string;
  options: BaseOption[];
  onConfirm: (target: BaseOption) => Promise<string | null>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options).slice(0, 80);
  }, [options, query]);
  const target = options.find((o) => o.id === targetId) ?? null;

  function confirmMerge() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const err = await onConfirm(target);
      if (err) setError(err);
    });
  }

  return (
    <ModalOverlay
      title={
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          Fusionner {sourceLabel}
          <MergeHelp />
        </span>
      }
      onClose={onClose}
    >
      <p className="set-note" style={{ marginTop: -4 }}>
        Choisis l&apos;ingrédient à garder. Les recettes concernées seront mises à jour avec son nom.
      </p>
      <div className="searchbox">
        <Search size={16} />
        <input
          type="search"
          placeholder="Rechercher l'ingrédient à garder…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setTargetId(null);
          }}
          autoFocus
        />
      </div>
      <div className="fl-list set-pick fl-scroll">
        {filtered.length === 0 ? (
          <p className="set-note" style={{ padding: 14 }}>
            Aucun résultat
          </p>
        ) : (
          filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              className="fl-row set-row"
              aria-pressed={o.id === targetId}
              onClick={() => setTargetId(o.id === targetId ? null : o.id)}
            >
              <span className="set-tx">
                <b>
                  <span>{o.name}</span>
                </b>
              </span>
              {o.count !== undefined && (
                <span className="set-count">
                  {o.count} rec.
                </span>
              )}
              {o.id === targetId && <Check size={16} style={{ color: "var(--accent)", flex: "none" }} />}
            </button>
          ))
        )}
      </div>
      {target && (
        <p className="set-note" style={{ color: "var(--soft)" }}>
          {sourceLabel} sera remplacé par « {target.name} » dans toutes les recettes, puis retiré de la
          base.
        </p>
      )}
      {error && <p className="set-error">{error}</p>}
      <div className="set-foot">
        <button type="button" className="fl-btn fl-btn-secondary" onClick={onClose} disabled={pending}>
          Annuler
        </button>
        <button type="button" className="fl-btn fl-btn-primary" onClick={confirmMerge} disabled={!target || pending}>
          {pending ? "Fusion…" : "Fusionner"}
        </button>
      </div>
    </ModalOverlay>
  );
}

/** Fenêtre « Renommer l'ingrédient » (le nom change aussi dans les recettes). */
export function RenameIngredientModal({
  name,
  onSubmit,
  onClose,
}: {
  name: string;
  onSubmit: (fd: FormData) => Promise<string | null>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const err = await onSubmit(fd);
      if (err) setError(err);
      else onClose();
    });
  }

  return (
    <ModalOverlay title="Renommer l'ingrédient" onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Nouveau nom</span>
          <input name="name" defaultValue={name} required maxLength={200} autoFocus className="fl-input" />
        </label>
        <p className="set-note">Le nom sera aussi mis à jour dans toutes les recettes qui l&apos;utilisent.</p>
        {error && <p className="set-error">{error}</p>}
        <div className="set-foot">
          <button type="button" className="fl-btn fl-btn-secondary" onClick={onClose} disabled={pending}>
            Annuler
          </button>
          <button type="submit" className="fl-btn fl-btn-primary" disabled={pending}>
            {pending ? "Enregistrement…" : "Renommer"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

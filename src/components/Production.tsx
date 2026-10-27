"use client";

import { foldText } from "@/lib/textSearch";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileDown, Layers, Plus, Search, Trash2, X } from "lucide-react";
import type { ProductionItemRow, ProductionSheet } from "@/lib/productionData";
import { formatG, formatQty } from "@/lib/format";
import { ModalOverlay } from "./ModalOverlay";
import { fetchAvailableRecipes } from "@/app/actions/modals";
import { addToProduction, clearProduction, fetchRecipeYield, removeProductionItem, setProductionAmount } from "@/app/actions/production";

const parse = (s: string) => Number(s.replace(",", "."));
const show = (n: number) => String(n).replace(".", ",");

/** Recettes à produire : quantité modifiable sur place, retrait, ajout, PDF. */
export function ProductionBoard({ items }: { items: ProductionItemRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [withSteps, setWithSteps] = useState(false);

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <section className="fl-card prod-board" aria-busy={pending}>
      {items.length > 0 && (
        <ul className="prod-items">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={`/recipes/${it.recipeId}`} className="prod-name">
                {it.name}
              </Link>
              <AmountInput
                initial={it.amount}
                prefix={it.yieldCount ? undefined : "×"}
                suffix={it.yieldLabel ?? undefined}
                onSave={(n) => run(() => setProductionAmount(it.id, n))}
              />
              <button type="button" className="fl-btn fl-btn-ghost fl-btn-icon" aria-label={`Retirer ${it.name}`} title="Retirer de la fiche" onClick={() => run(() => removeProductionItem(it.id))}>
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="prod-actions">
        <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setAdding(true)}>
          <Plus size={15} /> Ajouter une recette
        </button>
        {items.length > 0 && (
          <>
            <button
              type="button"
              className="fl-btn fl-btn-ghost"
              onClick={() => {
                if (confirm("Vider la fiche de production ? Les recettes ne sont pas touchées.")) run(() => clearProduction());
              }}
            >
              <Trash2 size={15} /> Vider
            </button>
            <label className="prod-steps-opt">
              <input type="checkbox" checked={withSteps} onChange={(e) => setWithSteps(e.target.checked)} /> Avec les étapes
            </label>
            <a className="fl-btn fl-btn-primary" href={`/production/pdf${withSteps ? "?etapes=1" : ""}`} download>
              <FileDown size={15} /> PDF à imprimer
            </a>
          </>
        )}
      </div>
      {adding && <AddRecipeDialog onClose={() => setAdding(false)} onAdded={() => router.refresh()} />}
    </section>
  );
}

/** Champ de quantité enregistré quand on le quitte (ou Entrée). */
function AmountInput({ initial, prefix, suffix, onSave }: { initial: number; prefix?: string; suffix?: string; onSave: (n: number) => void }) {
  const [v, setV] = useState(show(initial));
  useEffect(() => setV(show(initial)), [initial]);
  const commit = () => {
    const n = parse(v);
    if (Number.isFinite(n) && n > 0 && n !== initial) onSave(n);
    else setV(show(initial));
  };
  return (
    <span className="prod-amount">
      {prefix && <span>{prefix}</span>}
      <input
        className="fl-input num"
        inputMode="decimal"
        value={v}
        aria-label="Quantité à produire"
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      />
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

function AddRecipeDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [recipes, setRecipes] = useState<{ id: number; name: string }[] | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ id: number; name: string } | null>(null);
  const [yieldInfo, setYieldInfo] = useState<Awaited<ReturnType<typeof fetchRecipeYield>> | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAvailableRecipes(0).then(setRecipes);
  }, []);
  useEffect(() => {
    if (!picked) return;
    fetchRecipeYield(picked.id).then((r) => {
      setYieldInfo(r);
      setAmount(show(r.count ?? 1));
    });
  }, [picked]);

  const filtered = useMemo(() => {
    const n = foldText;
    const q = n(query);
    return (recipes ?? []).filter((r) => n(r.name).includes(q)).slice(0, 80);
  }, [recipes, query]);

  return (
    <ModalOverlay onClose={onClose} title="Ajouter à la production">
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          const n = parse(amount);
          if (!picked) return setError("Choisis une recette.");
          if (!(n > 0)) return setError("Indique une quantité.");
          const r = await addToProduction(picked.id, n);
          if (!r.ok) return setError(r.error);
          onAdded();
          onClose();
        }}
      >
        <label className="searchbox">
          <Search size={16} />
          <input placeholder="Rechercher une recette…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </label>
        <div className="fl-scroll" style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)" }}>
          {recipes === null ? (
            <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>Chargement…</div>
          ) : (
            filtered.map((r) => (
              <button
                type="button"
                key={r.id}
                className="pdf-theme-opt"
                aria-pressed={picked?.id === r.id}
                style={{ margin: 0, borderRadius: 0, borderBottom: "1px solid var(--border)" }}
                onClick={() => setPicked(r)}
              >
                <span style={{ flex: 1, fontSize: 13.5 }}>{r.name}</span>
              </button>
            ))
          )}
        </div>
        {picked && yieldInfo && (
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="fl-label" style={{ flex: "none" }}>{yieldInfo.count ? "Quantité" : "Multiplicateur ×"}</span>
            <input className="fl-input num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 100 }} />
            {yieldInfo.label && <span style={{ color: "var(--soft)" }}>{yieldInfo.label}</span>}
          </label>
        )}
        {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="fl-btn fl-btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" className="fl-btn fl-btn-primary" disabled={!picked}>Ajouter</button>
        </div>
      </form>
    </ModalOverlay>
  );
}

/** Aperçu à l'écran de la fiche : une carte par préparation, puis le total par ingrédient. */
export function ProductionSheetView({ sheet }: { sheet: ProductionSheet }) {
  return (
    <div className="prod-sheet">
      <div className="sect-title">
        <h2>Pesées</h2>
        <span style={{ color: "var(--muted)", fontSize: 12.5 }}>{formatG(Math.round(sheet.massG))} en tout, dans l&apos;ordre de fabrication</span>
      </div>
      <div className="prod-blocks">
        {sheet.blocks.map((b) => (
          <section key={`${b.isProduct ? "p" : "s"}${b.recipeId}`} className="fl-card prod-block" data-product={b.isProduct ? "true" : undefined}>
            <header>
              <h3>
                {!b.isProduct && <Layers size={14} style={{ color: "var(--accent)" }} />}
                {b.name}
              </h3>
              {b.target && <span className="fl-tag" style={{ color: "var(--accent)" }}>{b.target}</span>}
              <span className="num prod-mass">{formatG(Math.round(b.massG))}</span>
            </header>
            {b.usedIn.length > 0 && <p className="prod-for">Pour {b.usedIn.join(", ")}</p>}
            <ul>
              {b.lines.map((l, i) =>
                l.kind === "title" ? (
                  <li key={i} className="prod-ttl">{l.name}</li>
                ) : (
                  <li key={i}>
                    <span>{l.name}</span>
                    <b className="num">{l.unit === "QS" ? "QS" : formatQty(Math.round(l.qty * 100) / 100, l.unit)}</b>
                  </li>
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
      {sheet.totals.length > 0 && (
        <section className="fl-card prod-block prod-totals">
          <header>
            <h3>Total à sortir</h3>
          </header>
          <ul>
            {sheet.totals.map((t) => (
              <li key={`${t.name}|${t.unit}`}>
                <span>{t.name}</span>
                <b className="num">{t.qty === null ? "QS" : formatQty(Math.round(t.qty * 100) / 100, t.unit)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

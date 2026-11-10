"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { formatEuro } from "@/lib/cost";
import { bestPrice, buildComparison, type ComparisonRow } from "@/lib/suppliers";
import type { ProductDetail } from "@/lib/purchaseOrders";
import { ProductHistoryModal } from "./ProductHistoryModal";

type Supplier = { id: number; name: string; products: number; orders: number };

const MAX = 3;

/** « 64 % » ne se coupe pas avant le %. */
const nbsp = (t: string) => t.replace(/ (%|€)/g, "\u00a0$1");
const STORE = "rl-compare-suppliers";

/** « ▲ 6 % » / « ▼ 3 % » : évolution depuis la facture précédente. */
export function Change({ pct }: { pct: number | null }) {
  if (pct == null || pct === 0) return null;
  return (
    <span className={`sup-chg ${pct > 0 ? "up" : "down"}`} title="Depuis la facture précédente">
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct)} %
    </span>
  );
}

/** Tableau comparatif : un article par ligne, un fournisseur par colonne (3 au plus). */
export function PriceComparison({
  suppliers,
  products,
  bases,
}: {
  suppliers: Supplier[];
  products: ProductDetail[];
  bases: { id: number; name: string }[];
}) {
  const defaults = useMemo(
    () => suppliers.slice().sort((a, b) => b.products - a.products).slice(0, MAX).map((s) => s.id),
    [suppliers],
  );
  const [selected, setSelected] = useState<number[]>(defaults);
  const [often, setOften] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ productId: number; supplier: string } | null>(null);

  // Le choix des fournisseurs est retenu sur cet appareil.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? "null");
      if (Array.isArray(saved)) {
        const ok = saved.filter((id) => suppliers.some((s) => s.id === id)).slice(0, MAX);
        if (ok.length) setSelected(ok);
      }
    } catch {}
  }, [suppliers]);

  const toggle = (id: number) => {
    setSelected((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-MAX);
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const names = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const allRows = useMemo(() => buildComparison(products), [products]);
  const hasOften = allRows.some((r) => r.orders >= 2);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter(
      (r) =>
        selected.some((id) => r.cells[id]) &&
        (!often || r.orders >= 2) &&
        (!q ||
          r.article.toLowerCase().includes(q) ||
          Object.values(r.cells).some((c) => c.name.toLowerCase().includes(q))),
    );
  }, [allRows, selected, often, query]);

  const groups = useMemo(() => {
    const out: { family: string; rows: ComparisonRow[] }[] = [];
    for (const r of rows) {
      const last = out[out.length - 1];
      if (last && last.family === r.family) last.rows.push(r);
      else out.push({ family: r.family, rows: [r] });
    }
    return out;
  }, [rows]);

  // Colonnes dans l'ordre des boutons (alphabétique), pas dans l'ordre des clics.
  const cols = suppliers.filter((s) => selected.includes(s.id));

  return (
    <>
      <div className="sup-chips" role="group" aria-label="Fournisseurs à comparer (3 au plus)">
        {suppliers.map((s) => (
          <button key={s.id} type="button" className="fl-chip" aria-pressed={selected.includes(s.id)} onClick={() => toggle(s.id)}>
            {selected.includes(s.id) && <Check size={13} />}
            {s.name}
          </button>
        ))}
      </div>
      <div className="sup-tools">
        <div className="sup-search">
          <Search size={15} style={{ color: "var(--muted)", flex: "none" }} />
          <input
            className="fl-input"
            value={query}
            placeholder="Chercher un article"
            aria-label="Chercher un article"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="button" className="fl-chip" aria-pressed={!often} onClick={() => setOften(false)}>
          Tout
        </button>
        <button
          type="button"
          className="fl-chip"
          aria-pressed={often}
          onClick={() => setOften(true)}
          disabled={!hasOften}
          title={hasOften ? "Les articles achetés sur au moins 2 factures" : "Il faut au moins 2 factures pour le même article"}
        >
          Souvent commandés
        </button>
      </div>

      {cols.length === 0 ? (
        <p className="sub" style={{ color: "var(--muted)" }}>Choisis au moins un fournisseur au-dessus.</p>
      ) : (
        <div className="sup-table-wrap">
          <table className="sup-table">
            <thead>
              <tr>
                <th>Article</th>
                {cols.map((s) => (
                  <th key={s.id}>
                    <Link href={`/fournisseurs/${s.id}`}>{s.name}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 1} style={{ color: "var(--muted)" }}>
                    Aucun article.
                  </td>
                </tr>
              )}
              {groups.map((g) => (
                <FamilyRows
                  key={g.family}
                  family={g.family}
                  rows={g.rows}
                  cols={cols.map((c) => c.id)}
                  onOpen={(productId, supplierId) => {
                    const product = byId.get(productId);
                    if (product) setOpen({ productId, supplier: names.get(supplierId) ?? "" });
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="sup-legend">
        <span>
          <span className="sup-dot" />
          moins cher
        </span>
        <span>✕ pas chez ce fournisseur</span>
        <span>
          <span className="sup-chg up">▲</span> hausse depuis la facture précédente
        </span>
        <span>Touche un prix pour voir tout son historique</span>
      </div>

      {open && byId.get(open.productId) && <ProductHistoryModal product={byId.get(open.productId)!} supplier={open.supplier} bases={bases} onClose={() => setOpen(null)} />}
    </>
  );
}

function FamilyRows({
  family,
  rows,
  cols,
  onOpen,
}: {
  family: string;
  rows: ComparisonRow[];
  cols: number[];
  onOpen: (productId: number, supplierId: number) => void;
}) {
  return (
    <>
      <tr className="sup-fam">
        <td colSpan={cols.length + 1}>{family}</td>
      </tr>
      {rows.map((r) => {
        const best = bestPrice(r, cols);
        const pack = cols.map((id) => r.cells[id]?.packLabel).find(Boolean);
        return (
          <tr key={r.key}>
            <td>
              <b>{nbsp(r.article)}</b>
              <small>
                {pack ? `${pack} · ` : ""}/{r.unit}
              </small>
            </td>
            {cols.map((id) => {
              const c = r.cells[id];
              if (!c) {
                return (
                  <td key={id} className="sup-none" aria-label="Pas chez ce fournisseur">
                    ✕
                  </td>
                );
              }
              return (
                <td key={id}>
                  <button
                    type="button"
                    className={`sup-cell${best != null && c.price === best ? " best" : ""}`}
                    onClick={() => onOpen(c.productId, id)}
                    title={`${c.name} · facture du ${new Date(c.date).toLocaleDateString("fr-FR")}`}
                  >
                    <span>
                      {formatEuro(c.price)}
                      <span className="sup-unit"> /{c.unit}</span>
                    </span>
                    <Change pct={c.changePct} />
                  </button>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Pencil } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { useCan } from "@/components/auth/Permissions";
import { renameSupplier } from "@/app/actions/suppliers";
import { formatEuro } from "@/lib/cost";
import { groupByArticle } from "@/lib/suppliers";
import type { loadSupplier } from "@/lib/purchaseOrders";
import { Change } from "./PriceComparison";
import { ProductHistoryModal } from "./ProductHistoryModal";
import { InvoiceList } from "./InvoiceList";

type Supplier = NonNullable<Awaited<ReturnType<typeof loadSupplier>>>;

/** Fiche d'un fournisseur : ses produits (dernier prix, évolution, moyenne) et ses factures. */
export function SupplierDetail({ supplier, bases }: { supplier: Supplier; bases: { id: number; name: string }[] }) {
  const can = useCan();
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  // Les variantes d'un même article (« Fraise France », « Fraise Espagne ») tiennent sur une ligne.
  const groups = useMemo(() => groupByArticle(supplier.products), [supplier.products]);
  const open = groups.find((g) => g.key === openKey);
  const total = supplier.orders.reduce((s, o) => s + (o.total ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <h1>{supplier.name}</h1>
        {can("costs.edit") && (
          <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setRenaming(true)}>
            <Pencil size={15} /> Renommer
          </button>
        )}
        <p className="sub">
          {groups.length} article{groups.length > 1 ? "s" : ""} · {supplier.orders.length} facture
          {supplier.orders.length > 1 ? "s" : ""}
          {total > 0 ? ` · ${formatEuro(total)} au total` : ""}
        </p>
      </div>

      <div className="sect-title">
        <h2>Produits</h2>
      </div>
      <div className="fl-list">
        {groups.map((g) => {
          const p = g.products[0];
          const several = g.products.length > 1;
          const base = g.products.find((x) => x.base?.chosen)?.base ?? g.products.find((x) => x.base)?.base;
          return (
            <button key={g.key} type="button" className="fl-row" style={{ width: "100%", textAlign: "left" }} onClick={() => setOpenKey(g.key)}>
              <span className="ic">
                <Package size={16} />
              </span>
              <span className="set-tx">
                <b>
                  <span>{several ? g.article : p.name}</span>
                </b>
                <small>
                  {[
                    several ? `${g.products.length} variantes : ${g.products.map((x) => x.name).join(", ")}` : p.packLabel,
                    base ? `ingrédient « ${base.name} »${base.chosen ? " ✓" : ""}` : null,
                    g.stats ? `moyenne ${formatEuro(g.stats.average)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
              {g.stats && (
                <span className="sup-num strong" style={{ textAlign: "right" }}>
                  {formatEuro(g.stats.current)}
                  <span className="sup-unit"> /{g.stats.unit}</span>
                  <br />
                  <Change pct={g.stats.changePct} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="sect-title" style={{ marginTop: 20 }}>
        <h2>Factures</h2>
      </div>
      <InvoiceList orders={supplier.orders} showSupplier={false} />

      {open && <ProductHistoryModal products={open.products} supplier={supplier.name} bases={bases} onClose={() => setOpenKey(null)} />}
      {renaming && (
        <RenameModal
          name={supplier.name}
          onClose={() => setRenaming(false)}
          onSave={async (name) => {
            const r = await renameSupplier(supplier.id, name);
            if (!r.ok) return r.error;
            setRenaming(false);
            router.refresh();
            return null;
          }}
        />
      )}
    </>
  );
}

function RenameModal({ name, onClose, onSave }: { name: string; onClose: () => void; onSave: (n: string) => Promise<string | null> }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <ModalOverlay onClose={onClose} title="Renommer le fournisseur">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(await onSave(value));
          setBusy(false);
        }}
        style={{ display: "grid", gap: 10 }}
      >
        <input className="fl-input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus aria-label="Nom" />
        {error && <span className="ing-fact-msg" data-err="true">{error}</span>}
        <button type="submit" className="fl-btn fl-btn-primary" disabled={busy}>
          Enregistrer
        </button>
      </form>
    </ModalOverlay>
  );
}

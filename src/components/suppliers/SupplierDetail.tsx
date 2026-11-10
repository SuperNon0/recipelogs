"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Pencil } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { useCan } from "@/components/auth/Permissions";
import { renameSupplier } from "@/app/actions/suppliers";
import { formatEuro } from "@/lib/cost";
import type { loadSupplier } from "@/lib/purchaseOrders";
import { Change } from "./PriceComparison";
import { ProductHistoryModal } from "./ProductHistoryModal";
import { InvoiceList } from "./InvoiceList";

type Supplier = NonNullable<Awaited<ReturnType<typeof loadSupplier>>>;

/** Fiche d'un fournisseur : ses produits (dernier prix, évolution, moyenne) et ses factures. */
export function SupplierDetail({ supplier, bases }: { supplier: Supplier; bases: { id: number; name: string }[] }) {
  const can = useCan();
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const open = supplier.products.find((p) => p.id === openId);
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
          {supplier.products.length} produit{supplier.products.length > 1 ? "s" : ""} · {supplier.orders.length} facture
          {supplier.orders.length > 1 ? "s" : ""}
          {total > 0 ? ` · ${formatEuro(total)} au total` : ""}
        </p>
      </div>

      <div className="sect-title">
        <h2>Produits</h2>
      </div>
      <div className="fl-list">
        {supplier.products.map((p) => (
          <button key={p.id} type="button" className="fl-row" style={{ width: "100%", textAlign: "left" }} onClick={() => setOpenId(p.id)}>
            <span className="ic">
              <Package size={16} />
            </span>
            <span className="set-tx">
              <b>
                <span>{p.name}</span>
              </b>
              <small>
                {[p.packLabel, p.base ? `ingrédient « ${p.base.name} »${p.base.chosen ? " ✓" : ""}` : null, p.stats ? `moyenne ${formatEuro(p.stats.average)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            {p.stats && (
              <span className="sup-num strong" style={{ textAlign: "right" }}>
                {formatEuro(p.stats.current)}
                <span className="sup-unit"> /{p.stats.unit}</span>
                <br />
                <Change pct={p.stats.changePct} />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="sect-title" style={{ marginTop: 20 }}>
        <h2>Factures</h2>
      </div>
      <InvoiceList orders={supplier.orders} showSupplier={false} />

      {open && <ProductHistoryModal product={open} supplier={supplier.name} bases={bases} onClose={() => setOpenId(null)} />}
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

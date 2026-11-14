"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { useCan } from "@/components/auth/Permissions";
import { Help } from "@/components/ui/Help";
import { formatEuro } from "@/lib/cost";
import { groupByArticle } from "@/lib/suppliers";
import type { loadSupplier } from "@/lib/purchaseOrders";
import { Change } from "./PriceComparison";
import { ProductHistoryModal } from "./ProductHistoryModal";
import { InvoiceList } from "./InvoiceList";
import { DeleteSupplierModal, ProductFormModal, SupplierFormModal } from "./ManageForms";

type Supplier = NonNullable<Awaited<ReturnType<typeof loadSupplier>>>;

/** Fiche d'un fournisseur : ses produits (dernier prix, évolution, moyenne) et ses factures. */
export function SupplierDetail({ supplier, bases }: { supplier: Supplier; bases: { id: number; name: string }[] }) {
  const can = useCan();
  const router = useRouter();
  const editable = can("costs.edit");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [modal, setModal] = useState<"edit" | "delete" | "product" | null>(null);
  // Les variantes d'un même article (« Fraise France », « Fraise Espagne ») tiennent sur une ligne.
  const groups = useMemo(() => groupByArticle(supplier.products), [supplier.products]);
  const open = groups.find((g) => g.key === openKey);
  const total = supplier.orders.reduce((s, o) => s + (o.total ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <h1>{supplier.name}</h1>
        {editable && (
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setModal("edit")}>
              <Pencil size={15} /> Modifier
            </button>
            <button type="button" className="fl-btn fl-btn-danger" onClick={() => setModal("delete")}>
              <Trash2 size={15} /> Supprimer
            </button>
          </span>
        )}
        <p className="sub">
          {groups.length} article{groups.length > 1 ? "s" : ""} · {supplier.orders.length} facture
          {supplier.orders.length > 1 ? "s" : ""}
          {total > 0 ? ` · ${formatEuro(total)} au total` : ""}
        </p>
        {supplier.note && <p className="sub" style={{ whiteSpace: "pre-line" }}>{supplier.note}</p>}
      </div>

      <div className="sect-title" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2>Produits</h2>
        <Help title="Gérer les produits" example="Touche « Farine T45 », puis « Ajouter un prix » : 0,92 € le kg au 14/11.">
          Touche un produit pour voir tous ses prix. Là, tu peux ajouter un prix, corriger ou supprimer un prix, modifier le produit
          (nom, contenance, nom pour comparer) ou le supprimer. « Ajouter un produit » crée un produit à la main, sans facture.
        </Help>
        {editable && (
          <button type="button" className="fl-btn fl-btn-secondary" style={{ marginLeft: "auto" }} onClick={() => setModal("product")}>
            <Plus size={15} /> Ajouter un produit
          </button>
        )}
      </div>
      <div className="fl-list">
        {groups.length === 0 && (
          <div className="fl-row" style={{ color: "var(--muted)" }}>
            Aucun produit pour l&apos;instant.{editable ? " Touche « Ajouter un produit »." : ""}
          </div>
        )}
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
                    g.stats ? `moyenne ${formatEuro(g.stats.average)}` : "pas encore de prix",
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
      {modal === "edit" && (
        <SupplierFormModal supplier={{ id: supplier.id, name: supplier.name, note: supplier.note }} onClose={() => setModal(null)} />
      )}
      {modal === "delete" && (
        <DeleteSupplierModal id={supplier.id} onClose={() => setModal(null)} onDeleted={() => router.push("/fournisseurs/liste")} />
      )}
      {modal === "product" && <ProductFormModal supplierId={supplier.id} onClose={() => setModal(null)} />}
    </>
  );
}

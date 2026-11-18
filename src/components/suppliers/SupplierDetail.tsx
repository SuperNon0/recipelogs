"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { History, Layers, Package, Pencil, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { useCan } from "@/components/auth/Permissions";
import { Help } from "@/components/ui/Help";
import { formatEuro } from "@/lib/cost";
import { groupByArticle } from "@/lib/suppliers";
import type { loadSupplier } from "@/lib/purchaseOrders";
import { Change } from "./PriceComparison";
import { ProductHistoryModal } from "./ProductHistoryModal";
import { InvoiceList } from "./InvoiceList";
import { DeleteSupplierModal, ProductFormModal, SupplierFormModal } from "./ManageForms";
import { FacturesATraiter, NouvelleMercurialeButton } from "./NouvelleFacture";
import type { PendingInvoiceItem } from "@/lib/pendingInvoices";
import { GroupProductsModal } from "./GroupProducts";
import { articleKey } from "@/lib/suppliers";

const PAGE = 150;

type Supplier = NonNullable<Awaited<ReturnType<typeof loadSupplier>>>;

/** Fiche d'un fournisseur : ses produits (dernier prix, évolution, moyenne) et ses factures. */
/** aTraiter : mercuriales de ce fournisseur gardées « à traiter ». */
export function SupplierDetail({ supplier, bases, aTraiter = [] }: { supplier: Supplier; bases: { id: number; name: string }[]; aTraiter?: PendingInvoiceItem[] }) {
  const can = useCan();
  const router = useRouter();
  const editable = can("costs.edit");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [modal, setModal] = useState<"edit" | "delete" | "product" | "group" | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  // Les variantes d'un même article (« Fraise France », « Fraise Espagne ») tiennent sur une ligne.
  const groups = useMemo(() => groupByArticle(supplier.products), [supplier.products]);
  const open = groups.find((g) => g.key === openKey);
  // Recherche dans les noms, les articles et les références : utile avec une mercuriale de plusieurs centaines de produits.
  const words = articleKey(query).split(" ").filter(Boolean);
  const filtered = words.length
    ? groups.filter((g) => {
        const hay = articleKey([g.article, ...g.products.map((p) => `${p.name} ${p.reference ?? ""}`)].join(" "));
        return words.every((w) => hay.includes(w));
      })
    : groups;
  const total = supplier.orders.reduce((s, o) => s + (o.total ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <h1>{supplier.name}</h1>
        {editable && (
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/fournisseurs/${supplier.id}/commande`} className="fl-btn fl-btn-primary">
              <ShoppingCart size={15} /> Passer une commande
            </Link>
            <NouvelleMercurialeButton fournisseur={{ id: supplier.id, name: supplier.name }} />
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
      {editable && <FacturesATraiter factures={aTraiter} fournisseurs={[]} limite={0} fournisseur={{ id: supplier.id, name: supplier.name }} />}

      <div className="sect-title" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2>Produits</h2>
        <Help title="Gérer les produits" example="Touche « Farine T45 », puis « Ajouter un prix » : 0,92 € le kg au 14/11.">
          Touche un produit pour voir tous ses prix. Là, tu peux ajouter un prix, corriger ou supprimer un prix, modifier le produit
          (nom, contenance, nom pour comparer) ou le supprimer. « Ajouter un produit » crée un produit à la main, sans facture.
        </Help>
        {editable && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setModal("group")}>
              <Layers size={15} /> Regrouper
            </button>
            <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setModal("product")}>
              <Plus size={15} /> Ajouter un produit
            </button>
          </span>
        )}
      </div>
      {groups.length > 8 && (
        <div className="sup-detail-tools">
          <div className="sup-search">
            <Search size={15} style={{ color: "var(--muted)", flex: "none" }} />
            <input
              className="fl-input"
              value={query}
              placeholder={`Chercher parmi ${groups.length} articles`}
              aria-label="Chercher un produit"
              onChange={(e) => {
                setQuery(e.target.value);
                setShown(PAGE);
              }}
            />
            {query && (
              <button type="button" className="fl-btn fl-btn-ghost fl-btn-icon" aria-label="Effacer la recherche" onClick={() => setQuery("")}>
                <X size={15} />
              </button>
            )}
          </div>
          <Link href="/fournisseurs/commandes" className="fl-btn fl-btn-ghost">
            <History size={15} /> Commandes
          </Link>
        </div>
      )}
      <div className="fl-list">
        {groups.length === 0 && (
          <div className="fl-row" style={{ color: "var(--muted)" }}>
            Aucun produit pour l&apos;instant.{editable ? " Touche « Ajouter un produit »." : ""}
          </div>
        )}
        {words.length > 0 && filtered.length === 0 && (
          <div className="fl-row" style={{ color: "var(--muted)" }}>
            Aucun produit ne correspond.
          </div>
        )}
        {filtered.slice(0, shown).map((g) => {
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

      {filtered.length > shown && (
        <button type="button" className="fl-btn fl-btn-ghost" style={{ marginTop: 8 }} onClick={() => setShown((n) => n + PAGE)}>
          Afficher la suite ({filtered.length - shown})
        </button>
      )}

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
      {modal === "group" && (
        <GroupProductsModal
          supplierId={supplier.id}
          products={supplier.products.map((p) => ({ id: p.id, name: p.name, article: p.article }))}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

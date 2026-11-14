"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Hand, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { useCan } from "@/components/auth/Permissions";
import { chooseIngredientProduct, linkProduct, updateProductInfo } from "@/app/actions/suppliers";
import { SUPPLIER_FAMILIES, groupByArticle } from "@/lib/suppliers";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";
import { formatEuro } from "@/lib/cost";
import type { ProductDetail } from "@/lib/purchaseOrders";
import { Change } from "./PriceComparison";
import { DeleteProductModal, PriceFormModal, ProductFormModal, type EditablePrice } from "./ManageForms";

type Dialog =
  | { kind: "addPrice"; product: ProductDetail }
  | { kind: "editPrice"; product: { name: string; unit: string }; price: EditablePrice }
  | { kind: "editProduct"; product: ProductDetail }
  | { kind: "deleteProduct"; product: ProductDetail };

const editableOf = (p: ProductDetail) => ({
  id: p.id,
  name: p.name,
  reference: p.reference,
  article: p.article,
  family: p.family,
  unit: p.unit,
  packSize: p.packSize,
  hasPrices: p.history.length > 0,
});

/** Ajouter un prix, modifier, supprimer : les boutons d'un produit. */
function ProductActions({ product, onDialog }: { product: ProductDetail; onDialog: (d: Dialog) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
      <button type="button" className="fl-btn fl-btn-primary" onClick={() => onDialog({ kind: "addPrice", product })}>
        <Plus size={15} /> Ajouter un prix
      </button>
      <button type="button" className="fl-btn fl-btn-secondary" onClick={() => onDialog({ kind: "editProduct", product })}>
        <Pencil size={15} /> Modifier
      </button>
      <button type="button" className="fl-btn fl-btn-danger" onClick={() => onDialog({ kind: "deleteProduct", product })}>
        <Trash2 size={15} /> Supprimer
      </button>
      <Help title="Gérer ce produit" example="Le prix de la facture a été mal lu : touche le crayon à côté du prix et corrige-le.">
        « Ajouter un prix » garde un nouveau prix à la date que tu choisis, sans facture (prix annoncé au téléphone, tarif…).
        « Modifier » change le nom, la contenance ou le nom pour comparer. Le crayon à côté d&apos;un prix le corrige ou le supprime.
        « Supprimer » enlève le produit et tous ses prix.
      </Help>
    </div>
  );
}

const fr = (d: string) => new Date(d).toLocaleDateString("fr-FR");

/**
 * Tous les prix payés pour un article chez un fournisseur, chacun relié à sa
 * facture, avec un filtre du… au…. Les variantes de l'article (« Fraise
 * France », « Fraise Espagne ») sont réunies : chaque prix dit laquelle.
 */
export function ProductHistoryModal({
  products,
  supplier,
  bases,
  onClose,
}: {
  /** Les variantes de l'article (une seule s'il n'y en a pas d'autre). */
  products: ProductDetail[];
  supplier: string;
  /** Ingrédients des recettes, pour relier le produit (si on peut modifier les prix). */
  bases?: { id: number; name: string }[];
  onClose: () => void;
}) {
  const can = useCan();
  const editable = can("costs.edit");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const group = useMemo(() => groupByArticle(products)[0], [products]);
  const several = products.length > 1;
  const list = useMemo(
    () => (group?.history ?? []).filter((h) => (!from || h.date >= from) && (!to || h.date <= to)),
    [group, from, to],
  );
  if (!group) return null;
  const byId = new Map(products.map((p) => [p.id, p]));
  const single = products[0];
  const stats = group.stats;
  const unit = stats?.unit ?? group.unit;
  const same = list.filter((h) => h.unit === unit);
  const avg = same.length ? same.reduce((s, h) => s + h.price, 0) / same.length : null;
  const min = same.length ? Math.min(...same.map((h) => h.price)) : null;
  const max = same.length ? Math.max(...same.map((h) => h.price)) : null;
  const linked = [...new Set(products.map((p) => p.base?.name).filter(Boolean))];

  return (
    <ModalOverlay onClose={onClose} title={several ? group.article : single.name}>
      <p className="sub" style={{ color: "var(--muted)", marginTop: -6, marginBottom: 12, fontSize: 13 }}>
        {supplier}
        {several ? ` · ${products.length} variantes` : single.packLabel ? ` · ${single.packLabel}` : ""}
        {linked.length ? ` · ingrédient « ${linked.join(" », « ")} »` : ""}
      </p>
      {stats && (
        <div className="sup-hist-stats">
          <div>
            <small>Dernier prix</small>
            <b>{formatEuro(stats.current)}</b> <Change pct={stats.changePct} />
          </div>
          <div>
            <small>Moyenne{from || to ? " (période)" : ""}</small>
            <b>{avg != null ? formatEuro(avg) : "—"}</b>
          </div>
          <div>
            <small>Plus bas · haut</small>
            <b>{min != null && max != null ? `${formatEuro(min)} · ${formatEuro(max)}` : "—"}</b>
          </div>
        </div>
      )}
      {editable && !several && <ProductActions product={single} onDialog={setDialog} />}
      {bases && editable && !several && <ProductSettings product={single} bases={bases} />}
      <div className="sup-range">
        <span className="sup-dates">
        <span>Du</span>
        <input type="date" className="fl-input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Depuis le" />
        <span>au</span>
        <input type="date" className="fl-input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Jusqu'au" />
        </span>
        {(from || to) && (
          <button type="button" className="fl-btn fl-btn-ghost" onClick={() => { setFrom(""); setTo(""); }}>
            Toutes les dates
          </button>
        )}
      </div>
      <div className="fl-list">
        {list.length === 0 && <div className="fl-row" style={{ color: "var(--muted)" }}>Aucun prix sur cette période.</div>}
        {list.map((h, i) => {
          const label = (
            <>
              <b>
                <span>{fr(h.date)}</span>
              </b>
              <small>
                {several ? `${h.productName} · ` : ""}
                {h.manual ? "Prix tapé à la main" : `Facture${h.number ? ` n° ${h.number}` : ""}`}
                {h.quantity != null ? ` · ${h.quantity.toLocaleString("fr-FR")} acheté${h.quantity > 1 ? "s" : ""}` : ""}
              </small>
            </>
          );
          return (
            <div key={`${h.lineId}-${i}`} className="fl-row">
              <span className="ic">{h.manual ? <Hand size={16} /> : <Receipt size={16} />}</span>
              {h.manual ? (
                <span className="set-tx">{label}</span>
              ) : (
                <Link href={`/factures/${h.orderId}`} className="set-tx" style={{ color: "inherit" }}>
                  {label}
                </Link>
              )}
              <span className="sup-num strong">
                {formatEuro(h.price)}
                <span className="sup-unit"> /{h.unit}</span>
              </span>
              {editable ? (
                <button
                  type="button"
                  className="fl-btn fl-btn-ghost fl-btn-icon"
                  aria-label="Corriger ou supprimer ce prix"
                  onClick={() =>
                    setDialog({
                      kind: "editPrice",
                      product: { name: h.productName, unit: h.unit },
                      price: { lineId: h.lineId, price: h.price, date: h.date, quantity: h.quantity, manual: h.manual, invoiceNumber: h.number },
                    })
                  }
                >
                  <Pencil size={15} />
                </button>
              ) : (
                !h.manual && <ChevronRight size={16} className="set-chev" />
              )}
            </div>
          );
        })}
      </div>
      {several && (
        <p className="sub" style={{ color: "var(--muted)", fontSize: 13, margin: "16px 0 10px", display: "flex", gap: 6, alignItems: "center" }}>
          Variantes regroupées sous « {group.article} »
          <Help title="Variantes regroupées">
            Les produits qui ont le même nom dans « Comparer sous le nom » sont un seul article : par exemple « Fraise France » et
            « Fraise Espagne » sont rangées sous « Fraise ». Leurs prix forment un seul historique, et chaque prix rappelle ce qui
            était écrit sur la facture. Pour séparer une variante, ouvre-la plus bas et change son nom pour comparer.
          </Help>
        </p>
      )}
      {several && editable && (
          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {products.map((p) => (
              <details key={p.id} className="fl-card" style={{ padding: "8px 12px" }}>
                <summary style={{ cursor: "pointer", fontSize: 14 }}>
                  {p.name}
                  {p.stats ? ` · ${formatEuro(p.stats.current)} /${p.stats.unit}` : ""}
                </summary>
                <div style={{ marginTop: 10 }}>
                  <ProductActions product={p} onDialog={setDialog} />
                  {bases && <ProductSettings product={p} bases={bases} />}
                </div>
              </details>
            ))}
          </div>
      )}
      {dialog?.kind === "addPrice" && (
        <PriceFormModal productId={dialog.product.id} productName={dialog.product.name} unit={dialog.product.unit} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "editPrice" && (
        <PriceFormModal productName={dialog.product.name} unit={dialog.product.unit} price={dialog.price} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "editProduct" && (
        <ProductFormModal
          product={editableOf(byId.get(dialog.product.id) ?? dialog.product)}
          onClose={() => setDialog(null)}
          onDelete={() => setDialog({ kind: "deleteProduct", product: dialog.product })}
        />
      )}
      {dialog?.kind === "deleteProduct" && (
        <DeleteProductModal
          product={{
            id: dialog.product.id,
            name: dialog.product.name,
            prices: dialog.product.history.length,
            invoices: new Set(dialog.product.history.filter((h) => !h.manual).map((h) => h.orderId)).size,
          }}
          onClose={() => setDialog(null)}
          onDeleted={() => products.length === 1 && onClose()}
        />
      )}
    </ModalOverlay>
  );
}

/** Ingrédient relié, nom pour comparer et famille d'un produit. */
function ProductSettings({ product, bases }: { product: ProductDetail; bases: { id: number; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<number | null>(product.base?.id ?? null);
  const [chosen, setChosen] = useState(product.base?.chosen ?? false);
  const [article, setArticle] = useState(product.article ?? "");
  const [family, setFamily] = useState(product.family ?? "");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Erreur");
      setError(null);
      after?.();
      router.refresh();
    });

  return (
    <div className="fl-card" style={{ padding: 12, marginBottom: 14, display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="fl-label">Ingrédient des recettes</span>
        <select
          className="fl-input"
          value={baseId ?? ""}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            run(() => linkProduct(product.id, v), () => { setBaseId(v); setChosen(false); });
          }}
        >
          <option value="">— Aucun (ne sert pas en recette) —</option>
          {bases.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>
      {baseId != null &&
        (chosen ? (
          <span style={{ color: "var(--accent-2)", fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <Check size={14} /> Ce prix est utilisé dans le coût des recettes
          </span>
        ) : (
          <button
            type="button"
            className="fl-btn fl-btn-secondary"
            disabled={pending}
            onClick={() => run(() => chooseIngredientProduct(baseId, product.id), () => setChosen(true))}
          >
            Utiliser ce prix dans les recettes
          </button>
        ))}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="fl-label">Comparer sous le nom</span>
          <input
            className="fl-input"
            value={article}
            placeholder={product.name}
            onChange={(e) => setArticle(e.target.value)}
            onBlur={() => article !== (product.article ?? "") && run(() => updateProductInfo(product.id, { article }))}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="fl-label">Famille</span>
          <input
            className="fl-input"
            list="sup-families"
            value={family}
            placeholder="Autres"
            onChange={(e) => setFamily(e.target.value)}
            onBlur={() => family !== (product.family ?? "") && run(() => updateProductInfo(product.id, { family }))}
          />
          <datalist id="sup-families">
            {SUPPLIER_FAMILIES.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
      </div>
      {error && <span className="ing-fact-msg" data-err="true">{error}</span>}
    </div>
  );
}

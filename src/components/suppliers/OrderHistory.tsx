"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardCopy, FileText, RotateCcw, Send, ShoppingCart, Store, Trash2 } from "lucide-react";
import { useCan } from "@/components/auth/Permissions";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";
import { formatEuro } from "@/lib/cost";
import { articleKey } from "@/lib/suppliers";
import { qtyLabel } from "@/lib/supplierOrders";
import type { SupplierOrderDetail, SupplierOrderListItem } from "@/lib/supplierOrdersDb";
import { supprimerCommande } from "@/app/actions/supplierOrders";
import { copyText, useCanShare } from "./copyText";

const frDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const s = (n: number) => (n > 1 ? "s" : "");

/** Page Commandes : choisir un fournisseur pour commander, et l'historique des commandes. */
export function OrderHistory({ orders, suppliers }: { orders: SupplierOrderListItem[]; suppliers: { id: number; name: string; products: number }[] }) {
  const can = useCan();
  return (
    <>
      <div className="page-head">
        <h1>Commandes</h1>
        <p className="sub">
          Choisis un fournisseur pour passer une commande. Toutes tes commandes restent ici, avec leur PDF.
          <Help title="Commandes" example="Touche « Metro », mets 2 cartons de croissants, puis « Enregistrer et copier » et colle le texte dans un message au commercial.">
            Une commande se prépare en touchant des boutons (1, 2, 3, carton, sac, kg), sans rien taper. Une fois enregistrée, elle est
            gardée ici à sa date, avec le fournisseur et ta signature : tu peux recopier le texte, revoir le PDF ou la refaire
            telle quelle.
          </Help>
        </p>
      </div>
      {can("costs.edit") && (
        <>
          <div className="sect-title">
            <h2>Passer une commande</h2>
          </div>
          <div className="ord-suppliers">
            {suppliers.length === 0 && <span className="sub">Aucun fournisseur pour l&apos;instant.</span>}
            {suppliers.map((sp) => (
              <Link key={sp.id} href={`/fournisseurs/${sp.id}/commande`} className="fl-row">
                <span className="ic">
                  <Store size={16} />
                </span>
                <span className="set-tx">
                  <b>
                    <span>{sp.name}</span>
                  </b>
                  <small>
                    {sp.products} produit{s(sp.products)}
                  </small>
                </span>
                <ShoppingCart size={16} className="set-chev" />
              </Link>
            ))}
          </div>
        </>
      )}
      <div className="sect-title" style={{ marginTop: 20 }}>
        <h2>Commandes passées</h2>
      </div>
      <div className="fl-list">
        {orders.length === 0 && <div className="fl-row" style={{ color: "var(--muted)" }}>Aucune commande pour l&apos;instant.</div>}
        {orders.map((o) => (
          <Link key={o.id} href={`/fournisseurs/commandes/${o.id}`} className="fl-row">
            <span className="ic">
              <FileText size={16} />
            </span>
            <span className="set-tx">
              <b>
                <span>
                  {o.supplier} · {frDay(o.date)}
                </span>
              </b>
              <small>
                {[`${o.lines} produit${s(o.lines)}`, o.deliveryDate ? `livraison ${frDay(o.deliveryDate)}` : null, o.estimate ? `≈ ${formatEuro(o.estimate)} HT` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            <ChevronRight size={16} className="set-chev" />
          </Link>
        ))}
      </div>
    </>
  );
}

/** Une commande : texte à copier, PDF, refaire, supprimer. */
export function OrderDetail({ order: o }: { order: SupplierOrderDetail }) {
  const can = useCan();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canShare = useCanShare();

  const redo = () => {
    const picks: Record<string, { q: number; unit: string }> = {};
    for (const l of o.lines) picks[l.productId ? `p:${l.productId}` : `a:${articleKey(l.label)}`] = { q: l.quantity, unit: l.unit };
    try {
      localStorage.setItem(`recipelog-commande-${o.supplierId}`, JSON.stringify(picks));
    } catch {
      /* rien : la page s'ouvre avec une commande vide */
    }
    router.push(`/fournisseurs/${o.supplierId}/commande`);
  };

  return (
    <>
      <div className="page-head">
        <h1>
          {o.supplier} · {frDay(o.date)}
        </h1>
        <p className="sub">
          {[
            `${o.lines.length} produit${s(o.lines.length)}`,
            o.signature ? `signée ${o.signature}` : null,
            o.deliveryDate ? `pour le ${frDay(o.deliveryDate)}` : null,
            o.addedBy ? `passée par ${o.addedBy}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="ord-actions" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className="fl-btn fl-btn-primary"
          onClick={async () => {
            setCopied(await copyText(o.text));
            setTimeout(() => setCopied(false), 2500);
          }}
        >
          <ClipboardCopy size={15} /> {copied ? "Copié" : "Copier le texte"}
        </button>
        {canShare && (
          <button type="button" className="fl-btn fl-btn-secondary" onClick={() => navigator.share({ text: o.text }).catch(() => undefined)}>
            <Send size={15} /> Envoyer…
          </button>
        )}
        <a className="fl-btn fl-btn-secondary" href={`/api/commandes/${o.id}/pdf`} target="_blank" rel="noreferrer">
          <FileText size={15} /> PDF
        </a>
        {can("costs.edit") && (
          <>
            <button type="button" className="fl-btn fl-btn-secondary" onClick={redo}>
              <RotateCcw size={15} /> Refaire cette commande
            </button>
            <button type="button" className="fl-btn fl-btn-danger" onClick={() => setConfirm(true)}>
              <Trash2 size={15} /> Supprimer
            </button>
          </>
        )}
        <Help title="Refaire cette commande">
          Ouvre la page de commande de ce fournisseur avec les mêmes produits et quantités déjà choisis : change ce qu&apos;il faut, puis
          enregistre. La commande d&apos;origine ne bouge pas.
        </Help>
      </div>
      <div className="ord-review">
        {o.lines.map((l) => (
          <div key={l.id} className="ord-review-row">
            <b className="num">{qtyLabel(l.quantity, l.unit)}</b>
            <span>
              {l.label}
              {l.reference && <small> · réf. {l.reference}</small>}
              {l.productId == null && <small> (variante au choix du commercial)</small>}
            </span>
            <span className="num ord-review-price">{l.unitPrice != null ? formatEuro(l.unitPrice * l.quantity) : ""}</span>
          </div>
        ))}
        {o.estimate != null && (
          <div className="ord-review-total">
            Total estimé : <b className="num">{formatEuro(o.estimate)} HT</b>
            {o.unpriced > 0 && <small> (sans {o.unpriced} ligne{s(o.unpriced)} sans prix)</small>}
          </div>
        )}
      </div>
      <div className="sect-title" style={{ marginTop: 20 }}>
        <h2>Texte envoyé</h2>
      </div>
      <pre className="ord-text">{o.text}</pre>

      {confirm && (
        <ModalOverlay title="Supprimer cette commande ?" onClose={() => setConfirm(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            <p className="sub" style={{ margin: 0 }}>
              La commande {o.supplier} du {frDay(o.date)} et son PDF disparaissent de l&apos;historique. Les produits et les prix ne changent pas.
            </p>
            {error && <span className="ing-fact-msg" data-err="true">{error}</span>}
            <div className="ord-actions">
              <button
                type="button"
                className="fl-btn fl-btn-danger"
                onClick={async () => {
                  const r = await supprimerCommande(o.id);
                  if (!r.ok) return setError(r.error);
                  router.push("/fournisseurs/commandes");
                }}
              >
                <Trash2 size={15} /> Supprimer
              </button>
              <button type="button" className="fl-btn fl-btn-ghost" onClick={() => setConfirm(false)}>
                Annuler
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}

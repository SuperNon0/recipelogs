"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, Trash2, X } from "lucide-react";
import { useCan } from "@/components/auth/Permissions";
import { deleteInvoice, removeInvoiceAttachment, uploadInvoiceFile } from "@/app/actions/suppliers";
import { formatEuro } from "@/lib/cost";
import type { loadPurchaseOrder } from "@/lib/purchaseOrders";

type Order = NonNullable<Awaited<ReturnType<typeof loadPurchaseOrder>>>;

const qty = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });

/** Détail d'une facture : ses lignes, son total, la photo ou le PDF joint. */
export function InvoiceDetail({ order }: { order: Order }) {
  const can = useCan();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileUrl = `/api/factures/${order.id}/fichier`;
  const linesTotal = order.lines.reduce((s, l) => s + (l.amount ?? 0), 0);

  const upload = (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    start(async () => {
      const r = await uploadInvoiceFile(order.id, fd);
      setError(r.ok ? null : r.error);
      router.refresh();
    });
  };

  return (
    <>
      <div className="page-head">
        <h1>
          <Link href={`/fournisseurs/${order.supplier.id}`}>{order.supplier.name}</Link>
        </h1>
        {can("costs.edit") && (
          <button
            type="button"
            className="fl-btn fl-btn-secondary"
            disabled={pending}
            onClick={() => {
              if (!confirm("Supprimer cette facture ?\n\nSes prix sortent de l'historique ; les produits qui ne sont sur aucune autre facture sont retirés.")) return;
              start(async () => {
                const r = await deleteInvoice(order.id);
                if (!r.ok) return setError(r.error);
                router.push("/factures");
              });
            }}
          >
            <Trash2 size={15} /> Supprimer
          </button>
        )}
        <p className="sub">
          Facture du {new Date(order.date).toLocaleDateString("fr-FR")}
          {order.number ? ` · n° ${order.number}` : ""} · {order.lines.length} ligne{order.lines.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className="fl-list">
        {order.lines.map((l) => (
          <div key={l.id} className="inv-line">
            <span>
              {l.product}
              <br />
              <small>
                {[
                  l.quantity != null ? `${qty(l.quantity)} × ${l.each != null ? formatEuro(l.each) : "prix du colis inconnu"}` : null,
                  l.packLabel,
                  l.ingredient ? `ingrédient « ${l.ingredient.name} »` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
            <span className="r">
              <span className="sup-num strong">{l.amount != null ? formatEuro(l.amount) : ""}</span>
              <br />
              <small>
                {formatEuro(l.unitPrice)} /{l.unit}
              </small>
            </span>
          </div>
        ))}
        <div className="sup-total">
          <span>Total HT</span>
          <span className="sup-num strong">{formatEuro(order.total ?? linesTotal)}</span>
        </div>
      </div>
      {order.note && <p style={{ color: "var(--soft)", fontSize: 14, marginTop: 12 }}>{order.note}</p>}

      <div className="sect-title" style={{ marginTop: 20 }}>
        <h2>Facture d&apos;origine</h2>
      </div>
      <div className="fl-card">
        <div className="inv-file">
          {order.file ? (
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="fl-btn fl-btn-secondary">
              <FileText size={15} /> Ouvrir {order.file.type === "pdf" ? "le PDF" : "la photo"}
            </a>
          ) : (
            <span style={{ color: "var(--muted)", fontSize: 14, flex: "1 1 100%" }}>Pas encore de photo ni de PDF joint.</span>
          )}
          {can("costs.edit") && (
            <>
              <button type="button" className="fl-btn fl-btn-secondary" disabled={pending} onClick={() => input.current?.click()}>
                <Paperclip size={15} /> {order.file ? "Remplacer" : "Joindre une photo ou un PDF"}
              </button>
              {order.file && (
                <button
                  type="button"
                  className="fl-btn fl-btn-ghost"
                  disabled={pending}
                  onClick={() => confirm("Retirer le fichier joint ?") && start(async () => { await removeInvoiceAttachment(order.id); router.refresh(); })}
                >
                  <X size={15} /> Retirer
                </button>
              )}
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
        {pending && <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>…</p>}
        {error && <p className="ing-fact-msg" data-err="true" style={{ marginTop: 8 }}>{error}</p>}
        {order.file?.type === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileUrl} alt="Facture" className="inv-preview" />
        )}
      </div>
    </>
  );
}

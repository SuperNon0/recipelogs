import Link from "next/link";
import { ChevronRight, Paperclip, Receipt } from "lucide-react";
import { formatEuro } from "@/lib/cost";
import type { PurchaseOrderListItem } from "@/lib/purchaseOrders";

/** Liste de factures : date, fournisseur, numéro, nombre de lignes, total. */
export function InvoiceList({ orders, showSupplier = true }: { orders: PurchaseOrderListItem[]; showSupplier?: boolean }) {
  if (orders.length === 0) {
    return <div className="fl-card" style={{ color: "var(--muted)", fontSize: 14 }}>Aucune facture sur cette période.</div>;
  }
  return (
    <div className="fl-list">
      {orders.map((o) => (
        <Link key={o.id} href={`/factures/${o.id}`} className="fl-row">
          <span className="ic">
            <Receipt size={16} />
          </span>
          <span className="set-tx">
            <b>
              <span>{showSupplier ? o.supplier : new Date(o.date).toLocaleDateString("fr-FR")}</span>
              {o.hasFile && <Paperclip size={13} style={{ color: "var(--muted)", flex: "none" }} aria-label="Fichier joint" />}
            </b>
            <small>
              {[showSupplier ? new Date(o.date).toLocaleDateString("fr-FR") : null, o.number ? `n° ${o.number}` : null, `${o.lines} ligne${o.lines > 1 ? "s" : ""}`]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
          {o.total != null && <span className="sup-num strong">{formatEuro(o.total)}</span>}
          <ChevronRight size={16} className="set-chev" />
        </Link>
      ))}
    </div>
  );
}

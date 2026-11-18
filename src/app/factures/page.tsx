import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { listPurchaseOrders } from "@/lib/purchaseOrders";
import { formatEuro } from "@/lib/cost";
import { InvoiceList } from "@/components/suppliers/InvoiceList";
import { NouvelleFactureButton, FacturesATraiter } from "@/components/suppliers/NouvelleFacture";
import { listPendingInvoices, limitesFactures } from "@/lib/pendingInvoices";
import { viewerCan } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

const day = (v: string | string[] | undefined) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requirePage("costs.view");
  const sp = await searchParams;
  const from = day(sp.du);
  const to = day(sp.au);
  const supplierId = Number(sp.fournisseur) || null;
  const peutModifier = viewerCan(viewer, "costs.edit");
  const [orders, suppliers, aTraiter, limites] = await Promise.all([
    listPurchaseOrders({ from, to, supplierId }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    peutModifier ? listPendingInvoices({ kind: "facture" }) : Promise.resolve([]),
    peutModifier ? limitesFactures() : Promise.resolve(null),
  ]);
  const total = orders.reduce((s, o) => s + (o.total ?? 0), 0);
  const filtered = !!(from || to || supplierId);

  return (
    <div className="set-page">
      <Link href="/fournisseurs" className="crumb">
        <ChevronLeft size={14} /> Comparer les prix
      </Link>
      <div className="page-head">
        <h1>Factures</h1>
        {peutModifier && <NouvelleFactureButton fournisseurs={suppliers.map((s) => s.name)} />}
        <p className="sub">
          {orders.length} facture{orders.length > 1 ? "s" : ""}
          {total > 0 ? ` · ${formatEuro(total)} HT` : ""}
          {filtered ? " sur cette sélection" : ", de la plus récente à la plus ancienne"}
        </p>
      </div>
      {peutModifier && <FacturesATraiter factures={aTraiter} fournisseurs={suppliers.map((s) => s.name)} limite={limites?.attente ?? 0} />}
      <form className="sup-range" method="get">
        <select name="fournisseur" className="fl-input" defaultValue={supplierId ?? ""} aria-label="Fournisseur">
          <option value="">Tous les fournisseurs</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span className="sup-dates">
        <span>Du</span>
        <input type="date" name="du" className="fl-input" defaultValue={from ?? ""} aria-label="Depuis le" />
        <span>au</span>
        <input type="date" name="au" className="fl-input" defaultValue={to ?? ""} aria-label="Jusqu'au" />
        </span>
        <button type="submit" className="fl-btn fl-btn-primary">Voir</button>
        {filtered && (
          <Link href="/factures" className="fl-btn fl-btn-ghost">Toutes les dates</Link>
        )}
      </form>
      <InvoiceList orders={orders} />
    </div>
  );
}

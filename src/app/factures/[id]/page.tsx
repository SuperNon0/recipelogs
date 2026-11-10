import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { loadPurchaseOrder } from "@/lib/purchaseOrders";
import { InvoiceDetail } from "@/components/suppliers/InvoiceDetail";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("costs.view");
  const { id } = await params;
  const order = await loadPurchaseOrder(Number(id) || 0);
  if (!order) notFound();
  return (
    <div className="set-page">
      <Link href="/factures" className="crumb">
        <ChevronLeft size={14} /> Factures
      </Link>
      <InvoiceDetail order={order} />
    </div>
  );
}

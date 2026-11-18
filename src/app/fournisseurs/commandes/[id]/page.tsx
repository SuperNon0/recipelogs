import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { loadSupplierOrder } from "@/lib/supplierOrdersDb";
import { OrderDetail } from "@/components/suppliers/OrderHistory";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("costs.view");
  const { id } = await params;
  const order = await loadSupplierOrder(Number(id) || 0);
  if (!order) notFound();
  return (
    <div className="set-page">
      <Link href="/fournisseurs/commandes" className="crumb">
        <ChevronLeft size={14} /> Commandes
      </Link>
      <OrderDetail order={order} />
    </div>
  );
}

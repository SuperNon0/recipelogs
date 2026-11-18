import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { listSupplierOrders } from "@/lib/supplierOrdersDb";
import { OrderHistory } from "@/components/suppliers/OrderHistory";

export const dynamic = "force-dynamic";

/** Commandes passées aux fournisseurs, et le choix du fournisseur pour en passer une. */
export default async function OrdersPage() {
  await requirePage("costs.view");
  const [orders, suppliers] = await Promise.all([
    listSupplierOrders(),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { products: true } } } }),
  ]);
  return (
    <div className="set-page">
      <Link href="/fournisseurs/liste" className="crumb">
        <ChevronLeft size={14} /> Mes fournisseurs
      </Link>
      <OrderHistory orders={orders} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, products: s._count.products }))} />
    </div>
  );
}

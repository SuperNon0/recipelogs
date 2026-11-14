import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { SupplierList } from "@/components/suppliers/SupplierList";

export const dynamic = "force-dynamic";

/** Tous les fournisseurs, même ceux sans facture, pour les créer, modifier ou supprimer à la main. */
export default async function SupplierListPage() {
  await requirePage("costs.view");
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      note: true,
      _count: { select: { products: true, orders: { where: { manual: false } } } },
      orders: { where: { manual: false }, orderBy: { date: "desc" }, take: 1, select: { date: true } },
    },
  });
  return (
    <div className="set-page">
      <Link href="/fournisseurs" className="crumb">
        <ChevronLeft size={14} /> Comparer les prix
      </Link>
      <SupplierList
        suppliers={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          note: s.note,
          products: s._count.products,
          invoices: s._count.orders,
          lastInvoice: s.orders[0]?.date.toISOString().slice(0, 10) ?? null,
        }))}
      />
    </div>
  );
}

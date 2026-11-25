import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { loadSupplier } from "@/lib/purchaseOrders";
import { SupplierDetail } from "@/components/suppliers/SupplierDetail";
import { listPendingInvoices } from "@/lib/pendingInvoices";
import { viewerCan } from "@/lib/auth/viewer";
import { modesAnalyse } from "@/lib/ia/analyse";

export const dynamic = "force-dynamic";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePage("costs.view");
  const { id } = await params;
  const peutModifier = viewerCan(viewer, "costs.edit");
  const [supplier, bases, aTraiter, modes, autres] = await Promise.all([
    loadSupplier(Number(id) || 0),
    prisma.ingredientBase.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    peutModifier ? listPendingInvoices({ kind: "mercuriale", supplierId: Number(id) || -1 }) : Promise.resolve([]),
    modesAnalyse(),
    peutModifier
      ? prisma.supplier.findMany({ where: { NOT: { id: Number(id) || 0 } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  if (!supplier) notFound();
  return (
    <div className="set-page">
      <Link href="/fournisseurs" className="crumb">
        <ChevronLeft size={14} /> Comparer les prix
      </Link>
      <SupplierDetail
        supplier={supplier}
        bases={bases}
        aTraiter={aTraiter}
        modes={modes}
        autres={autres}
      />
    </div>
  );
}

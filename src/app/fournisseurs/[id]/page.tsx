import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { loadSupplier } from "@/lib/purchaseOrders";
import { SupplierDetail } from "@/components/suppliers/SupplierDetail";

export const dynamic = "force-dynamic";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("costs.view");
  const { id } = await params;
  const [supplier, bases] = await Promise.all([
    loadSupplier(Number(id) || 0),
    prisma.ingredientBase.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!supplier) notFound();
  return (
    <div className="set-page">
      <Link href="/fournisseurs" className="crumb">
        <ChevronLeft size={14} /> Comparer les prix
      </Link>
      <SupplierDetail supplier={supplier} bases={bases} />
    </div>
  );
}

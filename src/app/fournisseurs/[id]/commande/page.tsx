import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { loadOrderCatalog } from "@/lib/supplierOrdersDb";
import { OrderForm } from "@/components/suppliers/OrderForm";

export const dynamic = "force-dynamic";

/** « Passer une commande » chez un fournisseur. */
export default async function SupplierOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("costs.edit");
  const { id } = await params;
  const catalog = await loadOrderCatalog(Number(id) || 0);
  if (!catalog) notFound();
  return (
    <div className="set-page ord-page">
      <Link href={`/fournisseurs/${catalog.supplier.id}`} className="crumb">
        <ChevronLeft size={14} /> {catalog.supplier.name}
      </Link>
      <OrderForm catalog={catalog} />
    </div>
  );
}

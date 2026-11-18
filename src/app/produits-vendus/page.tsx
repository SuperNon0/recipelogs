import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { loadSoldProducts } from "@/lib/soldProducts";
import { SoldProducts } from "@/components/SoldProducts";

export const dynamic = "force-dynamic";

/** Produits vendus : la marge de chaque recette cochée « Produit vendu ». */
export default async function SoldProductsPage() {
  await requirePage("costs.view");
  const data = await loadSoldProducts();
  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <SoldProducts {...data} />
    </div>
  );
}

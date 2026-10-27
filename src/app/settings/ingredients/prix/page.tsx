import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { listIngredientPrices } from "@/lib/recipes";
import { IngredientPriceList } from "@/components/IngredientPriceList";

export const dynamic = "force-dynamic";

export default async function IngredientPricesPage() {
  const ingredients = await listIngredientPrices();
  return (
    <div className="set-page-wide">
      <Link href="/settings/ingredients" className="crumb">
        <ChevronLeft size={14} /> Ingrédients
      </Link>
      <IngredientPriceList ingredients={ingredients} />
    </div>
  );
}

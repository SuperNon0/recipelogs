import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { listAllIngredientBases } from "@/lib/recipes";
import { IngredientBaseManager } from "@/components/IngredientBaseManager";
import { RepairIngredientsButton } from "@/components/RepairIngredientsButton";
import { SyncIngredientsButton } from "@/components/SyncIngredientsButton";
import { DeleteOrphanIngredientsButton } from "@/components/DeleteOrphanIngredientsButton";

export const dynamic = "force-dynamic";

export default async function IngredientsSettingsPage() {
  const ingredientBases = await listAllIngredientBases();
  const orphans = ingredientBases
    .filter((i) => i._count.usages === 0)
    .map((i) => ({ id: i.id, name: i.name }));

  return (
    <div className="set-page-wide">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <IngredientBaseManager ingredientBases={ingredientBases} />

      <div className="sect-title" style={{ marginTop: 32 }}>
        <h2>Entretien de la base</h2>
      </div>
      <div className="fl-list">
        <RepairIngredientsButton />
        <SyncIngredientsButton />
        <DeleteOrphanIngredientsButton orphans={orphans} />
      </div>
    </div>
  );
}

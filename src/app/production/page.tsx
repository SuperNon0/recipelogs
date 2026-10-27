import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Help } from "@/components/ui/Help";
import { ProductionBoard, ProductionSheetView } from "@/components/Production";
import { buildProductionSheet, listProductionItems } from "@/lib/productionData";

export const dynamic = "force-dynamic";

/** Fiche de production : les recettes à produire, leurs quantités, et toutes les pesées. */
export default async function ProductionPage() {
  const items = await listProductionItems();
  const sheet = items.length ? await buildProductionSheet(items.map((i) => ({ recipeId: i.recipeId, amount: i.amount }))) : null;

  return (
    <>
      <div className="page-head">
        <h1 style={{ display: "flex", alignItems: "center" }}>
          Fiche de production
          <Help title="Fiche de production">
            Les recettes à produire et leur quantité (en pièces si la recette a un rendement, sinon
            en multiplicateur). En dessous, toutes les pesées par préparation, sous-recettes
            comprises, dans l&apos;ordre où on les fait ; une préparation commune à plusieurs
            recettes n&apos;apparaît qu&apos;une fois, quantités additionnées. Le PDF reprend tout,
            avec le total par ingrédient à sortir. Ce n&apos;est pas un planning : rien n&apos;est daté.
          </Help>
        </h1>
        <p className="sub">
          {items.length === 0 ? "Aucune recette" : `${items.length} recette${items.length > 1 ? "s" : ""} à produire`}
        </p>
      </div>

      <ProductionBoard items={items} />

      {sheet ? (
        <ProductionSheetView sheet={sheet} />
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="Rien à produire"
          description="Ajoute une recette ci-dessus, ou depuis une recette : menu ⋯ → « Fiche de production »."
        />
      )}
    </>
  );
}

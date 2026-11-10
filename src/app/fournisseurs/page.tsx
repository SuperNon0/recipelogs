import Link from "next/link";
import { Receipt, Store } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { loadAllProducts } from "@/lib/purchaseOrders";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/EmptyState";
import { PriceComparison } from "@/components/suppliers/PriceComparison";
import { Help } from "@/components/ui/Help";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  await requirePage("costs.view");
  const [{ suppliers, products }, bases] = await Promise.all([
    loadAllProducts(),
    prisma.ingredientBase.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="sup-page">
      <div className="page-head">
        <h1>Comparer les prix</h1>
        <Link href="/factures" className="fl-btn fl-btn-secondary">
          <Receipt size={15} /> Factures
        </Link>
        <p className="sub">
          Prix payés à la dernière facture, ramenés au kg, au litre ou à la pièce. Coche jusqu&apos;à 3 fournisseurs.
          <Help title="D'où viennent ces prix ?" example="Envoie la photo d'une facture Metro à Claude : « enregistre cette facture dans RecipeLog ».">
            Chaque facture envoyée à Claude (connecteur RecipeLog) est enregistrée avec sa date : tous les produits
            achetés, même ceux qui ne servent pas en recette, et leur prix. Rien n&apos;est jamais écrasé : touche un
            prix pour voir tout son historique et la facture d&apos;où il vient.
          </Help>
        </p>
      </div>
      {products.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Aucune facture pour l'instant"
          description="Envoie la photo ou le PDF d'une facture ou d'un bon de commande à Claude en lui demandant de l'enregistrer dans RecipeLog : les fournisseurs, les produits et leurs prix arrivent ici tout seuls."
        />
      ) : (
        <PriceComparison suppliers={suppliers} products={products} bases={bases} />
      )}
    </div>
  );
}

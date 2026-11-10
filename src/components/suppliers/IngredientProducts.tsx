"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCan } from "@/components/auth/Permissions";
import { chooseIngredientProduct } from "@/app/actions/suppliers";
import { formatEuro } from "@/lib/cost";
import type { ProductChoice } from "@/lib/purchaseOrders";
import { Help } from "@/components/ui/Help";

/** Fiche ingrédient : les produits achetés qui lui correspondent, et celui dont le prix sert aux recettes. */
export function IngredientProducts({ choice }: { choice: ProductChoice | null }) {
  const can = useCan();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const options = choice?.options ?? [];
  const cheapest = options.length ? Math.min(...options.map((o) => o.price)) : null;

  return (
    <>
      <div className="sect-title" style={{ marginTop: 8 }}>
        <h2>
          Produits des fournisseurs
          <Help title="Produits des fournisseurs" example="Chocolat noir : Guanaja 70 % chez Choframa, pistoles 64 % chez Metro. Tu choisis lequel compte dans tes recettes.">
            Les produits achetés (d&apos;après tes factures) qui correspondent à cet ingrédient. Celui que tu
            choisis donne le prix d&apos;achat utilisé dans le coût de toutes les recettes, et le suit à chaque
            nouvelle facture. Relie un produit depuis « Comparer les prix » en touchant son prix.
          </Help>
        </h2>
      </div>
      {options.length === 0 ? (
        <div className="fl-card" style={{ color: "var(--muted)", fontSize: 14 }}>
          Aucun produit relié pour l&apos;instant. <Link href="/fournisseurs" style={{ color: "var(--accent)" }}>Comparer les prix</Link>
        </div>
      ) : (
        <div>
          {options.map((o) => (
            <button
              key={o.productId}
              type="button"
              className="pick-opt"
              aria-pressed={o.productId === choice?.chosenProductId}
              disabled={pending || !can("costs.edit")}
              onClick={() =>
                choice &&
                start(async () => {
                  const r = await chooseIngredientProduct(choice.baseId, o.productId === choice.chosenProductId ? null : o.productId);
                  setError(r.ok ? null : r.error);
                  router.refresh();
                })
              }
            >
              <span className="pick-rad" />
              <span className="t">
                <b>{o.name}</b>
                <small>
                  {o.supplier}
                  {o.packLabel ? ` · ${o.packLabel}` : ""}
                  {o.date ? ` · facture du ${new Date(o.date).toLocaleDateString("fr-FR")}` : ""}
                </small>
              </span>
              <span className="p">
                {formatEuro(o.price)}/{o.unit}
                {options.length > 1 && o.price === cheapest && <small className="pick-cheap">moins cher</small>}
              </span>
            </button>
          ))}
          {error && <p className="ing-fact-msg" data-err="true">{error}</p>}
        </div>
      )}
    </>
  );
}

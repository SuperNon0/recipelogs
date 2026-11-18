/**
 * Page « Produits vendus » : pour chaque recette cochée « Produit vendu »,
 * le coût de revient à l'unité, le prix de vente et la marge (€ et %).
 */
import { prisma } from "./prisma";
import { visibleRecipeWhere } from "./auth/visibility";
import { buildRecipeSnapshot } from "./cookbooks";
import { DEFAULT_SALE_VAT, costOf, saleMargin } from "./cost";

export type SoldProduct = {
  id: number;
  name: string;
  /** « pièce » (nom des pièces) avec un rendement, sinon « recette entière ». */
  per: string;
  cost: number | null;
  price: number | null;
  vat: number;
  priceHT: number | null;
  margin: number | null;
  rate: number | null;
  coef: number | null;
  /** Ingrédients sans prix : coût (et marge) calculés sans eux. */
  missing: string[];
};

const singular = (label: string) => (/[^s]s$/i.test(label) && !label.includes(" ") ? label.slice(0, -1) : label);

/** Une recette à la fois : la page reste légère pour le serveur, même avec beaucoup de produits. */
export async function loadSoldProducts(): Promise<{ products: SoldProduct[]; pricedNotSold: { id: number; name: string }[] }> {
  const where = await visibleRecipeWhere();
  const [recipes, pricedNotSold] = await Promise.all([
    prisma.recipe.findMany({
      where: { AND: [where, { sold: true }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, salePrice: true, saleVat: true },
    }),
    prisma.recipe.findMany({
      where: { AND: [where, { sold: false, salePrice: { not: null } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 200,
    }),
  ]);
  const products: SoldProduct[] = [];
  for (const r of recipes) {
    const snap = await buildRecipeSnapshot(r.id);
    const c = snap ? costOf([...snap.ingredients, ...snap.subRecipes.flatMap((s) => s.ingredients)]) : null;
    const count = snap?.yield?.count && snap.yield.count > 0 ? snap.yield.count : 1;
    const priced = c ? c.detail.length > 0 || c.total > 0 : false;
    const cost = c && priced ? c.total / count : null;
    const price = r.salePrice != null ? Number(r.salePrice) : null;
    const vat = r.saleVat != null ? Number(r.saleVat) : DEFAULT_SALE_VAT;
    const m = price != null ? saleMargin(price, vat, cost ?? 0) : null;
    products.push({
      id: r.id,
      name: r.name,
      per: snap?.yield ? singular(snap.yield.label || "pièce") : "recette entière",
      cost,
      price,
      vat,
      priceHT: m?.priceHT ?? null,
      margin: m && cost != null ? m.margin : null,
      rate: m && cost != null ? m.rate : null,
      coef: m && cost != null ? m.coef : null,
      missing: c?.missing ?? [],
    });
  }
  return { products, pricedNotSold };
}

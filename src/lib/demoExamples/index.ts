/**
 * Charge les données d'exemple de la démo (./data.ts) dans la base.
 *
 * - `loadDemoExamplesIfEmpty()` : au démarrage d'un site en mode démo, si la
 *   base n'a encore ni recette ni fournisseur (nouvelle installation, ou démo
 *   figée vide). Rien ne se passe sur un site normal.
 * - `loadDemoExamples({ replace: true })` : efface les recettes, ingrédients,
 *   fournisseurs, factures, cahiers, listes et la fiche de production, puis
 *   recharge les exemples (scripts/demo-exemples.ts). Refusé hors mode démo.
 *
 * Les factures passent par recordPurchaseOrder, comme une vraie facture :
 * prix des produits, historique, ingrédients reliés et articles regroupés
 * sont donc calculés exactement comme sur un vrai site.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { isDemo } from "../demo";
import { normalizeForSearch } from "../recipes";
import { recordPurchaseOrder } from "../purchaseOrders";
import { buildRecipeSnapshot } from "../cookbooks";
import { aggregateIngredients } from "../shopping";
import { isSectionTitle } from "../validation";
import {
  DEMO_CATEGORIES,
  DEMO_COOKBOOKS,
  DEMO_FOLDERS,
  DEMO_INGREDIENTS,
  DEMO_INVOICES,
  DEMO_PRODUCTION,
  DEMO_RECIPES,
  DEMO_SHOPPING_LISTS,
  DEMO_SUPPLIERS,
} from "./data";

/** Réglage posé une fois les exemples chargés (gardé dans la démo figée). */
export const DEMO_EXAMPLES_KEY = "demo_examples_loaded";

export type DemoLoadReport = {
  recettes: number;
  ingredients: number;
  fournisseurs: number;
  factures: number;
  cahiers: number;
  listes: number;
};

/** Au démarrage : charge les exemples si le site est une démo encore vide. */
export async function loadDemoExamplesIfEmpty(): Promise<DemoLoadReport | null> {
  if (!isDemo()) return null;
  const [recipes, suppliers, flag] = await Promise.all([
    prisma.recipe.count(),
    prisma.supplier.count(),
    prisma.setting.findUnique({ where: { key: DEMO_EXAMPLES_KEY } }),
  ]);
  if (recipes > 0 || suppliers > 0 || flag) return null;
  return loadDemoExamples({ replace: false });
}

export async function loadDemoExamples(opts: { replace: boolean }): Promise<DemoLoadReport> {
  if (opts.replace) {
    if (!isDemo()) throw new Error("Remplacer les données n'est possible que sur un site de démo (RECIPELOG_DEMO=1).");
    await wipe();
  } else if ((await prisma.recipe.count()) > 0 || (await prisma.supplier.count()) > 0) {
    throw new Error("La base contient déjà des recettes ou des fournisseurs : rien n'a été chargé.");
  }

  // 1. Dossiers et catégories
  const folderId = new Map<string, number>();
  for (const f of DEMO_FOLDERS) {
    const row = await prisma.folder.upsert({ where: { name: f.name }, update: { color: f.color }, create: f });
    folderId.set(f.name, row.id);
  }
  const categoryId = new Map<string, number>();
  for (const c of DEMO_CATEGORIES) {
    const row = await prisma.category.upsert({ where: { name: c.name }, update: { color: c.color }, create: c });
    categoryId.set(c.name, row.id);
  }

  // 2. Ingrédients (fiches) : avant les factures, qui s'y relient par leur nom
  for (const i of DEMO_INGREDIENTS) {
    const base = await prisma.ingredientBase.upsert({
      where: { name: i.name },
      update: {},
      create: {
        name: i.name,
        category: i.category,
        allergens: i.allergens ?? [],
        pieceG: i.pieceG ?? null,
        price: i.price?.price ?? null,
        priceUnit: i.price?.unit ?? null,
      },
    });
    if (i.price) await prisma.ingredientPrice.create({ data: { baseId: base.id, price: i.price.price, priceUnit: i.price.unit } });
  }

  // 3. Recettes (dans l'ordre : une sous-recette est écrite avant la recette qui l'utilise)
  const recipeId = new Map<string, number>();
  for (const r of DEMO_RECIPES) {
    const created = await prisma.recipe.create({
      data: {
        name: r.name,
        nameNormalized: normalizeForSearch(r.name),
        source: r.source ?? "Exemple de la démo RecipeLog",
        notesTips: r.notes ?? null,
        favorite: r.favorite ?? false,
        rating: r.rating ?? null,
        folderId: folderId.get(r.folder) ?? null,
        yieldCount: r.yield?.count ?? null,
        yieldLabel: r.yield?.label ?? null,
        mold: r.mold ?? Prisma.DbNull,
        saleCoef: r.sale?.coef ?? null,
        salePrice: r.sale?.price ?? null,
        saleVat: r.sale ? (r.sale.vat ?? 5.5) : null,
        ingredients: {
          create: r.ingredients.map(([name, q, unit, qMax], position) => ({
            name,
            quantityG: q,
            quantityGMax: qMax ?? null,
            unit: unit ?? "g",
            position,
          })),
        },
        tags: r.tags?.length ? { create: r.tags.map((name) => ({ name })) } : undefined,
        categories: {
          create: r.categories.map((c) => ({ categoryId: categoryId.get(c)! })),
        },
        stepsBlock: r.steps ? { create: { content: r.steps } } : undefined,
        comments: r.comments?.length ? { create: r.comments.map((content) => ({ content })) } : undefined,
      },
    });
    recipeId.set(r.key, created.id);

    for (const [position, s] of (r.subs ?? []).entries()) {
      const childId = recipeId.get(s.recipe);
      if (!childId) throw new Error(`Sous-recette « ${s.recipe} » à écrire avant « ${r.name} »`);
      await prisma.subRecipe.create({
        data: { parentId: created.id, childId, label: s.label, calcMode: s.mode, calcValue: s.value, position },
      });
    }
    if (r.variantOf) {
      const sourceId = recipeId.get(r.variantOf.key);
      if (!sourceId) throw new Error(`Recette d'origine « ${r.variantOf.key} » à écrire avant « ${r.name} »`);
      await prisma.variant.create({ data: { sourceRecipeId: sourceId, variantRecipeId: created.id, note: r.variantOf.note } });
    }
  }
  // Ingrédients écrits dans les recettes mais pas dans la liste : fiche vide, comme dans l'appli.
  const used = DEMO_RECIPES.flatMap((r) => r.ingredients.filter(([, , u]) => !isSectionTitle(u)).map(([n]) => n));
  await prisma.ingredientBase.createMany({ data: [...new Set(used)].map((name) => ({ name })), skipDuplicates: true });

  // 4. Fournisseurs et factures (les plus anciennes d'abord : l'historique des prix se construit)
  for (const s of DEMO_SUPPLIERS) {
    await prisma.supplier.upsert({ where: { name: s.name }, update: { note: s.note }, create: s });
  }
  const today = new Date();
  const dayStr = (daysAgo: number) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysAgo));
    return d.toISOString().slice(0, 10);
  };
  for (const inv of [...DEMO_INVOICES].sort((a, b) => b.daysAgo - a.daysAgo)) {
    await recordPurchaseOrder({
      supplier: inv.supplier,
      date: dayStr(inv.daysAgo),
      number: inv.number,
      note: inv.note ?? null,
      lines: inv.lines.map((l) => ({
        product: l.product,
        reference: l.ref ?? null,
        article: l.article ?? null,
        family: l.family,
        quantity: l.qty,
        packSize: l.pack,
        packPrice: l.packPrice,
        unit: l.unit,
        lineTotal: Math.round(l.qty * l.packPrice * 100) / 100,
        ingredient: l.ingredient ?? null,
      })),
    });
  }

  // 5. Cahiers
  for (const cb of DEMO_COOKBOOKS) {
    const book = await prisma.cookbook.create({ data: { name: cb.name, description: cb.description, format: "A4" } });
    for (const [position, e] of cb.entries.entries()) {
      if ("chapter" in e) {
        await prisma.cookbookChapter.create({ data: { cookbookId: book.id, position, title: e.chapter, intro: e.intro ?? null } });
      } else {
        await prisma.cookbookRecipe.create({
          data: { cookbookId: book.id, recipeId: recipeId.get(e.recipe)!, position, linkMode: "linked", subrecipeMode: "single" },
        });
      }
    }
  }

  // 6. Listes de courses (articles calculés comme dans l'appli, puis articles ajoutés à la main)
  for (const list of DEMO_SHOPPING_LISTS) {
    const row = await prisma.shoppingList.create({
      data: { name: list.name, type: list.recipes.length && list.manual.length ? "mixed" : list.recipes.length ? "recipes" : "free" },
    });
    const sources = [];
    for (const r of list.recipes) {
      const id = recipeId.get(r.recipe)!;
      await prisma.shoppingListRecipe.create({ data: { shoppingListId: row.id, recipeId: id, coefficient: r.coef } });
      const snap = await buildRecipeSnapshot(id, r.coef);
      if (snap) sources.push({ recipeId: id, ingredients: [...snap.ingredients, ...snap.subRecipes.flatMap((sr) => sr.ingredients)] });
    }
    const aggregated = aggregateIngredients(sources);
    await prisma.shoppingListItem.createMany({
      data: [
        ...aggregated.map((ing, position) => ({
          shoppingListId: row.id,
          name: ing.name,
          quantityG: ing.quantityG && ing.quantityG > 0 ? ing.quantityG : null,
          unit: ing.unit,
          recipeId: ing.recipeId,
          checked: false,
          position,
        })),
        ...list.manual.map((m, i) => ({
          shoppingListId: row.id,
          name: m.name,
          quantityG: m.qty,
          unit: m.unit,
          recipeId: null,
          checked: m.checked,
          position: aggregated.length + i,
        })),
      ],
    });
  }

  // 7. Fiche de production
  for (const [position, p] of DEMO_PRODUCTION.entries()) {
    const r = DEMO_RECIPES.find((x) => x.key === p.recipe)!;
    await prisma.productionItem.create({
      data: { recipeId: recipeId.get(p.recipe)!, amount: p.amount, yieldCount: r.yield?.count ?? null, position },
    });
  }

  await prisma.setting.upsert({
    where: { key: DEMO_EXAMPLES_KEY },
    update: { value: new Date().toISOString() },
    create: { key: DEMO_EXAMPLES_KEY, value: new Date().toISOString() },
  });

  return {
    recettes: DEMO_RECIPES.length,
    ingredients: await prisma.ingredientBase.count(),
    fournisseurs: DEMO_SUPPLIERS.length,
    factures: DEMO_INVOICES.length,
    cahiers: DEMO_COOKBOOKS.length,
    listes: DEMO_SHOPPING_LISTS.length,
  };
}

/** Efface tout le contenu (pas les réglages, thèmes PDF ni comptes) avant de recharger les exemples. */
async function wipe() {
  await prisma.$transaction([
    prisma.productionItem.deleteMany(),
    prisma.shoppingList.deleteMany(),
    prisma.cookbook.deleteMany(),
    prisma.shareToken.deleteMany(),
    prisma.subRecipe.deleteMany(),
    prisma.variant.deleteMany(),
    prisma.recipe.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.ingredientBase.updateMany({ data: { chosenProductId: null } }),
    prisma.supplier.deleteMany(),
    prisma.ingredientBase.deleteMany(),
    prisma.category.deleteMany(),
    prisma.folder.deleteMany(),
    prisma.setting.deleteMany({ where: { key: DEMO_EXAMPLES_KEY } }),
  ]);
}

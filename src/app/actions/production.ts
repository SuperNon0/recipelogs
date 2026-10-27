"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

type Result = { ok: true } | { ok: false; error: string };

const valid = (amount: number) => Number.isFinite(amount) && amount > 0 && amount <= 100_000;

function refresh() {
  revalidatePath("/production");
  revalidatePath("/", "layout");
}

/** Ajoute une recette à la fiche de production (ou change sa quantité si elle y est déjà). */
export async function addToProduction(recipeId: number, amount: number): Promise<Result> {
  if (!valid(amount)) return { ok: false, error: "Quantité invalide." };
  const last = await prisma.productionItem.aggregate({ _max: { position: true } });
  await prisma.productionItem.upsert({
    where: { recipeId },
    update: { amount },
    create: { recipeId, amount, position: (last._max.position ?? 0) + 1 },
  });
  refresh();
  return { ok: true };
}

export async function setProductionAmount(id: number, amount: number): Promise<Result> {
  if (!valid(amount)) return { ok: false, error: "Quantité invalide." };
  await prisma.productionItem.update({ where: { id }, data: { amount } });
  refresh();
  return { ok: true };
}

export async function removeProductionItem(id: number): Promise<Result> {
  await prisma.productionItem.deleteMany({ where: { id } });
  refresh();
  return { ok: true };
}

/** Vide la fiche de production (les recettes ne sont pas touchées). */
export async function clearProduction(): Promise<Result> {
  await prisma.productionItem.deleteMany({});
  refresh();
  return { ok: true };
}

/** Rendement d'une recette, pour la fenêtre « Fiche de production ». */
export async function fetchRecipeYield(recipeId: number): Promise<{ count: number | null; label: string | null; inProduction: number | null }> {
  const r = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { yieldCount: true, yieldLabel: true, productionItem: { select: { amount: true } } },
  });
  return {
    count: r?.yieldCount ?? null,
    label: r?.yieldCount ? r.yieldLabel?.trim() || "pièces" : null,
    inProduction: r?.productionItem ? Number(r.productionItem.amount) : null,
  };
}

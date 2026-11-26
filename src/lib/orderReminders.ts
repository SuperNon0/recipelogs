/**
 * Rappel « À commander aujourd'hui » : lit les jours de commande des
 * fournisseurs et les commandes déjà passées aujourd'hui dans RecipeLog.
 */
import { prisma } from "./prisma";
import { aujourdHui, rappelsDuJour, type RappelCommande } from "./orderDays";

export async function rappelsCommandes(now: Date = new Date()): Promise<{ date: string; jour: number; rappels: RappelCommande[] }> {
  const { jour, date } = aujourdHui(now);
  const fournisseurs = await prisma.supplier.findMany({
    where: { orderDays: { contains: String(jour) } },
    select: { id: true, name: true, orderDays: true, deliveryDays: true },
  });
  if (!fournisseurs.length) return { date, jour, rappels: [] };
  const faites = await prisma.supplierOrder.findMany({
    where: { supplierId: { in: fournisseurs.map((f) => f.id) }, date: new Date(`${date}T00:00:00Z`) },
    select: { supplierId: true },
  });
  return { date, jour, rappels: rappelsDuJour(fournisseurs, faites.map((o) => o.supplierId), jour) };
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Renvoie les données de snapshot d'une entrée de cahier figée
 * (ingrédients + masse totale), pour alimenter le modal « Modifier la masse ».
 */
export async function GET(
  _req: Request,
  {
    params,
  }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id, entryId } = await params;
  const cookbookId = Number(id);
  const eid = Number(entryId);
  if (isNaN(cookbookId) || isNaN(eid)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const entry = await prisma.cookbookRecipe.findFirst({
    where: { id: eid, cookbookId },
    select: { linkMode: true, snapshotData: true },
  });
  if (!entry) return new NextResponse("Not found", { status: 404 });
  if (entry.linkMode !== "snapshot" || !entry.snapshotData) {
    return new NextResponse("Not snapshot", { status: 409 });
  }

  const snap = entry.snapshotData as unknown as {
    ingredients?: { name: string; quantityG: number }[];
    totalMassG?: number;
  };

  return NextResponse.json({
    ingredients: snap.ingredients ?? [],
    totalMassG: snap.totalMassG ?? 0,
  });
}

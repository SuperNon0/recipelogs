import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiDenied } from "@/lib/auth/guard";

export async function GET(request: Request) {
  const denied = await apiDenied("read");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 1) return NextResponse.json([]);

  const results = await prisma.ingredientBase.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    orderBy: { name: "asc" },
    take: 10,
    select: { id: true, name: true },
  });

  return NextResponse.json(results);
}

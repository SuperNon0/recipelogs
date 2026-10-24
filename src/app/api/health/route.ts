import { BOOT_TIME } from "@/lib/bootTime";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // ?db=1 : vérifie aussi la base. deploy.sh l'utilise après le redémarrage,
  // pour revenir à l'ancienne version si la nouvelle ne l'atteint pas.
  if (new URL(req.url).searchParams.has("db")) {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      return Response.json(
        { ok: false, bootedAt: BOOT_TIME, error: e instanceof Error ? e.message : String(e) },
        { status: 503 },
      );
    }
  }
  return Response.json({
    ok: true,
    bootedAt: BOOT_TIME,
    now: Date.now(),
  });
}

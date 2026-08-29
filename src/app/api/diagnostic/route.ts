import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cfDiagnostic } from "@/lib/auth/cloudflare";
import { getSession } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/guard";
import { AuthError } from "@/lib/auth/guard";

export async function GET() {
  try {
    await requireRole("super_admin");
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.kind === "unauth" ? 401 : 403 });
    }
    throw e;
  }

  // DB check
  let db: { ok: boolean; message?: string };
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = { ok: true, message: "Connexion OK" };
  } catch (e) {
    db = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }

  // CF check
  const cf = await cfDiagnostic();

  // Session
  const session = await getSession();

  return NextResponse.json(
    {
      db,
      cf,
      session: {
        email: session.email ?? null,
        role: session.role ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

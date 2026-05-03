import { BOOT_TIME } from "@/lib/bootTime";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    bootedAt: BOOT_TIME,
    now: Date.now(),
  });
}

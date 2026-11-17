import { apiDenied } from "@/lib/auth/guard";
import { readPendingPage } from "@/lib/pendingInvoices";

/** Page (photo ou PDF) d'une facture « à traiter » (permission « Modifier les prix »). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; page: string }> }) {
  const denied = await apiDenied("costs.edit");
  if (denied) return denied;
  const { id, page } = await params;
  const file = await readPendingPage(Number(id) || 0, Number(page) || 0);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: { "Content-Type": file.type, "Cache-Control": "private, no-store", "Content-Disposition": "inline" },
  });
}

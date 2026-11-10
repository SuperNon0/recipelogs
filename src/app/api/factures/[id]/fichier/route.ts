import { apiDenied } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { readInvoiceFile } from "@/lib/invoiceFiles";

/** Photo ou PDF joint à une facture (permission « Voir les prix et les coûts »). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await apiDenied("costs.view");
  if (denied) return denied;
  const { id } = await params;
  const order = await prisma.purchaseOrder.findUnique({ where: { id: Number(id) || 0 }, select: { filePath: true } });
  const file = order?.filePath ? await readInvoiceFile(order.filePath) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: { "Content-Type": file.type, "Cache-Control": "private, no-store", "Content-Disposition": "inline" },
  });
}

import { apiDenied } from "@/lib/auth/guard";
import { loadSupplierOrder } from "@/lib/supplierOrdersDb";
import { orderPdf } from "@/lib/pdf/orderPdf";

/** PDF d'une commande fournisseur, refait à la demande depuis la commande gardée (léger : pas de navigateur). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await apiDenied("costs.view");
  if (denied) return denied;
  const { id } = await params;
  const order = await loadSupplierOrder(Number(id) || 0);
  if (!order) return new Response("Not found", { status: 404 });
  const bytes = await orderPdf(order);
  const name = `commande-${order.supplier}-${order.date}`.normalize("NFD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
  const download = new URL(req.url).searchParams.get("telecharger") === "1";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}.pdf"`,
    },
  });
}

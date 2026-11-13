import { attachInvoiceFile, consumeUploadLink } from "@/lib/invoiceFiles";

/**
 * Envoi du PDF (ou de la photo) d'une facture avec un lien à usage unique
 * donné par l'outil MCP joindre_fichier_facture :
 * curl -T facture.pdf https://<site>/api/mcp/fichier/<jeton>
 * (ou POST multipart avec un champ « file »). Le lien expire après 30 min.
 */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ jeton: string }> };

async function upload(req: Request, ctx: Ctx) {
  const orderId = consumeUploadLink((await ctx.params).jeton);
  if (orderId == null) return Response.json({ error: "Lien inconnu, déjà utilisé ou expiré." }, { status: 404 });
  let bytes: Buffer;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return Response.json({ error: "Champ « file » manquant." }, { status: 400 });
    bytes = Buffer.from(await file.arrayBuffer());
  } else {
    bytes = Buffer.from(await req.arrayBuffer());
  }
  try {
    const { type } = await attachInvoiceFile(orderId, bytes);
    return Response.json({ ok: true, facture_id: orderId, type });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export const POST = upload;
export const PUT = upload;

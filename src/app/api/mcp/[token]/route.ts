import { handleMcpBody } from "@/lib/mcp/protocol";
import { getMcpToken, tokensMatch } from "@/lib/mcp/token";
import { MCP_TOOLS } from "@/lib/mcp/tools";

/**
 * Point d'accès MCP : https://<site>/api/mcp/<clé secrète>.
 * La clé est dans l'adresse car les connecteurs personnalisés de Claude ne
 * savent envoyer qu'une URL. Elle se crée et se change dans Réglages → Accès MCP.
 */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

async function authorized(ctx: Ctx): Promise<boolean> {
  const { token } = await ctx.params;
  const expected = await getMcpToken();
  return !!expected && tokensMatch(token, expected);
}

const notFound = () => new Response("Not found", { status: 404 });

export async function POST(req: Request, ctx: Ctx) {
  if (!(await authorized(ctx))) return notFound();
  const out = await handleMcpBody(await req.text(), MCP_TOOLS);
  if (out === null) return new Response(null, { status: 202 });
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}

/** Pas de flux serveur → client (SSE) : le protocole prévoit 405 dans ce cas. */
export async function GET(_req: Request, ctx: Ctx) {
  if (!(await authorized(ctx))) return notFound();
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  if (!(await authorized(ctx))) return notFound();
  return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}

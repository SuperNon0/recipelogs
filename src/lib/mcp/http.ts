import { handleMcpBody } from "./protocol";
import { getMcpToken, tokensMatch } from "./token";
import { MCP_TOOLS } from "./tools";
import { runAsService } from "@/lib/auth/service";

/**
 * Réponse HTTP du point d'accès MCP. La clé arrive dans l'en-tête
 * « Authorization: Bearer <clé> » ou « X-API-Key: <clé> » (conseillé, comme
 * BotPanel), sinon dans l'adresse.
 * Sans clé valide : 404, comme si l'adresse n'existait pas.
 */
export async function mcpResponse(req: Request, urlToken?: string): Promise<Response> {
  const expected = await getMcpToken();
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)\s*$/i)?.[1];
  const given = bearer ?? req.headers.get("x-api-key")?.trim() ?? urlToken;
  if (!expected || !given || !tokensMatch(given, expected)) {
    return new Response("Not found", { status: 404 });
  }
  if (req.method !== "POST") {
    // Pas de flux serveur → client (SSE) : le protocole prévoit 405 dans ce cas.
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }
  const body = await req.text();
  // Clé valide : les outils ont tous les droits, même quand les comptes sont activés.
  const out = await runAsService("mcp", () => handleMcpBody(body, MCP_TOOLS));
  if (out === null) return new Response(null, { status: 202 });
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}

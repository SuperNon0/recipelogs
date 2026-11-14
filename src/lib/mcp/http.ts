import { mcpAllowed } from "@/lib/mcp/allowed";
import { handleMcpBody } from "./protocol";
import { getMcpToken, tokensMatch } from "./token";
import { MCP_TOOLS } from "./tools";
import { runAsService } from "@/lib/auth/service";

/**
 * Réponse HTTP du point d'accès MCP. La clé arrive dans l'en-tête
 * « Authorization: Bearer <clé> » ou « X-API-Key: <clé> ».
 * Sans clé valide : 404, comme si l'adresse n'existait pas.
 */
export async function mcpResponse(req: Request): Promise<Response> {
  if (!mcpAllowed()) return new Response("Not found", { status: 404 });
  const expected = await getMcpToken();
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)\s*$/i)?.[1];
  const given = bearer ?? req.headers.get("x-api-key")?.trim();
  if (!expected || !given || !tokensMatch(given, expected)) {
    return new Response("Not found", { status: 404 });
  }
  if (req.method !== "POST") {
    // Pas de flux serveur → client (SSE) : le protocole prévoit 405 dans ce cas.
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }
  const body = await req.text();
  // Clé valide : les outils ont tous les droits, même quand les comptes sont activés.
  const out = await runAsService("mcp", () => handleMcpBody(body, MCP_TOOLS), publicOrigin(req));
  if (out === null) return new Response(null, { status: 202 });
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}

/** https://<site> d'après les en-têtes du proxy (Cloudflare → nginx → Next). */
export function publicOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (!host) return new URL(req.url).origin;
  return `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : proto}://${host}`;
}

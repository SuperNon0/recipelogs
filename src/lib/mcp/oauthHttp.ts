/** Réponses des adresses OAuth du point d'accès MCP (src/lib/mcp/oauth.ts). */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
};

export function oauthJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache", ...CORS, ...extra } });
}

export function oauthPreflight(): Response {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}

export function oauthNotFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

/** Corps d'une requête POST, en formulaire (standard OAuth) ou en JSON. */
export async function readForm(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  const text = (await req.text()).slice(0, 20000);
  if (type.includes("application/json")) {
    try {
      const v = JSON.parse(text) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(v ?? {}).filter(([, x]) => typeof x === "string")) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

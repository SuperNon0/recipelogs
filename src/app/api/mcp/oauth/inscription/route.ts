import { mcpPermis } from "@/lib/mcp/allowed";
import { oauthSetup, registerClient } from "@/lib/mcp/oauth";
import { oauthJson, oauthNotFound, oauthPreflight } from "@/lib/mcp/oauthHttp";

/**
 * Inscription automatique d'une application (RFC 7591, « DCR »). Ouverte à tous,
 * comme le veut la norme : s'inscrire ne donne accès à rien, la personne doit
 * encore se connecter et accepter sur /api/mcp/oauth/autoriser.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const setup = oauthSetup();
  if (!setup || !(await mcpPermis())) return oauthNotFound();
  let body: unknown;
  try {
    body = JSON.parse((await req.text()).slice(0, 20000));
  } catch {
    return oauthJson({ error: "invalid_client_metadata", error_description: "JSON attendu." }, 400);
  }
  const out = registerClient(body, setup);
  return out.ok ? oauthJson(out.response, 201) : oauthJson(out.error, 400);
}

export const OPTIONS = oauthPreflight;

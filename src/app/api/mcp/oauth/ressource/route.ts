import { mcpAllowed } from "@/lib/mcp/allowed";
import { oauthSetup, resourceMetadata } from "@/lib/mcp/oauth";
import { oauthJson, oauthNotFound, oauthPreflight } from "@/lib/mcp/oauthHttp";

/**
 * /.well-known/oauth-protected-resource (réécrit ici par le middleware) :
 * dit à Claude où se connecter pour utiliser /api/mcp. Public, comme toute fiche OAuth.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const setup = oauthSetup();
  if (!setup || !mcpAllowed()) return oauthNotFound();
  return oauthJson(resourceMetadata(setup.base), 200, { "Cache-Control": "public, max-age=300" });
}

export const OPTIONS = oauthPreflight;

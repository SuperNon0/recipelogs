import { mcpAllowed } from "@/lib/mcp/allowed";
import { oauthSetup, serverMetadata } from "@/lib/mcp/oauth";
import { oauthJson, oauthNotFound, oauthPreflight } from "@/lib/mcp/oauthHttp";

/** /.well-known/oauth-authorization-server (réécrit ici par le middleware) : adresses de connexion. */
export const dynamic = "force-dynamic";

export async function GET() {
  const setup = oauthSetup();
  if (!setup || !mcpAllowed()) return oauthNotFound();
  return oauthJson(serverMetadata(setup.base), 200, { "Cache-Control": "public, max-age=300" });
}

export const OPTIONS = oauthPreflight;

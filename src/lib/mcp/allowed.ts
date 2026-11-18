/**
 * Plateforme : l'accès MCP peut être coupé pour un client depuis le panel admin
 * (RECIPELOG_MCP=0 dans les réglages de son instance). Partout ailleurs : permis.
 */
export function mcpAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RECIPELOG_MCP !== "0";
}

/**
 * Plateforme : la clé secrète (en-tête Bearer) peut être coupée pour un client
 * depuis le panel admin (RECIPELOG_MCP_CLE=0). Il ne reste alors que la
 * connexion avec un compte (OAuth, src/lib/mcp/oauth.ts). Partout ailleurs : permise.
 */
export function mcpKeyAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RECIPELOG_MCP_CLE !== "0";
}

let cache: { at: number; ok: boolean } | null = null;

/**
 * L'accès MCP marche-t-il vraiment ? Coupé par RECIPELOG_MCP=0, ou par le
 * panel quand l'analyse des documents du client est « IA seulement » (lu sur
 * la passerelle, gardé une minute). Si la passerelle ne répond pas, on ne
 * coupe rien.
 */
export async function mcpPermis(): Promise<boolean> {
  if (!mcpAllowed()) return false;
  if (cache && Date.now() - cache.at < 60_000) return cache.ok;
  const { permisPanel } = await import("@/lib/ia/analyse");
  const p = await permisPanel();
  const ok = p === "les-deux" || p === "mcp";
  cache = { at: Date.now(), ok };
  return ok;
}

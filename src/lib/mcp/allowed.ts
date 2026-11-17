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

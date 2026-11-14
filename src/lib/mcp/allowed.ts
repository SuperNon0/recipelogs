/**
 * Plateforme : l'accès MCP peut être coupé pour un client depuis le panel admin
 * (RECIPELOG_MCP=0 dans les réglages de son instance). Partout ailleurs : permis.
 */
export function mcpAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RECIPELOG_MCP !== "0";
}

import type { Permission } from "@/lib/auth/permissions";

/**
 * Mode démo : RECIPELOG_DEMO=1 dans le .env du serveur.
 * Pour un site ouvert à tous (la démo liée au site vitrine) : tout le monde
 * peut essayer les recettes, mais personne ne peut activer les comptes, créer
 * une clé Claude (MCP) ni lancer la mise à jour du site depuis la page.
 * La base est remise à zéro chaque nuit par le serveur (recipelog-demo-reset).
 */
export function isDemo(): boolean {
  return process.env.RECIPELOG_DEMO === "1";
}

/** Ce qu'un visiteur de la démo ne peut jamais faire. */
export const DEMO_BLOCKED: readonly Permission[] = ["accounts.manage", "site.update", "mcp.manage"];

export function demoBlocks(access: string): boolean {
  return isDemo() && (DEMO_BLOCKED as readonly string[]).includes(access);
}

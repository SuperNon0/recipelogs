/**
 * Compte de maintenance : l'adresse de la personne qui héberge le site.
 *
 * Réglée dans le .env du serveur (RECIPELOG_ADMIN_EMAILS, plusieurs adresses
 * séparées par des virgules), jamais depuis le site. Cette adresse :
 * - est toujours administrateur, même si quelqu'un a touché aux comptes ;
 * - n'apparaît ni dans la liste des comptes ni dans les demandes d'accès ;
 * - ne peut être ni bloquée, ni supprimée, ni changée de rôle depuis le site ;
 * - ne laisse aucune ligne dans le journal des comptes.
 *
 * Il faut aussi que Cloudflare Access laisse entrer cette adresse (groupe
 * « Admin » ajouté à la règle de chaque site).
 */
export function maintenanceEmails(env: string | undefined = process.env.RECIPELOG_ADMIN_EMAILS): string[] {
  return (env ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function isMaintenanceEmail(email: string | null | undefined, env?: string): boolean {
  if (!email) return false;
  return maintenanceEmails(env).includes(email.trim().toLowerCase());
}

/**
 * Responsable du client (plateforme) : RECIPELOG_RESPONSABLE_EMAIL dans
 * l'environnement de l'instance. À sa première connexion, son compte est créé
 * actif avec le rôle Administrateur. Contrairement au compte de maintenance
 * (RECIPELOG_ADMIN_EMAILS, maintenance.ts), il est visible dans la liste des
 * comptes et dans le journal.
 */
export function responsableEmail(env: string | undefined = process.env.RECIPELOG_RESPONSABLE_EMAIL): string | null {
  const e = (env ?? "").trim().toLowerCase();
  return e.includes("@") ? e : null;
}

export function isResponsableEmail(email: string | null | undefined, env?: string): boolean {
  const r = responsableEmail(env);
  return !!email && !!r && email.trim().toLowerCase() === r;
}

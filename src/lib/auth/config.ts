import { prisma } from "@/lib/prisma";
import { normalizeTeam } from "./cloudflare";

/**
 * Réglages des comptes, rangés dans la table settings (clé « auth »).
 * enabled = false : le site marche comme avant les comptes (Cloudflare seul
 * filtre l'entrée, tout le monde a tous les droits).
 *
 * Secours : RECIPELOG_AUTH_OFF=1 dans le .env du serveur coupe les comptes
 * sans toucher à la base (si Cloudflare change de clé ou d'équipe et que plus
 * personne ne peut entrer).
 */
export type AuthSettings = { enabled: boolean; team: string; aud: string };

const KEY = "auth";

export async function getAuthSettings(): Promise<AuthSettings> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const v = (row?.value ?? {}) as Partial<AuthSettings>;
  return {
    enabled: v.enabled === true && process.env.RECIPELOG_AUTH_OFF !== "1",
    team: typeof v.team === "string" ? v.team : "",
    aud: typeof v.aud === "string" ? v.aud : "",
  };
}

export async function saveAuthSettings(next: AuthSettings): Promise<void> {
  const value = { enabled: next.enabled, team: normalizeTeam(next.team), aud: next.aud.trim() };
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
}

export function authForcedOff(): boolean {
  return process.env.RECIPELOG_AUTH_OFF === "1";
}

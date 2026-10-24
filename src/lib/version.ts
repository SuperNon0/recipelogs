import { CHANGELOG } from "@/lib/changelog";

/**
 * Numéro de version affiché : celui de l'entrée en tête du journal
 * (src/lib/changelog.ts, ex. « V2.3 »), suivi du numéro de la dernière PR
 * fusionnée, lu dans git au build (next.config.ts) : « V2.3.88 ». Le dernier
 * nombre change donc à chaque mise à jour, sans rien écrire à la main.
 */
export function fullVersion(
  version: string = CHANGELOG[0]?.version ?? "V1",
  lastPr: string | undefined = process.env.NEXT_PUBLIC_LAST_PR,
): string {
  return lastPr ? `${version}.${lastPr}` : version;
}

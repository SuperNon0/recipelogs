/**
 * Lecture du journal de mise à jour (/tmp/recipelog-deploy.log).
 * deploy.sh annonce chaque étape par une ligne « ==> [HH:MM:SS] … ».
 */

/** Les étapes annoncées par deploy.sh, dans l'ordre, sans le préfixe « ==> ». */
export function deploySteps(log: string): string[] {
  return log
    .split("\n")
    .filter((line) => line.startsWith("==> "))
    .map((line) => line.slice(4).trim());
}

/** Vrai si la dernière étape est le redémarrage du site (bascule ou vérification). */
export function isRestartStep(step: string): boolean {
  const s = step.toLowerCase();
  return s.includes("bascule vers la nouvelle version") || s.includes("vérification du démarrage");
}

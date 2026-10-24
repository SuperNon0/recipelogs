import { describe, expect, it } from "vitest";
import { deploySteps, isRestartStep } from "@/lib/deployLog";

const LOG = `--- Démarrage : 24/10/2026 10:00:00 ---
==> [10:00:01] Démarrage du déploiement...
==> Git pull...
Already up to date.
==> [10:00:04] Dépendances inchangées : pnpm install sauté.
==> [10:00:04] Téléchargement de la version construite par GitHub...
==> [10:00:05] GitHub construit encore cette version (2 à 4 min en général) : attente...
==> [10:02:20] Version de GitHub prête.
Applying migration...
==> [10:02:30] Bascule vers la nouvelle version et redémarrage...
==> [10:02:31] Vérification du démarrage...
`;

describe("deploySteps", () => {
  it("garde les lignes d'étape, dans l'ordre, sans le préfixe", () => {
    const steps = deploySteps(LOG);
    expect(steps).toHaveLength(8);
    expect(steps[0]).toBe("[10:00:01] Démarrage du déploiement...");
    expect(steps[steps.length - 1]).toBe("[10:02:31] Vérification du démarrage...");
  });

  it("journal vide → aucune étape", () => {
    expect(deploySteps("")).toEqual([]);
  });
});

describe("isRestartStep", () => {
  it("reconnaît la bascule et la vérification, pas le reste", () => {
    const steps = deploySteps(LOG);
    expect(isRestartStep(steps[steps.length - 1])).toBe(true);
    expect(isRestartStep(steps[steps.length - 2])).toBe(true);
    expect(isRestartStep(steps[4])).toBe(false);
    expect(isRestartStep("[10:05:00] ⚠ La version de GitHub ne démarre pas ici : build sur le serveur, puis nouvel essai.")).toBe(false);
  });
});

/**
 * Exécuté une fois au démarrage du serveur Next.js.
 * Répare automatiquement (une seule fois) les recettes importées dont les
 * quantités étaient sur des lignes à part — voir lib/ingredientRepair.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { repairImportedIngredientsOnce } = await import("./lib/ingredientRepairDb");
    const report = await repairImportedIngredientsOnce();
    if (report && report.fixed > 0) {
      console.info(
        `[réparation] ${report.fixed} ligne(s) d'ingrédient corrigée(s) dans ${report.recipes} recette(s), ${report.basesRemoved} ingrédient(s) de base inutile(s) supprimé(s).`,
      );
    }
  } catch (e) {
    // La base peut ne pas être prête (build, première installation) : on réessaiera au prochain démarrage.
    console.warn("[réparation] ignorée :", e instanceof Error ? e.message : e);
  }
}

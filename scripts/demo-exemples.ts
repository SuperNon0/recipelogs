/**
 * Charge les recettes, fournisseurs et factures d'exemple de la démo.
 *
 * Sur le serveur de la démo (RECIPELOG_DEMO=1), dans /opt/recipelog :
 *   pnpm exec tsx scripts/demo-exemples.ts              → seulement si la base est vide
 *   pnpm exec tsx scripts/demo-exemples.ts --remplacer  → efface tout et recharge les exemples
 * Puis `recipelog-demo-figer` pour que la remise à zéro de la nuit y revienne.
 */
import { loadDemoExamples } from "../src/lib/demoExamples";
import { prisma } from "../src/lib/prisma";

const replace = process.argv.includes("--remplacer");

loadDemoExamples({ replace })
  .then((r) => {
    console.log(
      `Exemples chargés : ${r.recettes} recettes, ${r.ingredients} ingrédients, ${r.fournisseurs} fournisseurs, ` +
        `${r.factures} factures, ${r.cahiers} cahiers, ${r.listes} listes de courses.`,
    );
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

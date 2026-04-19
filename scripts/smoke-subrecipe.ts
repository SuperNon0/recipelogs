import { PrismaClient } from "@prisma/client";
import { hasCycle, computeLocalCoef } from "../src/lib/subRecipes";

const prisma = new PrismaClient();

async function main() {
  // 1. computeLocalCoef : différents modes
  console.log("--- computeLocalCoef ---");
  console.log("coefficient 2.5         =", computeLocalCoef("coefficient", 2.5, 460, null));
  console.log("mass_target 600g (460g) =", computeLocalCoef("mass_target", 600, 460, null));
  console.log("pivot 80→200 (qty=80)   =", computeLocalCoef("pivot_ingredient", 200, 460, 80));

  // 2. hasCycle : déjà : entremets(3) -> biscuit(2). Essai d'ajouter biscuit(2) -> entremets(3) => cycle.
  console.log("\n--- hasCycle ---");
  console.log("biscuit(2) -> entremets(3) :", await hasCycle(2, 3), "(attendu: true)");
  console.log("entremets(3) -> biscuit(2) : déjà existant");
  console.log("entremets(3) -> tarte(1)   :", await hasCycle(3, 1), "(attendu: false)");

  // 3. Cascade imaginée : biscuit(2) -> tarte(1) ok, puis tarte(1) -> entremets(3) créerait cycle
  console.log("tarte(1) -> entremets(3)   :", await hasCycle(1, 3), "(attendu: false, pas de lien)");
}

main().finally(() => prisma.$disconnect());

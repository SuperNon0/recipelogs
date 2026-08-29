/**
 * CLI : réinitialise le mot de passe du compte administrateur de base.
 * Utilisé quand l'utilisateur a perdu son mot de passe local.
 *
 * Usage :
 *   sudo -u recipelog bash -c "cd /opt/recipelog && pnpm exec tsx scripts/reset-admin.ts"
 */
import * as readline from "node:readline";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

function question(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
}

async function main() {
  console.log("═══ Réinitialisation du mot de passe administrateur ═══\n");

  const prisma = new PrismaClient();
  const admin = await prisma.account.findFirst({
    where: { role: "super_admin", passwordHash: { not: null } },
    orderBy: { id: "asc" },
  });

  if (!admin) {
    console.error(
      "✗ Aucun compte administrateur de base trouvé en BDD.\n" +
        "  Lance d'abord `pnpm setup` pour amorcer le premier super-admin.",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(`Compte trouvé : ${admin.email ?? "(sans email)"} (id ${admin.id})`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const pwd = (
      await question(rl, "Nouveau mot de passe (min 8 chars) : ")
    ).trim();
    if (pwd.length < 8) {
      console.error("✗ Mot de passe trop court.");
      process.exit(1);
    }
    const confirm = (
      await question(rl, "Confirme le nouveau mot de passe : ")
    ).trim();
    if (pwd !== confirm) {
      console.error("✗ Les deux saisies ne correspondent pas.");
      process.exit(1);
    }

    const hash = await bcrypt.hash(pwd, 12);
    await prisma.account.update({
      where: { id: admin.id },
      data: { passwordHash: hash },
    });
    await prisma.auditLog.create({
      data: {
        accountId: admin.id,
        action: "password_change",
        metadata: { via: "reset-admin CLI" },
      },
    });
    console.log("\n✓ Mot de passe mis à jour.");
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

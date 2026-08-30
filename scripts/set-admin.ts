/**
 * Crée / met à jour le compte super-administrateur de base à partir de
 * variables d'environnement — pas d'interaction, une seule commande.
 *
 * Utilisation :
 *
 *   sudo -u recipelog bash -c "cd /opt/recipelog && \
 *     SUPERADMIN_EMAIL=ton@email.com \
 *     SUPERADMIN_PASSWORD='TonMotDePasse' \
 *     pnpm exec tsx scripts/set-admin.ts"
 *
 * Idempotent : ré-exécuter la commande met à jour l'email et le mot de
 * passe. Le compte reste unique (upsert par email).
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

async function main() {
  const email = (process.env.SUPERADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = (process.env.SUPERADMIN_PASSWORD ?? "").trim();

  if (!email) {
    console.error("✗ SUPERADMIN_EMAIL manquant.");
    console.error(
      "  Exemple : SUPERADMIN_EMAIL=ton@email.com SUPERADMIN_PASSWORD=xxx pnpm exec tsx scripts/set-admin.ts",
    );
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error("✗ SUPERADMIN_PASSWORD manquant ou trop court (min 8 caractères).");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const hash = await bcrypt.hash(password, 12);

    // Vérifie s'il existe déjà un compte administrateur de base avec un
    // autre email — dans ce cas on le renomme (fusion).
    const existingBase = await prisma.account.findFirst({
      where: { passwordHash: { not: null } },
      orderBy: { id: "asc" },
    });

    let account;
    if (existingBase && existingBase.email !== email) {
      // Renomme le compte de base vers le nouvel email + met à jour le mot de passe.
      account = await prisma.account.update({
        where: { id: existingBase.id },
        data: {
          email,
          passwordHash: hash,
          role: "super_admin",
          state: "active",
          validatedAt: existingBase.validatedAt ?? new Date(),
        },
      });
      console.log(
        `✓ Compte administrateur de base renommé : ${existingBase.email ?? "(sans email)"} → ${email}`,
      );
    } else {
      // Upsert par email : crée si absent, met à jour sinon.
      account = await prisma.account.upsert({
        where: { email },
        update: {
          passwordHash: hash,
          role: "super_admin",
          state: "active",
        },
        create: {
          email,
          role: "super_admin",
          state: "active",
          passwordHash: hash,
          validatedAt: new Date(),
        },
      });
      console.log(`✓ Compte super-admin (${email}) prêt (id ${account.id}).`);
    }

    // Journal d'audit
    try {
      await prisma.auditLog.create({
        data: {
          accountId: account.id,
          action: "settings_change",
          metadata: { via: "set-admin CLI", email },
        },
      });
    } catch {
      // AuditLog inexistant en cas de migration très ancienne — non bloquant.
    }

    console.log("\n✓ Terminé.");
    console.log("  Va sur https://ton-site/settings pour tester le login.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Script exécuté après `prisma generate` dans deploy.sh.
 * Collecte les infos du déploiement (migrations appliquées, stats DB, git)
 * et les sauvegarde dans la table settings sous la clé "deploy_report".
 *
 * Usage :
 *   node --loader tsx/esm scripts/post-deploy-report.ts [deploy-start-iso]
 *   pnpm exec tsx scripts/post-deploy-report.ts [deploy-start-iso]
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = join(__dirname, "..");

const prisma = new PrismaClient();

type MigrationRow = {
  id: string;
  migration_name: string;
  finished_at: Date | null;
};

async function main() {
  const deployStartArg = process.argv[2];
  const deployStart = deployStartArg ? new Date(deployStartArg) : new Date(Date.now() - 30 * 60 * 1000);

  // ── Git info ────────────────────────────────────────────────────────────────
  let gitCommit = "inconnu";
  let gitMessage = "";
  let gitAuthor = "";
  try {
    gitCommit = execSync("git rev-parse --short HEAD", { cwd: APP_DIR, encoding: "utf8" }).trim();
    gitMessage = execSync('git log -1 --pretty=format:"%s"', { cwd: APP_DIR, encoding: "utf8" }).trim();
    gitAuthor = execSync('git log -1 --pretty=format:"%an"', { cwd: APP_DIR, encoding: "utf8" }).trim();
  } catch {
    // git non disponible, ce n'est pas bloquant
  }

  // ── Migrations appliquées depuis le début du déploiement ────────────────────
  let newMigrations: MigrationRow[] = [];
  try {
    newMigrations = await prisma.$queryRaw<MigrationRow[]>`
      SELECT id, migration_name, finished_at
      FROM _prisma_migrations
      WHERE finished_at IS NOT NULL
        AND finished_at >= ${deployStart}
      ORDER BY finished_at ASC
    `;
  } catch {
    // Table _prisma_migrations peut ne pas exister en dev
  }

  const migrationsWithDesc = newMigrations.map((m) => {
    const descPath = join(APP_DIR, "prisma", "migrations", m.migration_name, "description.json");
    let description: { version?: string; title?: string; changes?: string[] } | null = null;
    if (existsSync(descPath)) {
      try {
        description = JSON.parse(readFileSync(descPath, "utf-8"));
      } catch {
        // ignore
      }
    }
    return {
      name: m.migration_name,
      appliedAt: m.finished_at?.toISOString() ?? null,
      description,
    };
  });

  // ── Stats DB ────────────────────────────────────────────────────────────────
  const [recipeCount, ingredientCount, folderCount] = await Promise.all([
    prisma.recipe.count(),
    prisma.ingredient.count(),
    prisma.folder.count(),
  ]);

  // ── Sauvegarde ──────────────────────────────────────────────────────────────
  const report = {
    deployedAt: new Date().toISOString(),
    gitCommit,
    gitMessage,
    gitAuthor,
    migrations: migrationsWithDesc,
    stats: { recipeCount, ingredientCount, folderCount },
  };

  await prisma.setting.upsert({
    where: { key: "deploy_report" },
    update: { value: report as object },
    create: { key: "deploy_report", value: report as object },
  });

  console.log(`✓ Rapport de déploiement enregistré`);
  console.log(`  → Commit : ${gitCommit} — ${gitMessage}`);
  console.log(`  → Migrations appliquées : ${migrationsWithDesc.length}`);
  console.log(`  → Recettes : ${recipeCount}`);
}

main()
  .catch((e) => {
    console.error("post-deploy-report:", e.message ?? e);
    process.exit(0); // Ne pas bloquer le déploiement si le script échoue
  })
  .finally(() => prisma.$disconnect());

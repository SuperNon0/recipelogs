/**
 * Assistant de configuration interactif : pose chaque question, met à jour
 * le .env, puis amorce le compte super-admin en base.
 *
 * Usage :
 *   pnpm setup                    # interactif complet
 *   pnpm setup --preset shared    # applique les défauts « bibliothèque partagée »
 *
 * Note : ce script n'écrase JAMAIS DATABASE_URL, NEXT_PUBLIC_APP_URL,
 * NODE_ENV ou UPLOAD_* — seulement les blocs Auth / CF / CAP_*.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const ENV_PATH = path.resolve(process.cwd(), ".env");
const ENV_EXAMPLE = path.resolve(process.cwd(), ".env.example");

type Answers = {
  SESSION_SECRET: string;
  SUPERADMIN_EMAIL: string;
  SUPERADMIN_PASSWORD: string;
  CF_TEAM_DOMAIN: string;
  CF_AUD: string;
  CF_VERIFY_JWT: string;
  ALLOW_LOCAL_LOGIN: string;
  CAP_ACCOUNT_MANAGEMENT: string;
  CAP_ADMIN_PASSWORD: string;
  CAP_SITE_UPDATE: string;
};

function parseEnvFile(p: string): Record<string, string> {
  if (!fs.existsSync(p)) return {};
  const out: Record<string, string> = {};
  const content = fs.readFileSync(p, "utf8");
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    const [, key, valRaw] = m;
    let val = valRaw.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function writeEnvFile(p: string, values: Record<string, string>): void {
  // Repart du .env.example pour préserver structure et commentaires ;
  // remplace juste les clés qu'on gère.
  const template = fs.existsSync(p)
    ? fs.readFileSync(p, "utf8")
    : fs.existsSync(ENV_EXAMPLE)
      ? fs.readFileSync(ENV_EXAMPLE, "utf8")
      : "";

  const lines = template.split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const m = /^([A-Z_][A-Z0-9_]*)=/.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    const key = m[1];
    if (key in values) {
      out.push(`${key}=${values[key]}`);
      seen.add(key);
    } else {
      out.push(line);
    }
  }
  // Nouvelles clés non présentes dans le template : append en fin
  const extra = Object.keys(values).filter((k) => !seen.has(k));
  if (extra.length > 0) {
    out.push("");
    for (const k of extra) out.push(`${k}=${values[k]}`);
  }
  fs.writeFileSync(p, out.join("\n"), "utf8");
}

function question(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
}

async function askCapability(
  rl: readline.Interface,
  key: string,
  question_text: string,
  defaultValue: string,
): Promise<string> {
  console.log(`\n${question_text}`);
  console.log("  [1] super_admin (recommandé)");
  console.log("  [2] member (n'importe quel membre actif)");
  console.log("  [3] off (désactivé)");
  const raw = (
    await question(rl, `  Ton choix [1] ? `)
  ).trim();
  if (raw === "2") return "member";
  if (raw === "3") return "off";
  return defaultValue;
}

function isFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function getArg(name: string): string | undefined {
  const idx = process.argv.slice(2).findIndex((a) => a === `--${name}`);
  if (idx === -1) return undefined;
  return process.argv.slice(2)[idx + 1];
}

async function main() {
  console.log("═══ Configuration RecipeLog ═══\n");

  const existing = parseEnvFile(ENV_PATH);
  const preset = getArg("preset") ?? (isFlag("preset") ? "shared" : undefined);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answers: Answers = {
      SESSION_SECRET: existing.SESSION_SECRET || "",
      SUPERADMIN_EMAIL: existing.SUPERADMIN_EMAIL || "",
      SUPERADMIN_PASSWORD: existing.SUPERADMIN_PASSWORD || "",
      CF_TEAM_DOMAIN: existing.CF_TEAM_DOMAIN || "",
      CF_AUD: existing.CF_AUD || "",
      CF_VERIFY_JWT: existing.CF_VERIFY_JWT || "true",
      ALLOW_LOCAL_LOGIN: existing.ALLOW_LOCAL_LOGIN || "true",
      CAP_ACCOUNT_MANAGEMENT: existing.CAP_ACCOUNT_MANAGEMENT || "super_admin",
      CAP_ADMIN_PASSWORD: existing.CAP_ADMIN_PASSWORD || "super_admin",
      CAP_SITE_UPDATE: existing.CAP_SITE_UPDATE || "super_admin",
    };

    // 1. Session secret
    if (!answers.SESSION_SECRET || answers.SESSION_SECRET.length < 32) {
      answers.SESSION_SECRET = randomBytes(32).toString("hex");
      console.log(`✓ Session secret généré (32 bytes).`);
    } else {
      console.log(`✓ Session secret existant conservé.`);
    }

    // 2. Super-admin email + password
    const emailInput = (
      await question(
        rl,
        `\nE-mail Google du super-administrateur [${answers.SUPERADMIN_EMAIL || "requis"}] : `,
      )
    ).trim();
    if (emailInput) answers.SUPERADMIN_EMAIL = emailInput;
    if (!answers.SUPERADMIN_EMAIL) {
      console.error("✗ Un e-mail est obligatoire.");
      process.exit(1);
    }

    const wantChangePwd = answers.SUPERADMIN_PASSWORD ? true : true;
    if (wantChangePwd) {
      const prompt = answers.SUPERADMIN_PASSWORD
        ? "Nouveau mot de passe local (Entrée pour garder l'existant) : "
        : "Mot de passe local (min 8 chars) : ";
      const pwd = (await question(rl, `\n${prompt}`)).trim();
      if (pwd) {
        if (pwd.length < 8) {
          console.error("✗ Mot de passe trop court (min 8 chars).");
          process.exit(1);
        }
        answers.SUPERADMIN_PASSWORD = pwd;
      }
    }
    if (!answers.SUPERADMIN_PASSWORD) {
      console.error("✗ Un mot de passe est obligatoire.");
      process.exit(1);
    }

    // 3. Cloudflare
    console.log("\n─── Cloudflare Zero Trust ───");
    const teamDomain = (
      await question(
        rl,
        `Team domain (ex : super-nono.cloudflareaccess.com) [${answers.CF_TEAM_DOMAIN || "vide"}] : `,
      )
    ).trim();
    if (teamDomain) answers.CF_TEAM_DOMAIN = teamDomain;
    const aud = (
      await question(rl, `Application AUD [${answers.CF_AUD || "vide"}] : `)
    ).trim();
    if (aud) answers.CF_AUD = aud;
    const verify = (
      await question(rl, `Vérifier le JWT ? [O/n] : `)
    ).trim().toLowerCase();
    answers.CF_VERIFY_JWT = verify === "n" ? "false" : "true";

    const localLogin = (
      await question(rl, `Autoriser le login LAN par mot de passe ? [O/n] : `)
    ).trim().toLowerCase();
    answers.ALLOW_LOCAL_LOGIN = localLogin === "n" ? "false" : "true";

    // 4. Permissions
    console.log("\n─── Permissions ───");
    if (preset === "shared") {
      console.log("Preset « bibliothèque partagée » : toutes les caps à super_admin.");
      answers.CAP_ACCOUNT_MANAGEMENT = "super_admin";
      answers.CAP_ADMIN_PASSWORD = "super_admin";
      answers.CAP_SITE_UPDATE = "super_admin";
    } else {
      answers.CAP_ACCOUNT_MANAGEMENT = await askCapability(
        rl,
        "CAP_ACCOUNT_MANAGEMENT",
        "1/3 — Gestion des comptes (accepter/refuser/bloquer/supprimer)",
        answers.CAP_ACCOUNT_MANAGEMENT,
      );
      answers.CAP_ADMIN_PASSWORD = await askCapability(
        rl,
        "CAP_ADMIN_PASSWORD",
        "2/3 — Changer le mot de passe administrateur",
        answers.CAP_ADMIN_PASSWORD,
      );
      answers.CAP_SITE_UPDATE = await askCapability(
        rl,
        "CAP_SITE_UPDATE",
        "3/3 — Bouton « Mettre à jour le site »",
        answers.CAP_SITE_UPDATE,
      );
    }

    // Écrit le .env
    console.log(`\n✓ Écriture de ${ENV_PATH}`);
    writeEnvFile(ENV_PATH, answers);

    // Amorce le compte super-admin
    console.log("\n─── Amorce du compte super-admin en base ───");
    const prisma = new PrismaClient();
    try {
      const hash = await bcrypt.hash(answers.SUPERADMIN_PASSWORD, 12);
      await prisma.account.upsert({
        where: { email: answers.SUPERADMIN_EMAIL },
        update: { role: "super_admin", state: "active", passwordHash: hash },
        create: {
          email: answers.SUPERADMIN_EMAIL,
          role: "super_admin",
          state: "active",
          passwordHash: hash,
          validatedAt: new Date(),
        },
      });
      console.log(`✓ Compte super-admin (${answers.SUPERADMIN_EMAIL}) prêt.`);
    } catch (e) {
      console.error("✗ Impossible d'amorcer le compte super-admin :", e);
      console.error(
        "  Vérifie que DATABASE_URL est bon et que la migration a été appliquée",
      );
      console.error("  (`pnpm exec prisma migrate deploy`).");
    } finally {
      await prisma.$disconnect();
    }

    console.log("\n✓ Setup terminé.");
    console.log("Prochaines étapes :");
    console.log("  1. pnpm exec prisma migrate deploy   # applique les migrations");
    console.log("  2. pnpm build                        # build de prod");
    console.log("  3. Démarrer le service (systemd, pm2, etc.)");
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

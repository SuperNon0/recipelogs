"use server";

import { spawn } from "node:child_process";
import { existsSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { BOOT_TIME } from "@/lib/bootTime";

const DEPLOY_SCRIPT = "/opt/recipelog/deploy/proxmox/deploy.sh";
const LOCK_FILE = "/tmp/recipelog-deploy.lock";
const LOG_FILE = "/tmp/recipelog-deploy.log";
const LOCK_STALE_MS = 30 * 60 * 1000; // 30 min

export type DeployActionResult =
  | { ok: true; bootedAt: number }
  | { ok: false; error: string };

/**
 * Lance la mise à jour en arrière-plan via `sudo bash deploy.sh`.
 * - Détache le process pour qu'il survive au restart Next.js qui
 *   intervient à la fin du script.
 * - Écrit la sortie dans /tmp/recipelog-deploy.log pour suivi.
 * - Pose un lock pour empêcher les déploiements concurrents.
 * - Le sudoers (cf. setup.sh) doit autoriser ${APP_USER} à exécuter
 *   ce script sans mot de passe.
 */
export async function triggerDeploy(): Promise<DeployActionResult> {
  if (!existsSync(DEPLOY_SCRIPT)) {
    return {
      ok: false,
      error: `Script de déploiement introuvable (${DEPLOY_SCRIPT}). En dev local, le bouton est désactivé.`,
    };
  }

  // Lock — on rejette si un déploiement est déjà en cours, sauf s'il est rance.
  if (existsSync(LOCK_FILE)) {
    try {
      const age = Date.now() - statSync(LOCK_FILE).mtimeMs;
      if (age < LOCK_STALE_MS) {
        return { ok: false, error: "Une mise à jour est déjà en cours." };
      }
    } catch {
      // ignore
    }
  }

  try {
    writeFileSync(LOCK_FILE, String(Date.now()));
    writeFileSync(
      LOG_FILE,
      `\n========================================\n--- Démarrage : ${new Date().toLocaleString("fr-FR")} ---\n========================================\n`,
      { flag: "a" },
    );
  } catch (e) {
    return { ok: false, error: `Impossible d'écrire le lock : ${(e as Error).message}` };
  }

  // Process détaché. La sortie va dans LOG_FILE. Le script supprimera le lock à la fin.
  const cmd = `(sudo /bin/bash ${DEPLOY_SCRIPT} >> ${LOG_FILE} 2>&1; rm -f ${LOCK_FILE}) &`;
  const child = spawn("/bin/bash", ["-c", cmd], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return { ok: true, bootedAt: BOOT_TIME };
}

export async function getDeployStatus() {
  const inProgress = existsSync(LOCK_FILE);
  return { inProgress, bootedAt: BOOT_TIME };
}

export async function getDeployLog(maxLines = 80): Promise<string> {
  if (!existsSync(LOG_FILE)) return "";
  try {
    const content = readFileSync(LOG_FILE, "utf8");
    const lines = content.split("\n");
    return lines.slice(-maxLines).join("\n");
  } catch {
    return "";
  }
}

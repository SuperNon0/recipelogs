"use server";

import { spawn, spawnSync } from "node:child_process";
import { existsSync, statSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { BOOT_TIME } from "@/lib/bootTime";

const DEPLOY_SCRIPT = "/opt/recipelog/deploy/proxmox/deploy.sh";
const LOCK_FILE = "/tmp/recipelog-deploy.lock";
const LOG_FILE = "/tmp/recipelog-deploy.log";
const LOCK_STALE_MS = 30 * 60 * 1000; // 30 min

export type DeployActionResult =
  | { ok: true; bootedAt: number }
  | { ok: false; error: string; hint?: string };

/**
 * Vérifie que `sudo -n` peut exécuter le script sans demander de mot de passe.
 * Retourne null si OK, sinon un message d'erreur explicite.
 */
function checkSudoers(): string | null {
  try {
    // sudo -n -l <script> : "list" en mode non-interactif. Réussit si NOPASSWD configuré.
    const r = spawnSync("sudo", ["-n", "-l", DEPLOY_SCRIPT], {
      timeout: 5_000,
      encoding: "utf8",
    });
    if (r.status === 0) return null;
    // status non-0 → soit pas configuré, soit demande mot de passe
    return "Le sudoers n'est pas configuré pour permettre l'exécution sans mot de passe.";
  } catch (e) {
    return `Vérification sudo impossible : ${(e as Error).message}`;
  }
}

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

  // Pré-check : vérifier que sudo NOPASSWD est bien configuré.
  // Sinon on échoue tout de suite avec un message explicite.
  const sudoErr = checkSudoers();
  if (sudoErr) {
    return {
      ok: false,
      error: sudoErr,
      hint:
        "À lancer une fois dans le container LXC (en root) :\n" +
        '  echo "recipelog ALL=(root) NOPASSWD: /opt/recipelog/deploy/proxmox/deploy.sh" | sudo tee /etc/sudoers.d/recipelog-deploy\n' +
        "  sudo chmod 0440 /etc/sudoers.d/recipelog-deploy",
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
  // IMPORTANT : on appelle le script DIRECTEMENT (pas via /bin/bash <script>),
  // sinon sudo voit la commande comme "/bin/bash" et la règle NOPASSWD
  // sur "/opt/recipelog/deploy/proxmox/deploy.sh" ne matche pas.
  // Le script doit avoir son shebang (#!/usr/bin/env bash) et être exécutable.
  const cmd = `(sudo -n ${DEPLOY_SCRIPT} >> ${LOG_FILE} 2>&1; rm -f ${LOCK_FILE}) &`;
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

/** Supprime le lock — utile pour débloquer après un échec. */
export async function clearDeployLock(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!existsSync(LOCK_FILE)) return { ok: true };
  try {
    unlinkSync(LOCK_FILE);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Impossible de supprimer le lock : ${(e as Error).message}` };
  }
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

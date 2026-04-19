#!/usr/bin/env bash
# ============================================================
# deploy.sh — Mise à jour de RecipeLog (git pull + build + restart)
# À exécuter dans le container en root ou avec sudo
#
# Usage :
#   bash /opt/recipelog/deploy/proxmox/deploy.sh
# ============================================================
set -euo pipefail

APP_USER="recipelog"
APP_DIR="/opt/recipelog"

echo "==> [$(date '+%H:%M:%S')] Démarrage du déploiement..."

# ── Pull ────────────────────────────────────────────────
echo "==> Git pull..."
sudo -u "${APP_USER}" git -C "${APP_DIR}" pull --ff-only

# ── Dépendances ──────────────────────────────────────────
echo "==> pnpm install..."
sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && pnpm install --frozen-lockfile"

# ── Migrations ──────────────────────────────────────────
echo "==> Migrations Prisma..."
sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && pnpm exec prisma migrate deploy"

# ── Build ────────────────────────────────────────────────
echo "==> Build Next.js..."
sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && pnpm build"

# ── Restart ─────────────────────────────────────────────
echo "==> Redémarrage du service..."
systemctl restart recipelog
sleep 2
systemctl is-active recipelog && echo "==> Service actif ✓" || echo "==> ERREUR : service inactif"

echo "==> [$(date '+%H:%M:%S')] Déploiement terminé."

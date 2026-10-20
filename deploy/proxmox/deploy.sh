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
UPLOAD_DIR="/var/lib/recipelog/uploads"

echo "==> [$(date '+%H:%M:%S')] Démarrage du déploiement..."

# ── Dossier des photos (hors du build, sinon effacé à chaque déploiement) ──
mkdir -p "${UPLOAD_DIR}"
# Récupère les photos qui avaient été écrites dans l'ancien emplacement.
OLD_UPLOADS="${APP_DIR}/.next/standalone/public/uploads"
if [ -d "${OLD_UPLOADS}" ]; then
  cp -rn "${OLD_UPLOADS}/." "${UPLOAD_DIR}/" || true
fi
chown -R "${APP_USER}:${APP_USER}" "$(dirname "${UPLOAD_DIR}")"
if ! grep -q '^UPLOAD_DIR=' "${APP_DIR}/.env"; then
  echo "UPLOAD_DIR=\"${UPLOAD_DIR}\"" >> "${APP_DIR}/.env"
fi

# ── Pull ────────────────────────────────────────────────
echo "==> Git pull..."
sudo -u "${APP_USER}" git -C "${APP_DIR}" pull --ff-only

# ── Dépendances ──────────────────────────────────────────
echo "==> pnpm install..."
sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && pnpm install --frozen-lockfile"

# ── Migrations ──────────────────────────────────────────
echo "==> Migrations Prisma..."
DEPLOY_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && pnpm exec prisma migrate deploy"

# ── Build ────────────────────────────────────────────────
echo "==> Build Next.js..."
sudo -u "${APP_USER}" bash -c "
  cd ${APP_DIR}
  pnpm exec prisma generate

  # Rapport de déploiement (migrations appliquées + stats DB)
  pnpm exec tsx scripts/post-deploy-report.ts '${DEPLOY_START}' || echo '⚠ post-deploy-report ignoré'

  pnpm build
  # Mode standalone : copier static/ et public/ dans .next/standalone/
  rm -rf .next/standalone/.next/static .next/standalone/public
  cp -r .next/static .next/standalone/.next/static
  [ -d public ] && cp -r public .next/standalone/public || true
"

# ── Restart ─────────────────────────────────────────────
echo "==> Redémarrage du service..."
systemctl restart recipelog
sleep 2
systemctl is-active recipelog && echo "==> Service actif ✓" || echo "==> ERREUR : service inactif"

echo "==> [$(date '+%H:%M:%S')] Déploiement terminé."

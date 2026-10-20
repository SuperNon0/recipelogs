#!/usr/bin/env bash
# ============================================================
# backup.sh — Sauvegarde PostgreSQL + photos de RecipeLog
# À planifier dans cron (ex: quotidien à 3h)
#
# Crontab (root) :
#   0 3 * * * bash /opt/recipelog/deploy/proxmox/backup.sh
#
# Usage :
#   bash /opt/recipelog/deploy/proxmox/backup.sh [DEST_DIR]
# ============================================================
set -euo pipefail

DB_NAME="recipelog"
DB_USER="recipelog"
BACKUP_DIR="${1:-/var/backups/recipelog}"
RETENTION_DAYS=30
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/recipelog_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "==> Sauvegarde de la base ${DB_NAME}..."
sudo -u postgres pg_dump "${DB_NAME}" | gzip > "${BACKUP_FILE}"
echo "==> Fichier : ${BACKUP_FILE} ($(du -sh "${BACKUP_FILE}" | cut -f1))"

# Photos et fichiers envoyés
UPLOAD_DIR="/var/lib/recipelog/uploads"
if [ -d "${UPLOAD_DIR}" ]; then
  UPLOADS_FILE="${BACKUP_DIR}/recipelog_uploads_${TIMESTAMP}.tar.gz"
  tar -czf "${UPLOADS_FILE}" -C "$(dirname "${UPLOAD_DIR}")" "$(basename "${UPLOAD_DIR}")"
  echo "==> Photos : ${UPLOADS_FILE} ($(du -sh "${UPLOADS_FILE}" | cut -f1))"
fi

# Nettoyage des sauvegardes anciennes
echo "==> Nettoyage des sauvegardes > ${RETENTION_DAYS} jours..."
find "${BACKUP_DIR}" -name "recipelog_*.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "==> Sauvegardes disponibles :"
ls -lh "${BACKUP_DIR}"/recipelog_*.gz 2>/dev/null || echo "    (aucune)"

echo "==> Backup terminé."

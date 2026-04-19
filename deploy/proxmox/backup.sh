#!/usr/bin/env bash
# ============================================================
# backup.sh — Sauvegarde PostgreSQL de RecipeLog
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

# Nettoyage des sauvegardes anciennes
echo "==> Nettoyage des sauvegardes > ${RETENTION_DAYS} jours..."
find "${BACKUP_DIR}" -name "recipelog_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "==> Sauvegardes disponibles :"
ls -lh "${BACKUP_DIR}"/recipelog_*.sql.gz 2>/dev/null || echo "    (aucune)"

echo "==> Backup terminé."

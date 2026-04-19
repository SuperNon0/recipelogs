#!/usr/bin/env bash
# Collecte les logs RecipeLog pour diagnostic et support.
# Usage : bash collect-logs.sh
# Produit : /tmp/recipelog-logs-YYYYMMDD-HHMMSS.tar.gz

set -euo pipefail

TS=$(date +"%Y%m%d-%H%M%S")
DIR=$(mktemp -d "/tmp/recipelog-logs-${TS}.XXXXXX")
OUT="/tmp/recipelog-logs-${TS}.tar.gz"

echo "==> Collecte des logs RecipeLog (${TS})"
echo "    Dossier temporaire : ${DIR}"

# ─── Informations système ─────────────────────────────────────────────────────

echo "==> Infos système..."
{
  echo "=== Date ==="
  date

  echo ""
  echo "=== OS ==="
  cat /etc/os-release 2>/dev/null || echo "N/A"

  echo ""
  echo "=== Uptime ==="
  uptime

  echo ""
  echo "=== Mémoire ==="
  free -h

  echo ""
  echo "=== Disque ==="
  df -h /opt/recipelog 2>/dev/null || df -h /

  echo ""
  echo "=== Node.js ==="
  node --version 2>/dev/null || echo "N/A"

  echo ""
  echo "=== pnpm ==="
  pnpm --version 2>/dev/null || echo "N/A"

  echo ""
  echo "=== Chromium ==="
  chromium --version 2>/dev/null || chromium-browser --version 2>/dev/null || echo "N/A"

  echo ""
  echo "=== PostgreSQL ==="
  psql --version 2>/dev/null || echo "N/A"

} > "${DIR}/system-info.txt" 2>&1

# ─── Git ─────────────────────────────────────────────────────────────────────

echo "==> Infos Git..."
{
  echo "=== Dernier commit déployé ==="
  if [ -d /opt/recipelog/.git ]; then
    git -C /opt/recipelog log --oneline -5 2>/dev/null || echo "N/A"
    echo ""
    echo "=== Branch ==="
    git -C /opt/recipelog branch --show-current 2>/dev/null || echo "N/A"
    echo ""
    echo "=== Status ==="
    git -C /opt/recipelog status --short 2>/dev/null || echo "N/A"
  else
    echo "Dossier /opt/recipelog/.git introuvable"
  fi
} > "${DIR}/git-info.txt" 2>&1

# ─── Service recipelog ────────────────────────────────────────────────────────

echo "==> Logs service recipelog..."
{
  echo "=== systemctl status ==="
  systemctl status recipelog --no-pager -l 2>/dev/null || echo "Service introuvable"

  echo ""
  echo "=== journalctl (200 dernières lignes) ==="
  journalctl -u recipelog -n 200 --no-pager 2>/dev/null || echo "N/A"

} > "${DIR}/recipelog-service.txt" 2>&1

# ─── nginx ───────────────────────────────────────────────────────────────────

echo "==> Logs nginx..."
{
  echo "=== systemctl status ==="
  systemctl status nginx --no-pager -l 2>/dev/null || echo "Service introuvable"

  echo ""
  echo "=== nginx -t ==="
  nginx -t 2>&1 || true

} > "${DIR}/nginx-status.txt" 2>&1

# Logs nginx (fichiers)
for f in /var/log/nginx/error.log /var/log/nginx/access.log \
          /var/log/nginx/recipelog.error.log /var/log/nginx/recipelog.access.log; do
  if [ -f "${f}" ]; then
    # Garder les 500 dernières lignes
    tail -500 "${f}" > "${DIR}/$(basename ${f})" 2>/dev/null || true
  fi
done

# ─── PostgreSQL ──────────────────────────────────────────────────────────────

echo "==> Logs PostgreSQL..."
{
  echo "=== systemctl status ==="
  systemctl status postgresql --no-pager -l 2>/dev/null || echo "Service introuvable"

  echo ""
  echo "=== Test connexion ==="
  psql -U recipelog -d recipelog -c "SELECT version();" 2>&1 || echo "Connexion échouée"

  echo ""
  echo "=== Tables existantes ==="
  psql -U recipelog -d recipelog -c "\dt" 2>&1 || echo "N/A"

} > "${DIR}/postgresql-status.txt" 2>&1

# Logs PostgreSQL (fichiers)
PG_LOG_DIR=$(find /var/log/postgresql -name "*.log" 2>/dev/null | sort | tail -1 || true)
if [ -n "${PG_LOG_DIR}" ]; then
  tail -500 "${PG_LOG_DIR}" > "${DIR}/postgresql.log" 2>/dev/null || true
fi

# ─── .env (version filtrée — sans valeurs sensibles) ─────────────────────────

echo "==> Fichier .env (clés uniquement)..."
if [ -f /opt/recipelog/.env ]; then
  grep -v '#' /opt/recipelog/.env | cut -d'=' -f1 | grep -v '^$' \
    > "${DIR}/env-keys-only.txt" 2>/dev/null || true
  echo "(Seules les clés sont collectées, pas les valeurs)" >> "${DIR}/env-keys-only.txt"
fi

# ─── Port et process ─────────────────────────────────────────────────────────

echo "==> Ports et processus..."
{
  echo "=== Ports ouverts ==="
  ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo "N/A"

  echo ""
  echo "=== Processus Node ==="
  pgrep -a node 2>/dev/null || echo "Aucun processus node"

} > "${DIR}/ports-processes.txt" 2>&1

# ─── Archivage ───────────────────────────────────────────────────────────────

echo "==> Création de l'archive..."
tar -czf "${OUT}" -C "$(dirname ${DIR})" "$(basename ${DIR})"
rm -rf "${DIR}"

echo ""
echo "============================================================"
echo " Archive créée : ${OUT}"
echo " Taille        : $(du -sh ${OUT} | cut -f1)"
echo "============================================================"
echo ""
echo " Transmettre ce fichier pour analyse :"
echo "   scp root@<ip-container>:${OUT} ."
echo ""

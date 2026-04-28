#!/usr/bin/env bash
# ============================================================
# setup.sh — Installation complète de RecipeLog dans le LXC
# À exécuter UNE SEULE FOIS dans le container fraîchement créé
#
# Usage (dans le container, en root) :
#   bash /tmp/setup.sh
# ============================================================
set -euo pipefail

APP_USER="recipelog"
APP_DIR="/opt/recipelog"
DB_NAME="recipelog"
DB_USER="recipelog"
DB_PASS="$(openssl rand -base64 24)"
NODE_VERSION="22"

echo "======================================================"
echo "  RecipeLog — Installation LXC"
echo "======================================================"

# ── 1. Paquets système ────────────────────────────────────
echo "==> Mise à jour et installation des paquets..."
apt-get update -qq
apt-get install -y -qq \
  curl git build-essential ca-certificates \
  postgresql postgresql-contrib \
  nginx chromium \
  openssl ufw

# ── 2. Node.js ───────────────────────────────────────────
echo "==> Installation de Node.js ${NODE_VERSION}..."
curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
apt-get install -y -qq nodejs

# ── 3. pnpm ──────────────────────────────────────────────
echo "==> Installation de pnpm..."
npm install -g pnpm@latest

# ── 4. PostgreSQL ────────────────────────────────────────
echo "==> Configuration de PostgreSQL..."
service postgresql start

sudo -u postgres psql <<SQL
  CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
  CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
  GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
  \c ${DB_NAME}
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL

# Activer PostgreSQL au démarrage
systemctl enable postgresql

# ── 5. Utilisateur applicatif ────────────────────────────
echo "==> Création de l'utilisateur ${APP_USER}..."
if ! id "${APP_USER}" &>/dev/null; then
  # Pas de --create-home : on veut que git clone crée le dossier
  useradd --system --shell /bin/bash --home-dir "${APP_DIR}" "${APP_USER}"
fi

# ── 6. Clone du dépôt ────────────────────────────────────
echo "==> Clone du dépôt..."
if [ -d "${APP_DIR}/.git" ]; then
  echo "    Dépôt déjà présent, skip."
else
  # Si le dossier existe mais n'est pas un repo git, on le vide
  if [ -d "${APP_DIR}" ]; then
    rm -rf "${APP_DIR}"
  fi
  git clone https://github.com/SuperNon0/recipelogs.git "${APP_DIR}"
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
fi

# ── 7. Fichier .env ──────────────────────────────────────
echo "==> Création du fichier .env..."
cat > "${APP_DIR}/.env" <<ENV
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
NODE_ENV=production
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="https://recipe.super-nono.cc"
ENV

chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"

# ── 8. Build de l'application ────────────────────────────
echo "==> Installation des dépendances et build..."
sudo -u "${APP_USER}" bash -c "
  cd ${APP_DIR}
  pnpm install --frozen-lockfile
  pnpm exec prisma generate
  pnpm exec prisma migrate deploy
  pnpm exec prisma db seed
  pnpm build
  # Mode standalone : copier static/ et public/ dans .next/standalone/
  cp -r .next/static .next/standalone/.next/static
  [ -d public ] && cp -r public .next/standalone/public || true
"

# Permissions pour que nginx (www-data) puisse servir les statiques
chmod 755 "${APP_DIR}"
chmod -R o+rX "${APP_DIR}/.next"

# ── 9. Puppeteer Chromium ────────────────────────────────
echo "==> Configuration Puppeteer pour Chromium système..."
cat >> "${APP_DIR}/.env" <<ENV

PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV

# ── 10. Service systemd ──────────────────────────────────
echo "==> Installation du service systemd..."
cp "$(dirname "$0")/../recipelog.service" /etc/systemd/system/recipelog.service 2>/dev/null || \
cat > /etc/systemd/system/recipelog.service <<SERVICE
[Unit]
Description=RecipeLog Next.js
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node ${APP_DIR}/.next/standalone/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable recipelog
systemctl start recipelog

# ── 11. Nginx ────────────────────────────────────────────
echo "==> Configuration Nginx..."
cp "$(dirname "$0")/../nginx.conf" /etc/nginx/sites-available/recipelog 2>/dev/null || \
cat > /etc/nginx/sites-available/recipelog <<'NGINX'
server {
    listen 80;
    server_name recipe.super-nono.cc;

    location /_next/static/ {
        alias /opt/recipelog/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/recipelog /etc/nginx/sites-enabled/recipelog
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable nginx && systemctl restart nginx

# ── 12. Firewall ─────────────────────────────────────────
echo "==> Configuration UFW..."
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# ── Résumé ───────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  Installation terminée !"
echo "======================================================"
echo ""
echo "  App    : http://$(hostname -I | awk '{print $1}')"
echo "  DB     : ${DB_NAME} / ${DB_USER}"
echo "  Secret : voir ${APP_DIR}/.env"
echo ""
echo "  Commandes utiles :"
echo "    systemctl status recipelog"
echo "    journalctl -u recipelog -f"
echo "    bash /opt/recipelog/deploy/proxmox/deploy.sh"
echo ""
echo "  N'oubliez pas de configurer Cloudflare Zero Trust !"

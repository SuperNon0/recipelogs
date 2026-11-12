#!/usr/bin/env bash
# ============================================================
# setup.sh — Installation complète de RecipeLog dans le conteneur
#
# Le plus simple : lancer install.sh sur l'hôte Proxmox, qui crée le conteneur
# et lance ce script dedans (voir docs/installer-un-nouveau-site.md).
#
# À la main, dans un conteneur Debian 12 neuf, en root :
#   RECIPELOG_BRANCH=stable RECIPELOG_ADMIN_EMAILS=moi@exemple.fr bash setup.sh
#
# Réglages (variables d'environnement, ou fichier /root/recipelog-install.env) :
#   RECIPELOG_BRANCH       branche suivie par le site et par ses mises à jour
#                          (main = bêta, stable = version validée). Défaut : main
#   RECIPELOG_ADMIN_EMAILS adresse(s) du compte de maintenance (administrateur
#                          caché, voir src/lib/auth/maintenance.ts). Facultatif
#   CF_TUNNEL_TOKEN        jeton du tunnel Cloudflare. Facultatif : sans lui,
#                          installer le tunnel plus tard
#   RECIPELOG_REPO         dépôt GitHub. Défaut : SuperNon0/recipelogs
# ============================================================
set -euo pipefail

CONF="/root/recipelog-install.env"
if [ -f "${CONF}" ]; then
  # shellcheck disable=SC1090
  . "${CONF}"
fi

BRANCH="${RECIPELOG_BRANCH:-main}"
ADMIN_EMAILS="${RECIPELOG_ADMIN_EMAILS:-}"
TUNNEL_TOKEN="${CF_TUNNEL_TOKEN:-}"
REPO="${RECIPELOG_REPO:-https://github.com/SuperNon0/recipelogs.git}"

APP_USER="recipelog"
APP_DIR="/opt/recipelog"
DB_NAME="recipelog"
DB_USER="recipelog"
NODE_VERSION="22"
export DEBIAN_FRONTEND=noninteractive

if [ "${EUID}" -ne 0 ]; then
  echo "À lancer en root." >&2
  exit 1
fi

echo "======================================================"
echo "  RecipeLog — installation (branche ${BRANCH})"
echo "======================================================"

# ── 1. Paquets système ────────────────────────────────────
echo "==> Paquets système..."
apt-get update -qq
apt-get install -y -qq \
  curl git sudo cron build-essential ca-certificates gnupg openssl \
  postgresql postgresql-contrib nginx chromium ffmpeg

# ── 2. Node.js et pnpm ───────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" != "${NODE_VERSION}" ]; then
  echo "==> Node.js ${NODE_VERSION}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y -qq nodejs
fi

# ── 3. Utilisateur et code ───────────────────────────────
if ! id "${APP_USER}" &>/dev/null; then
  echo "==> Utilisateur ${APP_USER}..."
  useradd --system --shell /bin/bash --home-dir "${APP_DIR}" "${APP_USER}"
fi
if [ -d "${APP_DIR}/.git" ]; then
  echo "==> Code déjà présent : passage sur la branche ${BRANCH}..."
  sudo -u "${APP_USER}" git -C "${APP_DIR}" fetch origin "${BRANCH}"
  sudo -u "${APP_USER}" git -C "${APP_DIR}" checkout -B "${BRANCH}" "origin/${BRANCH}"
  sudo -u "${APP_USER}" git -C "${APP_DIR}" branch --set-upstream-to="origin/${BRANCH}" "${BRANCH}"
else
  echo "==> Téléchargement du code (branche ${BRANCH})..."
  rm -rf "${APP_DIR}"
  git clone --branch "${BRANCH}" "${REPO}" "${APP_DIR}"
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
fi
chmod 755 "${APP_DIR}"

PNPM_VERSION="$(node -p "(require('${APP_DIR}/package.json').packageManager || 'pnpm@10').split('@')[1]")"
if [ "$(pnpm --version 2>/dev/null || true)" != "${PNPM_VERSION}" ]; then
  echo "==> pnpm ${PNPM_VERSION}..."
  npm install -g "pnpm@${PNPM_VERSION}" >/dev/null
fi

# ── 4. Base de données ───────────────────────────────────
systemctl enable --now postgresql
if [ -f "${APP_DIR}/.env" ] && grep -q '^DATABASE_URL=' "${APP_DIR}/.env"; then
  echo "==> Base déjà configurée (.env présent) : on la garde."
else
  echo "==> Création de la base..."
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  ELSE
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
  fi
  sudo -u postgres psql -q -d "${DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

  umask 077
  cat > "${APP_DIR}/.env" <<ENV
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
NODE_ENV=production
UPLOAD_DIR="/var/lib/recipelog/uploads"
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV
  umask 022
fi
# Compte de maintenance (administrateur caché). Relancé sans adresse : on garde l'ancienne.
if [ -n "${ADMIN_EMAILS}" ]; then
  sed -i '/^RECIPELOG_ADMIN_EMAILS=/d' "${APP_DIR}/.env"
  echo "RECIPELOG_ADMIN_EMAILS=\"${ADMIN_EMAILS}\"" >> "${APP_DIR}/.env"
else
  ADMIN_EMAILS="$(sed -nE 's/^RECIPELOG_ADMIN_EMAILS="?([^"]*)"?$/\1/p' "${APP_DIR}/.env")"
fi
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"
mkdir -p /var/lib/recipelog/uploads
chown -R "${APP_USER}:${APP_USER}" /var/lib/recipelog

# ── 5. Service, nginx, scripts protégés ──────────────────
echo "==> Service, nginx et scripts de mise à jour..."
install -o root -g root -m 0644 "${APP_DIR}/deploy/recipelog.service" /etc/systemd/system/recipelog.service
systemctl daemon-reload
systemctl enable recipelog

install -o root -g root -m 0755 "${APP_DIR}/deploy/proxmox/deploy.sh" /usr/local/sbin/recipelog-deploy
install -o root -g root -m 0755 "${APP_DIR}/deploy/proxmox/backup.sh" /usr/local/sbin/recipelog-backup
cat > /etc/sudoers.d/recipelog-deploy <<SUDOERS
# Bouton « Mettre à jour le site » (Réglages).
${APP_USER} ALL=(root) NOPASSWD: /usr/local/sbin/recipelog-deploy ""
SUDOERS
chmod 0440 /etc/sudoers.d/recipelog-deploy
visudo -c -f /etc/sudoers.d/recipelog-deploy >/dev/null

echo "0 3 * * * root /usr/local/sbin/recipelog-backup >/var/log/recipelog-backup.log 2>&1" > /etc/cron.d/recipelog-backup
chmod 0644 /etc/cron.d/recipelog-backup

install -o root -g root -m 0644 "${APP_DIR}/deploy/nginx.conf" /etc/nginx/sites-available/recipelog
ln -sf /etc/nginx/sites-available/recipelog /etc/nginx/sites-enabled/recipelog
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx

# ── 6. Le site : version construite par GitHub ───────────
# Même chemin qu'une mise à jour : dépendances, paquet GitHub (ou build ici
# s'il manque), migrations de la base, démarrage et vérification.
echo "==> Installation du site (comme une mise à jour, quelques minutes)..."
/usr/local/sbin/recipelog-deploy --force

echo "==> Catégories et modèles PDF de départ..."
sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && set -a && . ./.env && set +a && pnpm exec prisma db seed" \
  || echo "⚠ données de départ ignorées"

# ── 7. Tunnel Cloudflare (facultatif) ────────────────────
if [ -n "${TUNNEL_TOKEN}" ]; then
  echo "==> Tunnel Cloudflare..."
  if ! command -v cloudflared >/dev/null 2>&1; then
    mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
      > /etc/apt/sources.list.d/cloudflared.list
    apt-get update -qq
    apt-get install -y -qq cloudflared
  fi
  cloudflared service uninstall >/dev/null 2>&1 || true
  cloudflared service install "${TUNNEL_TOKEN}"
fi

# Le fichier de réglages contenait le jeton du tunnel : on l'efface.
[ -f "${CONF}" ] && shred -u "${CONF}" 2>/dev/null || rm -f "${CONF}"

# ── Résumé ───────────────────────────────────────────────
health="❌ ne répond pas (journalctl -u recipelog)"
curl -fsS -o /dev/null --max-time 10 "http://127.0.0.1:3000/api/health?db=1" && health="✅ en ligne"
echo ""
echo "======================================================"
echo "  RecipeLog installé"
echo "======================================================"
echo "  Site           : ${health}"
echo "  Branche suivie : ${BRANCH} (le bouton « Mettre à jour le site » suit cette branche)"
if [ -n "${ADMIN_EMAILS}" ]; then
  echo "  Administrateur : ${ADMIN_EMAILS} (caché sur le site)"
else
  echo "  Administrateur : aucun compte de maintenance (RECIPELOG_ADMIN_EMAILS vide)"
fi
if [ -n "${TUNNEL_TOKEN}" ]; then
  echo "  Tunnel         : installé (systemctl status cloudflared)"
else
  echo "  Tunnel         : pas encore (voir le tuto, étape Cloudflare)"
fi
echo ""
echo "  Il n'y a pas de mot de passe : on entre par l'adresse Cloudflare du site,"
echo "  avec le code reçu par e-mail. Suite : docs/installer-un-nouveau-site.md"
echo "======================================================"

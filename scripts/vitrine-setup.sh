#!/usr/bin/env bash
# vitrine-setup.sh — installe le site vitrine DANS son conteneur (lancé par install.sh).
set -euo pipefail
REPO_URL="https://github.com/SuperNon0/recipelogs.git"
BRANCH="${VITRINE_BRANCH:-site-vitrine}"
DIR="/opt/vitrine"
# 8080 quand RecipeLog (la démo) est dans le même conteneur ; gardé pour les relances.
PORT="${VITRINE_PORT:-$(cat /etc/recipelog-vitrine/port 2>/dev/null || echo 80)}"
CONF="/etc/recipelog-vitrine"
export DEBIAN_FRONTEND=noninteractive

echo "==> Paquets (nginx, git)…"
apt-get update -qq
apt-get install -y -qq nginx git curl ca-certificates >/dev/null

echo "==> Code du site (branche ${BRANCH})…"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q --depth 1 origin "$BRANCH"
  git -C "$DIR" reset -q --hard FETCH_HEAD
else
  rm -rf "$DIR"
  git clone -q --depth 1 --branch "$BRANCH" --single-branch "$REPO_URL" "$DIR"
fi
echo "$BRANCH" > "$DIR/.branche"

echo "==> Réglages (${CONF})…"
mkdir -p "$CONF"
echo "$PORT" > "$CONF/port"
install -m 0755 "$DIR/scripts/vitrine-reglage" /usr/local/sbin/vitrine-reglage
install -m 0755 "$DIR/mise-a-jour.sh" /usr/local/sbin/vitrine-maj
if [ -n "${VITRINE_DEMO_URL:-}" ]; then vitrine-reglage demo "$VITRINE_DEMO_URL" >/dev/null; fi
if [ -n "${VITRINE_CONTACT:-}" ]; then vitrine-reglage contact "$VITRINE_CONTACT" >/dev/null; fi
vitrine-reglage >/dev/null

echo "==> nginx…"
cat > /etc/nginx/sites-available/vitrine <<NGINX_HEAD
server {
    listen ${PORT};
NGINX_HEAD
cat >> /etc/nginx/sites-available/vitrine <<'NGINX'
    server_name _;
    root /opt/vitrine/site;
    index index.html;

    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    gzip on;
    gzip_types text/css application/javascript image/svg+xml;

    # Réglages propres à ce serveur (adresse de la démo), gardés aux mises à jour
    location = /config.js {
        alias /etc/recipelog-vitrine/config.js;
        default_type application/javascript;
        add_header Cache-Control "no-cache";
    }
    location ~* \.(css|js|svg|png|jpg|webp|woff2)$ {
        add_header Cache-Control "public, max-age=3600";
    }
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
    # Rien d'autre que le dossier site/ n'est servi (scripts, .git…)
    location ~ /\. { deny all; }
}
NGINX
# Démo dans le même conteneur (RecipeLog n'écoute que sur 127.0.0.1:80) : une porte sur le
# réseau local, port 8081, pour un tunnel Cloudflare installé dans un AUTRE conteneur.
if [ -f /opt/recipelog/.env ]; then
  cat >> /etc/nginx/sites-available/vitrine <<'NGINX'

# Démo RecipeLog vue depuis le réseau local (tunnel dans un autre conteneur)
server {
    listen 8081;
    server_name _;
    client_max_body_size 25M;
    location / {
        proxy_pass         http://127.0.0.1:80;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        'upgrade';
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $http_x_forwarded_proto;
        proxy_read_timeout 120s;
    }
}
NGINX
fi
ln -sf /etc/nginx/sites-available/vitrine /etc/nginx/sites-enabled/vitrine
rm -f /etc/nginx/sites-enabled/default
nginx -t -q
systemctl enable -q nginx
systemctl reload nginx 2>/dev/null || systemctl restart nginx

if [ -n "${VITRINE_TUNNEL_TOKEN:-}" ]; then
  echo "==> Tunnel Cloudflare…"
  if ! command -v cloudflared >/dev/null; then
    mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
    echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
      > /etc/apt/sources.list.d/cloudflared.list
    apt-get update -qq && apt-get install -y -qq cloudflared >/dev/null
  fi
  cloudflared service install "$VITRINE_TUNNEL_TOKEN" >/dev/null 2>&1 || echo "    (tunnel déjà installé)"
fi

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "${PORT}/tcp" >/dev/null || true
  [ -f /opt/recipelog/.env ] && ufw allow 8081/tcp >/dev/null || true
fi
echo "==> Site vitrine prêt : http://$(hostname -I | awk '{print $1}'):${PORT}"

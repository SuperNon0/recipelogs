#!/usr/bin/env bash
# ============================================================
# install.sh — prépare une machine Debian 12 vierge pour la plateforme
# RecipeLog, en root, dans la VM :
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/main/plateforme/install.sh)"
#
# (creer-vm.sh, lancé sur l'hôte Proxmox, crée la VM et lance ce script tout seul.)
#
# Ce que ça fait :
#   1. installe Docker (dépôt officiel) ;
#   2. pare-feu : AUCUN port entrant, sauf SSH depuis le réseau local ;
#   3. récupère la plateforme dans /opt/recipelog-plateforme ;
#   4. génère /srv/recipelog/.env (mot de passe PostgreSQL, jeton du tunnel…) ;
#   5. démarre Traefik, PostgreSQL, l'accès Docker limité et le tunnel ;
#   6. crée le client de test « test » (test.recipelog.cc).
#
# Sans questions : RECIPELOG_NONINTERACTIVE=1, ou un fichier /root/plateforme.env
# (écrit par creer-vm.sh) avec les mêmes variables :
#   CF_TUNNEL_TOKEN    jeton du tunnel Cloudflare de la plateforme (facultatif)
#   ADMIN_EMAILS       ton adresse (administrateur caché des clients)
#   DOMAINE            défaut : recipelog.cc
#   RECIPELOG_BRANCH   branche du dépôt pour les fichiers de la plateforme (défaut : main)
#   CREER_TEST         1 = créer le client « test » (défaut : 1)
# Relancer le script est sans danger : il garde le .env et les clients existants.
# ============================================================
set -euo pipefail

REPO="${RECIPELOG_REPO:-https://github.com/SuperNon0/recipelogs.git}"
APP_DIR=/opt/recipelog-plateforme
DONNEES=/srv/recipelog
RESUME=/root/recipelog-plateforme.txt

die() { echo "❌ $*" >&2; exit 1; }
info() { echo "==> $*"; }

[ "$(id -u)" -eq 0 ] || die "À lancer en root."
. /etc/os-release
[ "${ID}" = debian ] || die "Prévu pour Debian (trouvé : ${ID})."

# shellcheck disable=SC1091
[ -r /root/plateforme.env ] && { set -a; . /root/plateforme.env; set +a; RECIPELOG_NONINTERACTIVE=1; }
ASK=1
[ "${RECIPELOG_NONINTERACTIVE:-0}" = 1 ] && ASK=0
[ -r /dev/tty ] || ASK=0

ask() { # ask <variable> <question> <défaut>
  local __var="$1" __q="$2" __def="$3" __ans=""
  if [ -n "${!__var:-}" ]; then return; fi
  if [ "${ASK}" = 1 ]; then
    read -r -p "${__q} [${__def}] : " __ans < /dev/tty || true
  fi
  printf -v "${__var}" '%s' "${__ans:-${__def}}"
}

# ------------------------------------------------------------ 1. Docker
info "Paquets de base…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git openssl nftables qemu-guest-agent >/dev/null
systemctl enable --now qemu-guest-agent >/dev/null 2>&1 || true

if ! command -v docker >/dev/null 2>&1; then
  info "Installation de Docker…"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
# Journaux des conteneurs limités en taille.
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
JSON
  systemctl restart docker
fi
systemctl enable --now docker >/dev/null

# ------------------------------------------------------------ 2. Pare-feu
# Entrées : rien, sauf SSH depuis le réseau local et les réponses aux
# connexions sortantes. Docker gère seul ses propres règles (réseau interne
# des conteneurs) ; Traefik n'écoute que sur 127.0.0.1.
info "Pare-feu (aucun port entrant sauf SSH local)…"
cat > /etc/nftables.conf <<'NFT'
#!/usr/sbin/nft -f
# Pare-feu de la plateforme RecipeLog (écrit par install.sh).
table inet recipelog_filtre
delete table inet recipelog_filtre
table inet recipelog_filtre {
  chain entree {
    type filter hook input priority 0; policy drop;
    iif lo accept
    ct state established,related accept
    ct state invalid drop
    meta l4proto { icmp, ipv6-icmp } accept
    ip saddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 } tcp dport 22 accept
  }
}
NFT
systemctl enable nftables >/dev/null 2>&1
nft -f /etc/nftables.conf

# ------------------------------------------------------------ 3. Fichiers
ask RECIPELOG_BRANCH "Branche du dépôt" "main"
info "Fichiers de la plateforme (${RECIPELOG_BRANCH}) dans ${APP_DIR}…"
if [ -d "${APP_DIR}/.git" ]; then
  git -C "${APP_DIR}" fetch -q --depth 1 origin "${RECIPELOG_BRANCH}"
  git -C "${APP_DIR}" reset -q --hard FETCH_HEAD
else
  git clone -q --depth 1 --branch "${RECIPELOG_BRANCH}" "${REPO}" "${APP_DIR}"
fi
ln -sf "${APP_DIR}/plateforme/bin/recipelog-instance" /usr/local/sbin/recipelog-instance
cat > /usr/local/sbin/recipelog-plateforme <<EOF
#!/bin/sh
# Raccourci : recipelog-plateforme ps | logs traefik | up -d | pull …
exec docker compose --project-directory ${APP_DIR}/plateforme --env-file ${DONNEES}/.env "\$@"
EOF
chmod 755 /usr/local/sbin/recipelog-plateforme

# ------------------------------------------------------------ 4. Réglages
mkdir -p "${DONNEES}/instances" "${DONNEES}/archives"
chmod 700 "${DONNEES}"
if [ ! -f "${DONNEES}/.env" ]; then
  ask DOMAINE "Nom de domaine" "recipelog.cc"
  ask ADMIN_EMAILS "Ton adresse email (administrateur caché des clients)" ""
  ask CF_TUNNEL_TOKEN "Jeton du tunnel Cloudflare de la plateforme (Entrée = plus tard)" ""
  umask 077
  cat > "${DONNEES}/.env" <<EOF
# Réglages de la plateforme RecipeLog (écrit par install.sh le $(date +%F)).
DOMAINE=${DOMAINE}
DONNEES=${DONNEES}
IMAGE=ghcr.io/supernon0/recipelog
CANAL_DEFAUT=stable
ADMIN_EMAILS=${ADMIN_EMAILS}
POSTGRES_PASSWORD=$(openssl rand -hex 32)
CF_TUNNEL_TOKEN=${CF_TUNNEL_TOKEN}
COMPOSE_PROFILES=$([ -n "${CF_TUNNEL_TOKEN}" ] && echo tunnel)
EOF
  umask 022
  info "Réglages écrits dans ${DONNEES}/.env"
else
  info "Réglages existants gardés (${DONNEES}/.env)."
fi
# shellcheck disable=SC1091
set -a; . "${DONNEES}/.env"; set +a

# ------------------------------------------------------------ 5. Démarrage
info "Démarrage de Traefik, PostgreSQL et du tunnel…"
recipelog-plateforme pull -q
recipelog-plateforme up -d --wait

# ------------------------------------------------------------ 6. Client de test
CREER_TEST="${CREER_TEST:-1}"
if [ "${CREER_TEST}" = 1 ] && [ ! -d "${DONNEES}/instances/test" ]; then
  info "Client de test « test »…"
  recipelog-instance creer test --canal beta || echo "⚠️  Le client de test n'a pas démarré ; la plateforme, elle, tourne. Voir : recipelog-instance journaux test"
fi

IP="$(hostname -I | awk '{print $1}')"
cat > "${RESUME}" <<EOF
Plateforme RecipeLog installée le $(date '+%F %H:%M').

Machine            : ${IP}
Fichiers           : ${APP_DIR} (dépôt, branche ${RECIPELOG_BRANCH})
Données et réglages: ${DONNEES}  (.env, postgres/, instances/, archives/)
Tunnel Cloudflare  : $([ -n "${CF_TUNNEL_TOKEN}" ] && echo "branché" || echo "PAS ENCORE : ajouter CF_TUNNEL_TOKEN et COMPOSE_PROFILES=tunnel dans ${DONNEES}/.env, puis recipelog-plateforme up -d")

Commandes :
  recipelog-instance liste                 les clients
  recipelog-instance creer <nom>           un nouveau client sur <nom>.${DOMAINE}
  recipelog-instance mettre-a-jour --tous  tous les clients, l'un après l'autre
  recipelog-plateforme ps                  état de Traefik, PostgreSQL, tunnel
  curl -H 'Host: test.${DOMAINE}' http://127.0.0.1:8080/api/health   test local
EOF
echo
cat "${RESUME}"
info "✅ Terminé. Ce résumé est aussi dans ${RESUME}."

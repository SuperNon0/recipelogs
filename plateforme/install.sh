#!/usr/bin/env bash
# ============================================================
# install.sh — prépare une machine Debian 12 vierge pour la plateforme
# RecipeLog, en root, dans la VM :
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/plateforme/plateforme/install.sh)"
#
# (creer-vm.sh, lancé sur l'hôte Proxmox, crée la VM et lance ce script tout seul.)
#
# Ce que ça fait :
#   1. installe Docker (dépôt officiel) ;
#   2. pare-feu : AUCUN port entrant, sauf SSH depuis le réseau local ;
#   3. récupère la plateforme dans /opt/recipelog-plateforme ;
#   4. génère /srv/recipelog/.env (mot de passe PostgreSQL, jeton du tunnel…) ;
#   5. démarre Traefik, PostgreSQL, l'accès Docker limité, le tunnel,
#      Authentik (auth.<domaine>, la connexion) et la passerelle, puis te rend
#      super-admin dans Authentik (email « Choisis ton mot de passe ») ;
#   6. crée le client de test « test » (test.recipelog.cc).
#
# Sans questions : RECIPELOG_NONINTERACTIVE=1, ou un fichier /root/plateforme.env
# (écrit par creer-vm.sh) avec les mêmes variables :
#   CF_TUNNEL_TOKEN    jeton du tunnel Cloudflare de la plateforme (facultatif)
#   ADMIN_EMAILS       ton adresse (administrateur caché des clients)
#   DOMAINE            défaut : recipelog.cc
#   RECIPELOG_BRANCH   branche du dépôt pour les fichiers de la plateforme (défaut : plateforme)
#   CREER_TEST         1 = créer le client « test » (défaut : 1)
#   SMTP_HOTE, SMTP_PORT, SMTP_UTILISATEUR, SMTP_MOT_DE_PASSE, SMTP_EXPEDITEUR
#                      serveur d'envoi des emails (invitations, mot de passe
#                      oublié). Par exemple Brevo : smtp-relay.brevo.com, 587.
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
ask RECIPELOG_BRANCH "Branche du dépôt" "plateforme"
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

# Réglages ajoutés par le lot 1 (Authentik) : ajoutés s'ils manquent, même
# sur une plateforme déjà installée. Les valeurs déjà présentes ne bougent pas.
ajouter() { # ajouter <CLE> <valeur>
  grep -q "^$1=" "${DONNEES}/.env" && return 0
  # Entre apostrophes : lu tel quel par bash et par docker compose.
  umask 077; printf "%s='%s'\n" "$1" "${2//\'/}" >> "${DONNEES}/.env"; umask 022
  printf -v "$1" '%s' "$2"; export "${1?}"
}
if ! grep -q '^AUTHENTIK_SECRET_KEY=' "${DONNEES}/.env"; then
  printf '\n# Connexion (Authentik), ajouté le %s.\n' "$(date +%F)" >> "${DONNEES}/.env"
  ask SMTP_HOTE "Serveur d'envoi des emails (ex. smtp-relay.brevo.com ; Entrée = plus tard)" ""
  if [ -n "${SMTP_HOTE}" ]; then
    ask SMTP_PORT "Port du serveur d'emails" "587"
    ask SMTP_UTILISATEUR "Identifiant du serveur d'emails" ""
    ask SMTP_MOT_DE_PASSE "Mot de passe (ou clé) du serveur d'emails" ""
    ask SMTP_EXPEDITEUR "Expéditeur des emails" "RecipeLog <noreply@${DOMAINE}>"
  fi
fi
ajouter AUTHENTIK_SECRET_KEY "$(openssl rand -hex 50)"
ajouter AUTHENTIK_DB_PASSWORD "$(openssl rand -hex 32)"
# Compte de secours d'Authentik (akadmin). Volontairement PAS ton adresse :
# ton compte à toi est créé à part, dans le groupe super-admins.
ajouter AUTHENTIK_BOOTSTRAP_EMAIL "secours@${DOMAINE}"
ajouter AUTHENTIK_BOOTSTRAP_PASSWORD "$(openssl rand -base64 24 | tr -d '/+=')"
ajouter AUTHENTIK_BOOTSTRAP_TOKEN "$(openssl rand -hex 48)"
ajouter SMTP_HOTE "${SMTP_HOTE:-}"
ajouter SMTP_PORT "${SMTP_PORT:-587}"
ajouter SMTP_UTILISATEUR "${SMTP_UTILISATEUR:-}"
ajouter SMTP_MOT_DE_PASSE "${SMTP_MOT_DE_PASSE:-}"
ajouter SMTP_TLS "true"
ajouter SMTP_EXPEDITEUR "${SMTP_EXPEDITEUR:-RecipeLog <noreply@${DOMAINE}>}"

# ------------------------------------------------------------ 5. Démarrage
info "Démarrage de PostgreSQL…"
recipelog-plateforme pull -q --ignore-buildable
recipelog-plateforme up -d --wait postgres
# Base d'Authentik (créée une fois ; son mot de passe est remis à chaque passage).
docker exec -i recipelog-postgres psql -v ON_ERROR_STOP=1 -q -U postgres <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authentik') THEN
    CREATE ROLE authentik LOGIN;
  END IF;
END \$\$;
ALTER ROLE authentik PASSWORD '${AUTHENTIK_DB_PASSWORD}';
SQL
docker exec recipelog-postgres psql -tA -U postgres -c "SELECT 1 FROM pg_database WHERE datname = 'authentik'" | grep -q 1 \
  || docker exec recipelog-postgres psql -q -U postgres -c "CREATE DATABASE authentik OWNER authentik"
docker exec recipelog-postgres psql -q -U postgres -c "REVOKE ALL ON DATABASE authentik FROM PUBLIC"
mkdir -p "${DONNEES}/authentik/media"
chown -R 1000:1000 "${DONNEES}/authentik" # utilisateur d'Authentik dans son image

info "Démarrage de Traefik, du tunnel, d'Authentik et de la passerelle…"
recipelog-plateforme up -d --build --wait
info "Attente d'Authentik (2 à 5 minutes au premier démarrage)…"
docker exec recipelog-passerelle node cli.mjs attendre >/dev/null || die "Authentik ne démarre pas : recipelog-plateforme logs authentik"
if [ -n "${ADMIN_EMAILS}" ]; then
  info "Ton compte super-admin dans Authentik…"
  docker exec recipelog-passerelle node cli.mjs initialiser "${ADMIN_EMAILS}" >/dev/null \
    || echo "⚠️  Compte super-admin non créé. À relancer : docker exec recipelog-passerelle node cli.mjs initialiser"
fi

# ------------------------------------------------------------ 6. Client de test
CREER_TEST="${CREER_TEST:-1}"
if [ "${CREER_TEST}" = 1 ] && [ ! -d "${DONNEES}/instances/test" ]; then
  info "Client de test « test »…"
  recipelog-instance creer test --canal plateforme || echo "⚠️  Le client de test n'a pas démarré ; la plateforme, elle, tourne. Voir : recipelog-instance journaux test"
fi

IP="$(hostname -I | awk '{print $1}')"
cat > "${RESUME}" <<EOF
Plateforme RecipeLog installée le $(date '+%F %H:%M').

Machine            : ${IP}
Fichiers           : ${APP_DIR} (dépôt, branche ${RECIPELOG_BRANCH})
Données et réglages: ${DONNEES}  (.env, postgres/, instances/, archives/)
Tunnel Cloudflare  : $([ -n "${CF_TUNNEL_TOKEN}" ] && echo "branché" || echo "PAS ENCORE : ajouter CF_TUNNEL_TOKEN et COMPOSE_PROFILES=tunnel dans ${DONNEES}/.env, puis recipelog-plateforme up -d")
Connexion          : https://auth.${DOMAINE} (Authentik)
  Ton compte       : ${ADMIN_EMAILS:-aucun} (email « Choisis ton mot de passe » envoyé)
  Compte de secours: akadmin, mot de passe AUTHENTIK_BOOTSTRAP_PASSWORD dans ${DONNEES}/.env
Emails             : $([ -n "${SMTP_HOTE}" ] && echo "${SMTP_HOTE}" || echo "PAS ENCORE : remplir SMTP_* dans ${DONNEES}/.env, puis recipelog-plateforme up -d (sans ça : ni invitation, ni mot de passe oublié)")

Commandes :
  recipelog-instance liste                 les clients
  recipelog-instance creer <nom> --responsable <email> --max 10
                                           un nouveau client sur <nom>.${DOMAINE}
  recipelog-instance equipe <nom>          les comptes d'un client
  recipelog-instance mettre-a-jour --tous  tous les clients, l'un après l'autre
  recipelog-plateforme ps                  état de Traefik, PostgreSQL, tunnel
  curl -H 'Host: test.${DOMAINE}' http://127.0.0.1:8080/api/health   test local
EOF
echo
cat "${RESUME}"
info "✅ Terminé. Ce résumé est aussi dans ${RESUME}."

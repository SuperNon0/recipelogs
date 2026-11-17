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
#   2. pare-feu : AUCUN port entrant, sauf SSH depuis le réseau local ; heure de Paris,
#      4 Go d'échange (swap) et mises à jour de sécurité de Debian automatiques ;
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
#   CREER_TEST         1 = créer le client « test » à la première installation (défaut : 1 ;
#                      jamais recréé ensuite)
#   SMTP_HOTE, SMTP_PORT, SMTP_UTILISATEUR, SMTP_MOT_DE_PASSE, SMTP_EXPEDITEUR
#                      serveur d'envoi des emails (invitations, mot de passe
#                      oublié). Par exemple Brevo : smtp-relay.brevo.com, 587.
# Relancer le script est sans danger : il garde le .env et les clients existants.
# Après avoir changé un réglage dans /srv/recipelog/.env : recipelog-plateforme appliquer
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
apt-get install -y -qq ca-certificates curl git openssl nftables qemu-guest-agent rsync unattended-upgrades >/dev/null
systemctl enable --now qemu-guest-agent >/dev/null 2>&1 || true

# Heure de Paris : les journaux et les sauvegardes de la nuit sont à la même heure que toi.
timedatectl set-timezone "${TZ:-Europe/Paris}" 2>/dev/null || true
# Mises à jour de sécurité de Debian, toutes seules chaque jour (Docker n'est pas touché).
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
# Mémoire d'échange : un pic de mémoire (mise à jour de plusieurs clients, Authentik qui
# démarre) ralentit la machine au lieu de tuer un conteneur au hasard.
if [ -z "$(swapon --noheadings 2>/dev/null)" ] && [ ! -e /swapfile ]; then
  info "Mémoire d'échange (4 Go)…"
  if fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo 'vm.swappiness=10' > /etc/sysctl.d/90-recipelog.conf
    sysctl -q -p /etc/sysctl.d/90-recipelog.conf || true
  else
    rm -f /swapfile
    echo "⚠️  Mémoire d'échange non créée (pas grave, la plateforme marche sans)."
  fi
fi

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
# Entrées : rien, sauf SSH depuis le réseau local (192.168.x.x ou 10.x.x.x ; PAS
# 172.16-31.x.x, qui sont les adresses des conteneurs Docker : un site piraté ne doit
# pas pouvoir tenter le SSH de la machine) et les réponses aux connexions sortantes. Docker gère seul ses propres règles (réseau interne
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
    ip saddr { 10.0.0.0/8, 192.168.0.0/16 } tcp dport 22 accept
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
#!/bin/bash
# Raccourci : recipelog-plateforme ps | logs traefik | up -d | pull …
#   recipelog-plateforme appliquer   après avoir changé un réglage dans ${DONNEES}/.env
#     (emails, tunnel, alertes…) : relance ce qu'il faut, remet les réglages de la
#     vitrine et renvoie ton invitation si tu ne t'es encore jamais connecté.
compose() { docker compose --project-directory ${APP_DIR}/plateforme --env-file ${DONNEES}/.env "\$@"; }
if [ "\${1:-}" = appliquer ]; then
  set -a; . ${DONNEES}/.env; set +a
  echo "==> Redémarrage des services dont les réglages ont changé…"
  compose up -d --build --wait --wait-timeout 600 || echo "⚠️  Un service met du temps à démarrer : recipelog-plateforme ps"
  echo "==> Attente de la connexion (Authentik)…"
  docker exec recipelog-passerelle node cli.mjs attendre >/dev/null || { echo "❌ Authentik ne répond pas : recipelog-plateforme logs authentik" >&2; exit 1; }
  recipelog-instance vitrine reglages >/dev/null || true
  docker exec recipelog-passerelle node cli.mjs connexion >/dev/null || echo "⚠️  Page de connexion pas encore prête : relance recipelog-plateforme appliquer dans 2 minutes."
  if [ -n "\${ADMIN_EMAILS:-}" ]; then
    docker exec recipelog-passerelle node cli.mjs initialiser "\${ADMIN_EMAILS}" || echo "⚠️  Compte super-admin non vérifié."
  fi
  echo "✅ Réglages appliqués."
  exit 0
fi
compose "\$@"
EOF
chmod 755 /usr/local/sbin/recipelog-plateforme

# ------------------------------------------------------------ 4. Réglages
mkdir -p "${DONNEES}/instances" "${DONNEES}/archives"
chmod 700 "${DONNEES}"
PREMIERE_INSTALLATION=0
if [ ! -f "${DONNEES}/.env" ]; then
  PREMIERE_INSTALLATION=1
  ask DOMAINE "Nom de domaine" "recipelog.cc"
  ask ADMIN_EMAILS "Ton adresse email (administrateur caché des clients)" ""
  ask CF_TUNNEL_TOKEN "Jeton du tunnel Cloudflare de la plateforme (Entrée = plus tard)" ""
  [[ "${DOMAINE}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || die "Nom de domaine invalide : ${DOMAINE}"
  case "${ADMIN_EMAILS}${CF_TUNNEL_TOKEN}" in
    *[\'\"\$\`\\]*) die "L'adresse email ou le jeton du tunnel contient un caractère interdit (guillemet, apostrophe, dollar ou barre oblique inversée)." ;;
  esac
  CF_TUNNEL_TOKEN="${CF_TUNNEL_TOKEN//[[:space:]]/}" # un copier-coller ajoute souvent un espace ou un retour à la ligne
  umask 077
  # Valeurs entre apostrophes : lues telles quelles par bash et par docker compose.
  cat > "${DONNEES}/.env" <<EOF
# Réglages de la plateforme RecipeLog (écrit par install.sh le $(date +%F)).
# Après un changement ici : recipelog-plateforme appliquer
DOMAINE='${DOMAINE}'
DONNEES='${DONNEES}'
IMAGE='ghcr.io/supernon0/recipelog'
# Version donnée aux nouveaux clients. Seule « plateforme » existe pour l'instant.
CANAL_DEFAUT='plateforme'
ADMIN_EMAILS='${ADMIN_EMAILS}'
POSTGRES_PASSWORD='$(openssl rand -hex 32)'
CF_TUNNEL_TOKEN='${CF_TUNNEL_TOKEN}'
COMPOSE_PROFILES='$([ -n "${CF_TUNNEL_TOKEN}" ] && echo tunnel)'
EOF
  umask 022
  info "Réglages écrits dans ${DONNEES}/.env"
else
  info "Réglages existants gardés (${DONNEES}/.env)."
  # Les versions « stable » et « beta » n'existent pas encore : une plateforme installée
  # avant cette correction créait des clients qui ne démarraient pas.
  if grep -qE "^CANAL_DEFAUT='?stable'?$" "${DONNEES}/.env"; then
    sed -i -E "s/^CANAL_DEFAUT='?stable'?$/CANAL_DEFAUT='plateforme'/" "${DONNEES}/.env"
    info "Version par défaut des nouveaux clients : « plateforme » (« stable » n'existe pas encore)."
  fi
fi
# shellcheck disable=SC1091
set -a; . "${DONNEES}/.env"; set +a

# Réglages ajoutés par le lot 1 (Authentik) : ajoutés s'ils manquent, même
# sur une plateforme déjà installée. Les valeurs déjà présentes ne bougent pas.
ajouter() { # ajouter <CLE> <valeur>
  grep -q "^$1=" "${DONNEES}/.env" && return 0
  # Entre apostrophes : lu tel quel par bash et par docker compose. Une apostrophe dans
  # la valeur casserait le fichier : on refuse clairement au lieu de l'enlever en silence
  # (un mot de passe d'emails amputé d'un caractère ne marcherait jamais).
  case "$2" in *\'*) die "La valeur de $1 contient une apostrophe ('), ce qui n'est pas possible ici. Choisis une autre clé ou un autre mot de passe." ;; esac
  umask 077; printf "%s='%s'\n" "$1" "$2" >> "${DONNEES}/.env"; umask 022
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
# Lot 2 : panel admin.
ajouter MOTEUR_CLE "$(openssl rand -hex 32)"
ajouter PANEL_SESSION_SECRET "$(openssl rand -hex 32)"
ajouter DOMAINE_REGEX "${DOMAINE//./\\.}"
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
mkdir -p "${DONNEES}/support"
chown 1000:1000 "${DONNEES}/support" # demandes « Signaler un problème » (passerelle : utilisateur 1000)
mkdir -p "${DONNEES}/annonces" # maintenance et bandeaux (lot 6), écrits par le moteur
mkdir -p "${DONNEES}/ia/usage"
chown -R 1000:1000 "${DONNEES}/ia" # lectures par IA (lot 7) : compteurs écrits par la passerelle

# La vitrine (lot 4) avant son démarrage : son code, ses réglages et ses messages reçus.
# Sans le code, son conteneur ne passait jamais « en forme » et l'installation s'arrêtait.
info "Site vitrine (branche site-vitrine)…"
( recipelog-instance vitrine maj ) || { recipelog-instance vitrine reglages >/dev/null; echo "⚠️  Vitrine non téléchargée. À relancer : recipelog-instance vitrine maj"; }

info "Démarrage de Traefik, du tunnel, d'Authentik et de la passerelle…"
# Un service lent ou en retard n'arrête pas l'installation : Authentik est attendu juste après.
recipelog-plateforme up -d --build --wait --wait-timeout 600 || echo "⚠️  Un service met du temps à démarrer (voir : recipelog-plateforme ps). L'installation continue."
info "Attente d'Authentik (2 à 5 minutes au premier démarrage)…"
docker exec recipelog-passerelle node cli.mjs attendre >/dev/null || die "Authentik ne démarre pas : recipelog-plateforme logs authentik"
info "Page de connexion RecipeLog…"
docker exec recipelog-passerelle node cli.mjs connexion >/dev/null \
  || echo "⚠️  Page de connexion pas encore prête. À relancer : bash install.sh"
if [ -n "${ADMIN_EMAILS}" ]; then
  info "Ton compte super-admin dans Authentik…"
  docker exec recipelog-passerelle node cli.mjs initialiser "${ADMIN_EMAILS}" >/dev/null \
    || echo "⚠️  Compte super-admin non créé. À relancer : recipelog-plateforme appliquer"
fi
info "Accès du panel admin (admin.${DOMAINE}) dans Authentik…"
if PANEL="$(docker exec recipelog-passerelle node cli.mjs panel-creer "https://admin.${DOMAINE}" --env)"; then
  sed -i '/^PANEL_OIDC_/d' "${DONNEES}/.env"
  umask 077; printf '%s\n' "${PANEL}" | sed "s/=\(.*\)$/='\1'/" >> "${DONNEES}/.env"; umask 022
  # shellcheck disable=SC1091
  set -a; . "${DONNEES}/.env"; set +a
  recipelog-plateforme up -d panel >/dev/null
else
  echo "⚠️  Panel non branché sur Authentik. À relancer : bash install.sh"
fi

# ------------------------------------------------------------ 6. Client de test
CREER_TEST="${CREER_TEST:-1}"
# Seulement à la toute première installation : une relance (ou une mise à jour depuis le
# panel) ne recrée jamais un client « test » que tu as supprimé.
[ "${PREMIERE_INSTALLATION}" = 1 ] || CREER_TEST=0
[ "${RECIPELOG_MAJ:-0}" = 1 ] && CREER_TEST=0
if [ "${CREER_TEST}" = 1 ] && [ ! -d "${DONNEES}/instances/test" ]; then
  info "Client de test « test »…"
  recipelog-instance creer test --canal plateforme || echo "⚠️  Le client de test n'a pas démarré ; la plateforme, elle, tourne. Voir : recipelog-instance journaux test"
fi

# Version installée, lue par le panel (Accueil → Plateforme → « Mettre à jour la plateforme »).
mkdir -p "${DONNEES}/maj-plateforme"
printf '{"commit":"%s","branche":"%s","depot":"%s","date":"%s"}\n' \
  "$(git -C "${APP_DIR}" rev-parse HEAD)" "${RECIPELOG_BRANCH}" "${REPO}" "$(date -Iseconds)" > "${DONNEES}/maj-plateforme/version.json"

IP="$(hostname -I | awk '{print $1}')"
cat > "${RESUME}" <<EOF
Plateforme RecipeLog installée le $(date '+%F %H:%M').

Machine            : ${IP}
Fichiers           : ${APP_DIR} (dépôt, branche ${RECIPELOG_BRANCH})
Données et réglages: ${DONNEES}  (.env, postgres/, instances/, archives/)
Tunnel Cloudflare  : $([ -n "${CF_TUNNEL_TOKEN}" ] && echo "branché" || echo "PAS ENCORE : remplir CF_TUNNEL_TOKEN='…' et COMPOSE_PROFILES='tunnel' dans ${DONNEES}/.env, puis recipelog-plateforme appliquer")
Panel admin        : https://admin.${DOMAINE} (super-admins seulement)
Vitrine            : https://${DOMAINE} (si l'adresse pointe sur ce tunnel : A-FAIRE.md, étape E)
Connexion          : https://auth.${DOMAINE} (Authentik)
  Ton compte       : ${ADMIN_EMAILS:-aucun} $([ -n "${SMTP_HOTE}" ] && echo "(email « Choisis ton mot de passe » envoyé : regarde aussi les indésirables)" || echo "(AUCUN email envoyé : les emails ne sont pas réglés. Règle-les, puis recipelog-plateforme appliquer : l'email partira)")
  Compte de secours: akadmin, mot de passe AUTHENTIK_BOOTSTRAP_PASSWORD dans ${DONNEES}/.env
Emails             : $([ -n "${SMTP_HOTE}" ] && echo "${SMTP_HOTE}" || echo "PAS ENCORE : remplir SMTP_* dans ${DONNEES}/.env, puis recipelog-plateforme appliquer (sans ça : ni invitation, ni mot de passe oublié)")

Commandes :
  recipelog-instance liste                 les clients
  recipelog-instance creer <nom> --responsable <email> --max 10
                                           un nouveau client sur <nom>.${DOMAINE}
  recipelog-instance equipe <nom>          les comptes d'un client
  recipelog-instance mettre-a-jour --tous  tous les clients, l'un après l'autre
  recipelog-plateforme ps                  état de Traefik, PostgreSQL, tunnel
  recipelog-plateforme appliquer           après un changement dans ${DONNEES}/.env
  curl -H 'Host: test.${DOMAINE}' http://127.0.0.1:8080/api/health   test local
EOF
echo
cat "${RESUME}"
info "✅ Terminé. Ce résumé est aussi dans ${RESUME}."

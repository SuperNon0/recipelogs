#!/usr/bin/env bash
# ============================================================
# install.sh — Un nouveau site RecipeLog en une commande, depuis le shell
# de l'hôte Proxmox (en root) :
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/stable/deploy/proxmox/install.sh)"
#
# Crée un conteneur Debian 12, y installe tout (base, site, nginx, mises à
# jour, sauvegardes) avec deploy/proxmox/setup.sh, sur la branche stable.
# Tuto complet : docs/installer-un-nouveau-site.md
#
# Questions posées (Entrée = valeur proposée). Pour ne rien demander, mettre
# RECIPELOG_NONINTERACTIVE=1 et donner les valeurs en variables :
#   RECIPELOG_VMID         numéro du conteneur        (défaut : le prochain libre)
#   RECIPELOG_HOSTNAME     nom du conteneur            (défaut : recipelog-<numéro>)
#   RECIPELOG_ADMIN_EMAILS ton adresse, administrateur caché sur le site
#   CF_TUNNEL_TOKEN        jeton du tunnel Cloudflare  (facultatif)
#   RECIPELOG_BRANCH       branche suivie              (défaut : stable)
#   RECIPELOG_STORAGE, RECIPELOG_DISK (Go, 20), RECIPELOG_MEMORY (Mo, 4096),
#   RECIPELOG_CORES (2), RECIPELOG_BRIDGE (vmbr0)
#
# À la fin, le résumé est aussi écrit dans /root/recipelog-<numéro>.txt.
# ============================================================
set -euo pipefail

RAW_BASE="${RECIPELOG_RAW_BASE:-https://raw.githubusercontent.com/SuperNon0/recipelogs}"
BRANCH="${RECIPELOG_BRANCH:-stable}"
ASK=1
[ "${RECIPELOG_NONINTERACTIVE:-0}" = 1 ] && ASK=0
[ -r /dev/tty ] || ASK=0

die() { echo "❌ $*" >&2; exit 1; }
[ "${EUID}" -eq 0 ] || die "À lancer en root dans le shell de l'hôte Proxmox."
command -v pct >/dev/null 2>&1 || die "pct introuvable : ce script se lance sur l'hôte Proxmox, pas dans un conteneur."

ask() { # ask <variable> <question> <défaut> [secret]
  local __var="$1" __q="$2" __def="$3" __secret="${4:-}" __ans=""
  if [ "${ASK}" = 1 ]; then
    if [ -n "${__secret}" ]; then
      read -r -s -p "${__q} : " __ans < /dev/tty; echo > /dev/tty
    else
      read -r -p "${__q}${__def:+ [${__def}]} : " __ans < /dev/tty
    fi
  fi
  printf -v "${__var}" '%s' "${__ans:-${__def}}"
}

echo "======================================================"
echo "  Nouveau site RecipeLog (branche ${BRANCH})"
echo "======================================================"

NEXT_ID="$(pvesh get /cluster/nextid 2>/dev/null || echo 120)"
ask VMID "Numéro du conteneur" "${RECIPELOG_VMID:-${NEXT_ID}}"
[[ "${VMID}" =~ ^[0-9]+$ ]] || die "Numéro de conteneur invalide : ${VMID}"
pct status "${VMID}" >/dev/null 2>&1 && die "Le conteneur ${VMID} existe déjà."
ask CT_NAME "Nom du conteneur" "${RECIPELOG_HOSTNAME:-recipelog-${VMID}}"
ask ADMIN_EMAILS "Ton adresse e-mail (administrateur caché sur le site)" "${RECIPELOG_ADMIN_EMAILS:-}"
ask TUNNEL_TOKEN "Jeton du tunnel Cloudflare (Entrée pour le faire plus tard)" "${CF_TUNNEL_TOKEN:-}" secret

DISK="${RECIPELOG_DISK:-20}"
MEMORY="${RECIPELOG_MEMORY:-4096}"
CORES="${RECIPELOG_CORES:-2}"
BRIDGE="${RECIPELOG_BRIDGE:-vmbr0}"
STORAGE="${RECIPELOG_STORAGE:-}"
if [ -z "${STORAGE}" ]; then
  if pvesm status -content rootdir 2>/dev/null | awk 'NR>1{print $1}' | grep -qx local-lvm; then
    STORAGE="local-lvm"
  else
    STORAGE="$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1{print $1; exit}')"
  fi
fi
[ -n "${STORAGE}" ] || die "Aucun stockage pour conteneurs trouvé (RECIPELOG_STORAGE=...)."
TPL_STORAGE="$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1{print $1; exit}')"
[ -n "${TPL_STORAGE}" ] || die "Aucun stockage pour modèles de conteneur trouvé."

# ── Modèle Debian 12 ─────────────────────────────────────
echo "==> Modèle Debian 12..."
pveam update >/dev/null 2>&1 || true
TEMPLATE="$(pveam list "${TPL_STORAGE}" 2>/dev/null | awk '{print $1}' | grep -o 'debian-12-standard_[^ ]*' | sort -V | tail -1 || true)"
if [ -z "${TEMPLATE}" ]; then
  TEMPLATE="$(pveam available --section system | awk '{print $2}' | grep '^debian-12-standard_' | sort -V | tail -1)"
  [ -n "${TEMPLATE}" ] || die "Modèle Debian 12 introuvable (pveam available)."
  pveam download "${TPL_STORAGE}" "${TEMPLATE}"
fi

# ── Conteneur ────────────────────────────────────────────
echo "==> Création du conteneur ${VMID} (${CT_NAME}, ${MEMORY} Mo, ${DISK} Go sur ${STORAGE})..."
pct create "${VMID}" "${TPL_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "${CT_NAME}" \
  --storage "${STORAGE}" \
  --rootfs "${STORAGE}:${DISK}" \
  --memory "${MEMORY}" \
  --swap 1024 \
  --cores "${CORES}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --ostype debian \
  --unprivileged 1 \
  --features "nesting=1" \
  --onboot 1 \
  --start 1

echo "==> Attente du réseau..."
for _ in $(seq 1 60); do
  pct exec "${VMID}" -- getent hosts deb.debian.org >/dev/null 2>&1 && break
  sleep 2
done
pct exec "${VMID}" -- getent hosts deb.debian.org >/dev/null 2>&1 || die "Le conteneur ${VMID} n'a pas d'accès à Internet."

# ── Installation dans le conteneur ───────────────────────
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
curl -fsSL "${RAW_BASE}/${BRANCH}/deploy/proxmox/setup.sh" -o "${TMP}/setup.sh" || die "setup.sh introuvable sur la branche ${BRANCH}."
umask 077
{
  printf 'RECIPELOG_BRANCH=%q\n' "${BRANCH}"
  printf 'RECIPELOG_ADMIN_EMAILS=%q\n' "${ADMIN_EMAILS}"
  printf 'CF_TUNNEL_TOKEN=%q\n' "${TUNNEL_TOKEN}"
} > "${TMP}/recipelog-install.env"
umask 022
pct exec "${VMID}" -- bash -c "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl ca-certificates >/dev/null"
pct push "${VMID}" "${TMP}/setup.sh" /root/setup.sh --perms 0700
pct push "${VMID}" "${TMP}/recipelog-install.env" /root/recipelog-install.env --perms 0600
pct exec "${VMID}" -- bash /root/setup.sh

IP="$(pct exec "${VMID}" -- hostname -I 2>/dev/null | awk '{print $1}')"
SUMMARY="/root/recipelog-${VMID}.txt"
cat > "${SUMMARY}" <<TXT
RecipeLog — conteneur ${VMID} (${CT_NAME}), installé le $(date '+%d/%m/%Y %H:%M')
Adresse locale du conteneur : ${IP:-inconnue} (le site n'écoute qu'à l'intérieur, pour le tunnel)
Branche suivie : ${BRANCH}
Administrateur caché : ${ADMIN_EMAILS:-aucun}
Tunnel Cloudflare : $([ -n "${TUNNEL_TOKEN}" ] && echo "installé" || echo "à installer : pct exec ${VMID} -- cloudflared service install <JETON>")
Pas de mot de passe : on entre par l'adresse Cloudflare du site, avec le code reçu par e-mail.
Entrer dans le conteneur : pct enter ${VMID}
TXT
chmod 600 "${SUMMARY}"
echo ""
cat "${SUMMARY}"
echo ""
echo "Résumé gardé dans ${SUMMARY}. Suite : docs/installer-un-nouveau-site.md (Cloudflare)."

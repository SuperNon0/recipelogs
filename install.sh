#!/usr/bin/env bash
# ============================================================
# install.sh — Site vitrine RecipeLog + démo, en une ligne, dans UN conteneur.
# À lancer dans le shell de l'hôte Proxmox (en root) :
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/install.sh)"
#
# Crée un seul conteneur LXC (pas de machine virtuelle), « recipelog-vitrine », avec :
#   - la démo : un RecipeLog classique (branche stable) en mode démo, remis à zéro
#     chaque nuit, sur http://localhost:80 dans le conteneur ;
#   - le site vitrine (branche site-vitrine), sur http://localhost:8080 ;
#   - un seul tunnel Cloudflare pour les deux adresses.
# La vitrine est reliée toute seule à la démo : https://<domaine> et https://demo.<domaine>.
#
# Réglages facultatifs (variables d'environnement, sinon questions) :
#   VITRINE_DOMAINE         domaine du site vitrine (ex. recipelog.fr)
#   VITRINE_CONTACT         e-mail des demandes de démo et de devis
#   VITRINE_TUNNEL_TOKEN    jeton du tunnel Cloudflare
#   VITRINE_NONINTERACTIVE  1 = aucune question
#   VITRINE_VMID, VITRINE_STORAGE, VITRINE_BRIDGE (vmbr0)
#   DEMO_BRANCH             branche de RecipeLog pour la démo (stable)
# ============================================================
set -euo pipefail

REPO="SuperNon0/recipelogs"
VITRINE_BRANCH="${VITRINE_BRANCH:-site-vitrine}"
RAW="${VITRINE_RAW_BASE:-https://raw.githubusercontent.com/${REPO}/${VITRINE_BRANCH}}"
DEMO_BRANCH="${DEMO_BRANCH:-stable}"
CT_NAME="recipelog-vitrine"

say()  { printf '\n\033[1;33m==>\033[0m %s\n' "$*"; }
ok()   { printf '    \033[1;32m✓\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31mErreur :\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "lance cette commande en root, dans le shell de l'hôte Proxmox."
command -v pct >/dev/null || die "pct introuvable : cette commande se lance sur l'hôte Proxmox, pas dans un conteneur."

ask() { # ask VAR "question" "défaut"
  local var="$1" q="$2" def="${3:-}" ans=""
  if [ -n "${!var:-}" ]; then return; fi
  if [ "${VITRINE_NONINTERACTIVE:-0}" != 1 ] && [ -r /dev/tty ]; then
    read -r -p "    ${q} " ans </dev/tty || true
  fi
  printf -v "$var" '%s' "${ans:-$def}"
}

echo "======================================================"
echo "  RecipeLog — site vitrine + démo (un conteneur LXC)"
echo "======================================================"
echo "  Appuie sur Entrée pour passer une question : tout se règle aussi plus tard."
ask VITRINE_DOMAINE "Domaine du site vitrine, sans https (ex. recipelog.fr) :" ""
VITRINE_DOMAINE="${VITRINE_DOMAINE#http://}"; VITRINE_DOMAINE="${VITRINE_DOMAINE#https://}"
VITRINE_DOMAINE="${VITRINE_DOMAINE#www.}"; VITRINE_DOMAINE="${VITRINE_DOMAINE%%/*}"
ask VITRINE_CONTACT "E-mail de contact affiché sur la vitrine (demandes de démo et de devis) :" ""
ask VITRINE_TUNNEL_TOKEN "Jeton du tunnel Cloudflare (vide = plus tard) :" ""

DEMO_URL=""
[ -n "$VITRINE_DOMAINE" ] && DEMO_URL="https://demo.${VITRINE_DOMAINE}"

VMID="${VITRINE_VMID:-$(pvesh get /cluster/nextid)}"
pct status "$VMID" >/dev/null 2>&1 && die "le numéro $VMID est déjà pris (règle VITRINE_VMID)."

# ── 1. RecipeLog (la démo), avec l'installateur officiel de la branche stable ──
say "Installation de RecipeLog (branche ${DEMO_BRANCH}) dans le conteneur ${VMID}…"
RL_INSTALL="$(mktemp)"
curl -fsSL "https://raw.githubusercontent.com/${REPO}/${DEMO_BRANCH}/deploy/proxmox/install.sh" -o "$RL_INSTALL" \
  || die "installateur RecipeLog introuvable sur la branche ${DEMO_BRANCH}."
RECIPELOG_NONINTERACTIVE=1 \
RECIPELOG_VMID="$VMID" \
RECIPELOG_HOSTNAME="$CT_NAME" \
RECIPELOG_BRANCH="$DEMO_BRANCH" \
RECIPELOG_STORAGE="${VITRINE_STORAGE:-}" \
RECIPELOG_BRIDGE="${VITRINE_BRIDGE:-vmbr0}" \
CF_TUNNEL_TOKEN="${VITRINE_TUNNEL_TOKEN:-}" \
  bash "$RL_INSTALL"
rm -f "$RL_INSTALL"

push_run() { # push_run script.sh VAR=valeur…
  local script="$1"; shift
  local tmp; tmp="$(mktemp)"
  curl -fsSL "${RAW}/scripts/${script}" -o "$tmp"
  pct push "$VMID" "$tmp" "/root/${script}"
  rm -f "$tmp"
  pct exec "$VMID" -- env "$@" bash "/root/${script}"
}

# ── 2. Mode démo et remise à zéro chaque nuit ──
say "Mode démonstration et remise à zéro chaque nuit…"
push_run demo-setup.sh VITRINE_RAW_BASE="$RAW"

# ── 3. Site vitrine, relié à la démo ──
say "Site vitrine…"
push_run vitrine-setup.sh \
  VITRINE_BRANCH="$VITRINE_BRANCH" \
  VITRINE_PORT=8080 \
  VITRINE_DEMO_URL="$DEMO_URL" \
  VITRINE_CONTACT="${VITRINE_CONTACT:-}"

IP="$(pct exec "$VMID" -- hostname -I | awk '{print $1}')"

# ── Résumé ────────────────────────────────────────────────
SUMMARY="/root/recipelog-vitrine.txt"
D="${VITRINE_DOMAINE:-ton-domaine.fr}"
{
  echo "RecipeLog — site vitrine + démo (installé le $(date '+%d/%m/%Y %H:%M'))"
  echo ""
  echo "Conteneur ${VMID} (${CT_NAME}) — adresse locale ${IP}"
  echo "  Vitrine : http://${IP}:8080"
  echo "  Démo    : RecipeLog, sur localhost:80 dans le conteneur (passe par le tunnel)"
  echo ""
  echo "Cloudflare, dans le tunnel (Public Hostname) :"
  echo "  ${D}          → HTTP  localhost:8080   (vitrine)"
  echo "  www.${D}      → HTTP  localhost:8080   (vitrine)"
  echo "  demo.${D}     → HTTP  localhost:80     (démo)"
  echo "  Pas d'application Access sur ce domaine : les deux sites sont publics."
  echo ""
  echo "Vitrine reliée à la démo : ${DEMO_URL:-(pas encore : pct exec ${VMID} -- vitrine-reglage demo https://demo.${D})}"
  echo "E-mail de contact : ${VITRINE_CONTACT:-(pas encore : pct exec ${VMID} -- vitrine-reglage contact contact@${D})}"
  echo ""
  echo "Mettre tes recettes de démo, puis les figer (elles reviennent chaque nuit) :"
  echo "  pct exec ${VMID} -- recipelog-demo-figer"
  echo ""
  echo "Mettre à jour (shell Proxmox) :"
  echo "  la vitrine : bash -c \"\$(curl -fsSL ${RAW}/mise-a-jour.sh)\""
  echo "  la démo    : bash -c \"\$(curl -fsSL ${RAW}/mise-a-jour.sh)\" _ --demo-seulement"
  echo "  les deux   : bash -c \"\$(curl -fsSL ${RAW}/mise-a-jour.sh)\" _ --demo"
  [ -f "/root/recipelog-${VMID}.txt" ] && echo "" && echo "Détails de RecipeLog : /root/recipelog-${VMID}.txt"
} > "$SUMMARY"

echo ""
echo "======================================================"
echo "  Terminé !"
echo "======================================================"
cat "$SUMMARY"
echo ""
echo "  (Ce résumé est gardé dans ${SUMMARY})"

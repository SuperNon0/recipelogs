#!/usr/bin/env bash
# ============================================================
# install.sh — Site vitrine RecipeLog + démo, en une ligne.
# À lancer dans le shell de l'hôte Proxmox (en root) :
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/install.sh)"
#
# Crée deux conteneurs LXC (pas de machine virtuelle) :
#   1. recipelog-vitrine : le site vitrine (nginx, très léger) ;
#   2. recipelog-demo    : un RecipeLog classique (branche stable) en mode démo,
#                          remis à zéro chaque nuit.
#
# Réglages facultatifs (variables d'environnement, sinon questions) :
#   VITRINE_DEMO_URL        adresse publique de la démo (https://demo.mon-site.fr)
#   VITRINE_TUNNEL_TOKEN    jeton du tunnel Cloudflare de la vitrine
#   DEMO_TUNNEL_TOKEN       jeton du tunnel Cloudflare de la démo
#   VITRINE_AVEC_DEMO       1 (défaut) ou 0 pour ne pas installer la démo
#   VITRINE_NONINTERACTIVE  1 = aucune question
#   VITRINE_VMID / DEMO_VMID, VITRINE_STORAGE, VITRINE_BRIDGE (vmbr0)
#   DEMO_BRANCH             branche de RecipeLog pour la démo (stable)
#   VITRINE_SEULEMENT_DEMO  1 = n'installe que la démo (vitrine déjà en place)
# ============================================================
set -euo pipefail

REPO="SuperNon0/recipelogs"
VITRINE_BRANCH="${VITRINE_BRANCH:-site-vitrine}"
RAW="${VITRINE_RAW_BASE:-https://raw.githubusercontent.com/${REPO}/${VITRINE_BRANCH}}"
DEMO_BRANCH="${DEMO_BRANCH:-stable}"
BRIDGE="${VITRINE_BRIDGE:-vmbr0}"
HOST_VITRINE="recipelog-vitrine"
HOST_DEMO="recipelog-demo"

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
echo "  RecipeLog — site vitrine + démo (conteneurs LXC)"
echo "======================================================"
echo "  Appuie sur Entrée pour passer une question : tout se règle aussi plus tard."
ask VITRINE_AVEC_DEMO "Installer aussi la démo (un 2e conteneur RecipeLog) ? [O/n]" "o"
case "${VITRINE_AVEC_DEMO,,}" in n|non|0) AVEC_DEMO=0 ;; *) AVEC_DEMO=1 ;; esac
ask VITRINE_DEMO_URL "Adresse publique de la démo (ex. https://demo.mon-site.fr) :" ""
ask VITRINE_TUNNEL_TOKEN "Jeton du tunnel Cloudflare pour la VITRINE (vide = plus tard) :" ""
if [ "$AVEC_DEMO" = 1 ]; then
  ask DEMO_TUNNEL_TOKEN "Jeton du tunnel Cloudflare pour la DÉMO (vide = plus tard) :" ""
fi

# ── Stockages et modèle Debian 12 ─────────────────────────
STORAGE="${VITRINE_STORAGE:-$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $3=="active"{print $1; exit}')}"
[ -n "$STORAGE" ] || die "aucun stockage pour conteneurs trouvé (règle VITRINE_STORAGE=local-lvm)."
TSTORE="$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1 && $3=="active"{print $1; exit}')"
[ -n "$TSTORE" ] || die "aucun stockage pour modèles de conteneurs (vztmpl) trouvé."

say "Modèle Debian 12…"
pveam update >/dev/null 2>&1 || true
TEMPLATE="$(pveam available --section system 2>/dev/null | awk '/debian-12-standard/{print $2}' | sort -V | tail -1)"
[ -n "$TEMPLATE" ] || die "modèle debian-12-standard introuvable (pveam available)."
if ! pveam list "$TSTORE" | grep -q "$TEMPLATE"; then pveam download "$TSTORE" "$TEMPLATE"; fi
ok "$TEMPLATE"

wait_net() { # attend que le conteneur ait Internet
  local id="$1" i
  for i in $(seq 1 60); do
    if pct exec "$id" -- getent hosts github.com >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  die "le conteneur $id n'a pas accès à Internet (DHCP sur ${BRIDGE} ?)."
}

# ── 1. Conteneur de la vitrine ────────────────────────────
if [ "${VITRINE_SEULEMENT_DEMO:-0}" = 1 ]; then
  AVEC_DEMO=1
  VMID="${VITRINE_VMID:-$(pct list | awk 'NR>1 && $NF=="'"$HOST_VITRINE"'" {print $1; exit}')}"
  [ -n "$VMID" ] || die "conteneur ${HOST_VITRINE} introuvable (règle VITRINE_VMID)."
  IP_VITRINE="$(pct exec "$VMID" -- hostname -I | awk '{print $1}')"
  if [ -n "${VITRINE_DEMO_URL:-}" ]; then pct exec "$VMID" -- vitrine-adresse-demo "$VITRINE_DEMO_URL"; fi
else
VMID="${VITRINE_VMID:-$(pvesh get /cluster/nextid)}"
pct status "$VMID" >/dev/null 2>&1 && die "le numéro $VMID est déjà pris (règle VITRINE_VMID)."
say "Création du conteneur ${VMID} (${HOST_VITRINE})…"
pct create "$VMID" "${TSTORE}:vztmpl/${TEMPLATE}" \
  --hostname "$HOST_VITRINE" \
  --rootfs "${STORAGE}:4" \
  --memory 512 --swap 256 --cores 1 \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --ostype debian --unprivileged 1 --features nesting=1 \
  --onboot 1 --start 1 >/dev/null
wait_net "$VMID"
ok "conteneur démarré"

say "Installation du site vitrine…"
TMP="$(mktemp)"
curl -fsSL "${RAW}/scripts/vitrine-setup.sh" -o "$TMP"
pct push "$VMID" "$TMP" /root/vitrine-setup.sh
rm -f "$TMP"
pct exec "$VMID" -- env \
  VITRINE_BRANCH="$VITRINE_BRANCH" \
  VITRINE_DEMO_URL="${VITRINE_DEMO_URL:-}" \
  VITRINE_TUNNEL_TOKEN="${VITRINE_TUNNEL_TOKEN:-}" \
  bash /root/vitrine-setup.sh
IP_VITRINE="$(pct exec "$VMID" -- hostname -I | awk '{print $1}')"
ok "vitrine en ligne : http://${IP_VITRINE}"
fi

# ── 2. Conteneur de la démo (RecipeLog classique) ─────────
DEMO_ID="" ; DEMO_STATE="non installée"
if [ "$AVEC_DEMO" = 1 ]; then
  DEMO_ID="${DEMO_VMID:-$(pvesh get /cluster/nextid)}"
  say "Démo : installation de RecipeLog (branche ${DEMO_BRANCH}) dans le conteneur ${DEMO_ID}…"
  RL_INSTALL="$(mktemp)"
  if curl -fsSL "https://raw.githubusercontent.com/${REPO}/${DEMO_BRANCH}/deploy/proxmox/install.sh" -o "$RL_INSTALL"; then
    RECIPELOG_NONINTERACTIVE=1 \
    RECIPELOG_VMID="$DEMO_ID" \
    RECIPELOG_HOSTNAME="$HOST_DEMO" \
    RECIPELOG_BRANCH="$DEMO_BRANCH" \
    CF_TUNNEL_TOKEN="${DEMO_TUNNEL_TOKEN:-}" \
      bash "$RL_INSTALL"
    rm -f "$RL_INSTALL"

    say "Démo : mode démonstration et remise à zéro chaque nuit…"
    TMP="$(mktemp)"
    curl -fsSL "${RAW}/scripts/demo-setup.sh" -o "$TMP"
    pct push "$DEMO_ID" "$TMP" /root/demo-setup.sh
    rm -f "$TMP"
    pct exec "$DEMO_ID" -- env VITRINE_RAW_BASE="$RAW" bash /root/demo-setup.sh
    DEMO_STATE="installée"
  else
    rm -f "$RL_INSTALL"
    DEMO_ID=""
    DEMO_STATE="pas encore possible (l'installateur RecipeLog n'est pas sur la branche ${DEMO_BRANCH})"
    printf '    \033[1;33m!\033[0m %s\n' "La démo n'a pas été installée : ${DEMO_STATE}."
    echo "      Relance plus tard avec : VITRINE_SEULEMENT_DEMO=1 (voir le README de la branche site-vitrine)."
  fi
fi

# ── Résumé ────────────────────────────────────────────────
SUMMARY="/root/recipelog-vitrine.txt"
{
  echo "RecipeLog — site vitrine + démo (installé le $(date '+%d/%m/%Y %H:%M'))"
  echo ""
  echo "Vitrine : conteneur ${VMID} (${HOST_VITRINE}) — http://${IP_VITRINE}"
  if [ -n "$DEMO_ID" ]; then
    echo "Démo    : conteneur ${DEMO_ID} (${HOST_DEMO}) — voir /root/recipelog-${DEMO_ID}.txt"
  else
    echo "Démo    : ${DEMO_STATE}"
  fi
  echo "Adresse de la démo sur la vitrine : ${VITRINE_DEMO_URL:-(pas encore réglée)}"
  echo ""
  echo "Mettre à jour la vitrine (depuis le shell Proxmox) :"
  echo "  bash -c \"\$(curl -fsSL ${RAW}/mise-a-jour.sh)\""
  echo "Mettre à jour aussi le RecipeLog de la démo : ajoute  --demo  à la fin (bash -c \"…\" _ --demo)"
  if [ -n "$DEMO_ID" ]; then
    echo ""
    echo "Après avoir mis tes recettes de démo sur le site, fige-les (elles reviendront chaque nuit) :"
    echo "  pct exec ${DEMO_ID} -- recipelog-demo-figer"
    echo "Remettre la démo à zéro tout de suite :"
    echo "  pct exec ${DEMO_ID} -- recipelog-demo-reset"
  fi
  echo ""
  echo "Changer l'adresse de la démo affichée sur la vitrine :"
  echo "  pct exec ${VMID} -- vitrine-adresse-demo https://demo.mon-site.fr"
} > "$SUMMARY"

echo ""
echo "======================================================"
echo "  Terminé !"
echo "======================================================"
cat "$SUMMARY"
echo ""
echo "  (Ce résumé est gardé dans ${SUMMARY})"

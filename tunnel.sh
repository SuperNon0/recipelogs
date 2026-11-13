#!/usr/bin/env bash
# ============================================================
# tunnel.sh — Un petit conteneur LXC qui ne fait que le tunnel Cloudflare.
# À lancer dans le shell de l'hôte Proxmox (en root) :
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/tunnel.sh)"
#
# Le tunnel envoie chaque adresse vers l'IP locale d'un autre conteneur (réglé dans Cloudflare,
# onglet Public Hostname), par exemple la vitrine sur http://192.168.1.50:8080.
#
# Réglages facultatifs : TUNNEL_TOKEN, TUNNEL_VMID, TUNNEL_NOM (cloudflare-tunnel),
#   TUNNEL_STORAGE, TUNNEL_BRIDGE (vmbr0), TUNNEL_NONINTERACTIVE=1
# ============================================================
set -euo pipefail
die() { printf '\n\033[1;31mErreur :\033[0m %s\n' "$*" >&2; exit 1; }
say() { printf '\n\033[1;33m==>\033[0m %s\n' "$*"; }
[ "$(id -u)" = 0 ] || die "lance cette commande en root, dans le shell de l'hôte Proxmox."
command -v pct >/dev/null || die "pct introuvable : cette commande se lance sur l'hôte Proxmox."

NOM="${TUNNEL_NOM:-cloudflare-tunnel}"
BRIDGE="${TUNNEL_BRIDGE:-vmbr0}"
if [ -z "${TUNNEL_TOKEN:-}" ] && [ "${TUNNEL_NONINTERACTIVE:-0}" != 1 ] && [ -r /dev/tty ]; then
  read -r -p "    Jeton du tunnel Cloudflare (la suite après --token) : " TUNNEL_TOKEN </dev/tty || true
fi
TUNNEL_TOKEN="${TUNNEL_TOKEN## }"; TUNNEL_TOKEN="${TUNNEL_TOKEN#*--token }"
[ -n "${TUNNEL_TOKEN:-}" ] || die "il faut le jeton du tunnel (Cloudflare Zero Trust → Networks → Tunnels)."

if existant="$(pct list | awk -v h="$NOM" 'NR>1 && $NF==h {print $1; exit}')" && [ -n "$existant" ]; then
  die "un conteneur ${NOM} existe déjà (n° ${existant}). Pour changer de jeton : pct exec ${existant} -- cloudflared service install <jeton>"
fi

STORAGE="${TUNNEL_STORAGE:-}"
if [ -z "$STORAGE" ]; then
  if pvesm status -content rootdir 2>/dev/null | awk 'NR>1{print $1}' | grep -qx local-lvm; then STORAGE=local-lvm
  else STORAGE="$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1{print $1; exit}')"; fi
fi
[ -n "$STORAGE" ] || die "aucun stockage pour conteneurs trouvé (TUNNEL_STORAGE=…)."
TSTORE="$(pvesm status -content vztmpl 2>/dev/null | awk 'NR>1{print $1; exit}')"
[ -n "$TSTORE" ] || die "aucun stockage pour modèles de conteneurs trouvé."

say "Modèle Debian 12…"
pveam update >/dev/null 2>&1 || true
TEMPLATE="$(pveam available --section system 2>/dev/null | awk '/debian-12-standard/{print $2}' | sort -V | tail -1)"
[ -n "$TEMPLATE" ] || die "modèle debian-12-standard introuvable."
pveam list "$TSTORE" | grep -q "$TEMPLATE" || pveam download "$TSTORE" "$TEMPLATE"

VMID="${TUNNEL_VMID:-$(pvesh get /cluster/nextid)}"
say "Conteneur ${VMID} (${NOM})…"
pct create "$VMID" "${TSTORE}:vztmpl/${TEMPLATE}" \
  --hostname "$NOM" --rootfs "${STORAGE}:2" --memory 256 --swap 128 --cores 1 \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --ostype debian --unprivileged 1 --features nesting=1 --onboot 1 --start 1 >/dev/null
for i in $(seq 1 60); do pct exec "$VMID" -- getent hosts pkg.cloudflare.com >/dev/null 2>&1 && break; sleep 2; done

say "Installation de cloudflared…"
pct exec "$VMID" -- env TOKEN="$TUNNEL_TOKEN" bash -c '
  set -e
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null
  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -qq && apt-get install -y -qq cloudflared >/dev/null
  cloudflared service install "$TOKEN" >/dev/null 2>&1
  systemctl is-active --quiet cloudflared
'
echo ""
echo "======================================================"
echo "  Tunnel prêt : conteneur ${VMID} (${NOM})"
echo "======================================================"
echo "  Dans Cloudflare, le tunnel doit passer à « HEALTHY » d'ici une minute."
echo "  Chaque adresse (Public Hostname) pointe vers l'IP locale du conteneur voulu,"
echo "  par exemple http://<IP de recipelog-vitrine>:8080 pour la vitrine."
echo "  Pour voir les IP : pct exec <numéro> -- hostname -I"

#!/usr/bin/env bash
# ============================================================
# create-lxc.sh — Crée le container LXC RecipeLog sur Proxmox
# À exécuter sur le HOST Proxmox (pas dans le container)
#
# Usage :
#   bash create-lxc.sh [VMID] [HOSTNAME]
#   bash create-lxc.sh 120 recipelog
# ============================================================
set -euo pipefail

VMID="${1:-120}"
HOSTNAME="${2:-recipelog}"
STORAGE="local-lvm"        # Adapter selon votre Proxmox
TEMPLATE_STORAGE="local"   # Stockage des templates CT
DISK_SIZE="8"              # Go
MEMORY="1024"              # Mo
CORES="2"
BRIDGE="vmbr0"

# Template Debian 12 bookworm
TEMPLATE="debian-12-standard_12.7-1_amd64.tar.zst"
TEMPLATE_PATH="${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}"

echo "==> Téléchargement du template Debian 12 si absent..."
if ! pveam list "${TEMPLATE_STORAGE}" | grep -q "${TEMPLATE}"; then
  pveam download "${TEMPLATE_STORAGE}" "${TEMPLATE}"
fi

echo "==> Création du container LXC ${VMID} (${HOSTNAME})..."
pct create "${VMID}" "${TEMPLATE_PATH}" \
  --hostname "${HOSTNAME}" \
  --storage "${STORAGE}" \
  --rootfs "${STORAGE}:${DISK_SIZE}" \
  --memory "${MEMORY}" \
  --cores "${CORES}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --ostype debian \
  --unprivileged 1 \
  --features "nesting=1" \
  --onboot 1 \
  --start 0

echo "==> Démarrage du container..."
pct start "${VMID}"
sleep 5

echo "==> Container ${VMID} démarré."
echo "    Pour entrer : pct enter ${VMID}"
echo "    Puis lancez : bash /tmp/setup.sh"
echo ""
echo "==> Copiez setup.sh dans le container :"
echo "    pct push ${VMID} $(dirname "$0")/setup.sh /tmp/setup.sh"

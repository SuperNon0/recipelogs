#!/usr/bin/env bash
# ============================================================
# creer-vm.sh — crée la VM de la plateforme RecipeLog, depuis le shell de
# l'hôte Proxmox (en root) :
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/plateforme/plateforme/creer-vm.sh)"
#
# Une VM Debian 12 (image cloud officielle), démarrée avec cloud-init, qui
# lance toute seule plateforme/install.sh au premier démarrage.
#
# Questions posées (Entrée = valeur proposée). Pour ne rien demander :
# RECIPELOG_NONINTERACTIVE=1 et les variables :
#   VMID (prochain libre), VM_NOM (recipelog-plateforme), VM_COEURS (4),
#   VM_MEMOIRE (Mo, 12288), VM_DISQUE (Go, 100), VM_STOCKAGE (local-lvm),
#   VM_PONT (vmbr0), VM_CLE_SSH (fichier de clés publiques, défaut
#   /root/.ssh/authorized_keys de l'hôte), ADMIN_EMAILS, CF_TUNNEL_TOKEN,
#   RECIPELOG_BRANCH (plateforme)
# ============================================================
set -euo pipefail

RAW_BASE="${RECIPELOG_RAW_BASE:-https://raw.githubusercontent.com/SuperNon0/recipelogs}"
IMG_URL="https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2"
IMG="/var/lib/vz/template/iso/debian-12-genericcloud-amd64.qcow2"
SNIPPETS_STORAGE="${SNIPPETS_STORAGE:-local}"
SNIPPETS_DIR="/var/lib/vz/snippets"

die() { echo "❌ $*" >&2; exit 1; }
info() { echo "==> $*"; }

[ "$(id -u)" -eq 0 ] || die "À lancer en root sur l'hôte Proxmox."
command -v qm >/dev/null 2>&1 || die "qm introuvable : ce script se lance sur l'hôte Proxmox."

ASK=1
[ "${RECIPELOG_NONINTERACTIVE:-0}" = 1 ] && ASK=0
[ -r /dev/tty ] || ASK=0
ask() { # ask <variable> <question> <défaut> [secret]
  local __var="$1" __q="$2" __def="$3" __secret="${4:-}" __ans=""
  if [ -n "${!__var:-}" ]; then return; fi
  if [ "${ASK}" = 1 ]; then
    if [ -n "${__secret}" ]; then
      read -r -s -p "${__q} : " __ans < /dev/tty || true; echo > /dev/tty
    else
      read -r -p "${__q} [${__def}] : " __ans < /dev/tty || true
    fi
  fi
  printf -v "${__var}" '%s' "${__ans:-${__def}}"
}

ask VMID "Numéro de la VM" "$(pvesh get /cluster/nextid)"
ask VM_NOM "Nom de la VM" "recipelog-plateforme"
ask VM_COEURS "Cœurs" "4"
ask VM_MEMOIRE "Mémoire (Mo)" "12288"
ask VM_DISQUE "Disque (Go)" "100"
ask VM_STOCKAGE "Stockage du disque" "local-lvm"
ask VM_PONT "Pont réseau" "vmbr0"
ask VM_CLE_SSH "Fichier des clés SSH autorisées" "/root/.ssh/authorized_keys"
ask ADMIN_EMAILS "Ton adresse email (administrateur caché des clients)" ""
ask CF_TUNNEL_TOKEN "Jeton du tunnel Cloudflare de la plateforme (Entrée = plus tard)" "" secret
ask RECIPELOG_BRANCH "Branche du dépôt" "plateforme"

[[ "${VMID}" =~ ^[0-9]+$ ]] || die "Numéro de VM invalide : ${VMID}"
qm status "${VMID}" >/dev/null 2>&1 && die "La VM ${VMID} existe déjà."
[ -r "${VM_CLE_SSH}" ] || die "Fichier de clés SSH introuvable : ${VM_CLE_SSH} (VM_CLE_SSH=…)"
pvesm status --content snippets 2>/dev/null | awk 'NR>1{print $1}' | grep -qx "${SNIPPETS_STORAGE}" || {
  info "Activation des « snippets » sur le stockage ${SNIPPETS_STORAGE}…"
  CONTENU="$(pvesm config "${SNIPPETS_STORAGE}" 2>/dev/null | sed -n 's/^\s*content //p')"
  pvesm set "${SNIPPETS_STORAGE}" --content "${CONTENU:+${CONTENU},}snippets"
}
mkdir -p "${SNIPPETS_DIR}" "$(dirname "${IMG}")"

if [ ! -f "${IMG}" ] || [ -n "$(find "${IMG}" -mtime +30 2>/dev/null)" ]; then
  info "Téléchargement de l'image Debian 12…"
  curl -fsSL -o "${IMG}.tmp" "${IMG_URL}" && mv "${IMG}.tmp" "${IMG}"
fi

# Réglages lus par install.sh au premier démarrage, puis effacés.
SNIPPET="${SNIPPETS_DIR}/recipelog-plateforme-${VMID}.yaml"
umask 077
cat > "${SNIPPET}" <<EOF
#cloud-config
package_update: true
packages: [qemu-guest-agent, curl]
write_files:
  - path: /root/plateforme.env
    permissions: "0600"
    content: |
      ADMIN_EMAILS=${ADMIN_EMAILS}
      CF_TUNNEL_TOKEN=${CF_TUNNEL_TOKEN}
      RECIPELOG_BRANCH=${RECIPELOG_BRANCH}
      CREER_TEST=1
runcmd:
  - systemctl enable --now qemu-guest-agent
  - [bash, -c, "curl -fsSL ${RAW_BASE}/${RECIPELOG_BRANCH}/plateforme/install.sh -o /root/install-plateforme.sh && bash /root/install-plateforme.sh > /root/install-plateforme.log 2>&1; rm -f /root/plateforme.env"]
EOF
umask 022

info "Création de la VM ${VMID} (${VM_NOM})…"
qm create "${VMID}" --name "${VM_NOM}" --ostype l26 \
  --cores "${VM_COEURS}" --cpu host --memory "${VM_MEMOIRE}" \
  --net0 "virtio,bridge=${VM_PONT}" \
  --scsihw virtio-scsi-single --agent enabled=1 \
  --serial0 socket --vga serial0 --onboot 1
qm set "${VMID}" --scsi0 "${VM_STOCKAGE}:0,import-from=${IMG},discard=on,ssd=1,iothread=1" >/dev/null
qm resize "${VMID}" scsi0 "${VM_DISQUE}G" >/dev/null
qm set "${VMID}" --ide2 "${VM_STOCKAGE}:cloudinit" --boot order=scsi0 \
  --ipconfig0 ip=dhcp --ciuser recipelog --sshkeys "${VM_CLE_SSH}" \
  --cicustom "vendor=${SNIPPETS_STORAGE}:snippets/$(basename "${SNIPPET}")" >/dev/null
qm start "${VMID}"

info "VM démarrée. Installation de la plateforme dans la VM (5 à 10 minutes)…"
FINI=0
for _ in $(seq 1 120); do
  sleep 10
  if qm guest exec "${VMID}" -- test -f /root/recipelog-plateforme.txt 2>/dev/null | grep -Eq '"exitcode" *: *0'; then
    FINI=1; break
  fi
  printf '.'
done
echo

# Le jeton n'a plus rien à faire sur l'hôte.
qm set "${VMID}" --delete cicustom >/dev/null 2>&1 || true
rm -f "${SNIPPET}"

if [ "${FINI}" = 1 ]; then
  qm guest exec "${VMID}" -- cat /root/recipelog-plateforme.txt 2>/dev/null \
    | sed -n 's/^ *"out-data" : "\(.*\)",\{0,1\}$/\1/p' | sed 's/\\n/\n/g; s/\\t/\t/g'
  info "✅ Plateforme installée dans la VM ${VMID}. Connexion : ssh recipelog@<adresse ci-dessus>, puis sudo -i"
else
  echo "⚠️  L'installation n'a pas fini dans les temps. Pour voir où elle en est :"
  echo "    qm guest exec ${VMID} -- tail -n 30 /root/install-plateforme.log"
fi

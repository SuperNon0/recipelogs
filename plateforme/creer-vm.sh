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
#   SMTP_HOTE, SMTP_PORT, SMTP_UTILISATEUR, SMTP_MOT_DE_PASSE, SMTP_EXPEDITEUR
#   (envoi des emails, par exemple Brevo), RECIPELOG_BRANCH (plateforme)
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
# Envoi des emails : sans lui, l'email « Choisis ton mot de passe » ne part pas et tu ne
# peux pas entrer dans le panel. Mieux vaut le régler tout de suite (A-FAIRE.md, étape A3).
ask SMTP_HOTE "Serveur d'envoi des emails (Brevo : smtp-relay.brevo.com ; Entrée = plus tard)" ""
if [ -n "${SMTP_HOTE}" ]; then
  ask SMTP_PORT "Port du serveur d'emails" "587"
  ask SMTP_UTILISATEUR "Identifiant SMTP (chez Brevo : il ressemble à 8xxxxx@smtp-brevo.com)" ""
  ask SMTP_MOT_DE_PASSE "Clé SMTP (la saisie ne s'affiche pas)" "" secret
  ask SMTP_EXPEDITEUR "Expéditeur des emails (une adresse de ton domaine, validée chez Brevo)" "RecipeLog <noreply@recipelog.cc>"
fi
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
# Chaque valeur est écrite « protégée » (%q) : un espace, un $ ou un guillemet dans un mot
# de passe est gardé tel quel quand install.sh relit le fichier.
reglage() { printf '      %s=%q\n' "$1" "${!1:-}"; }
REGLAGES="$(for v in ADMIN_EMAILS CF_TUNNEL_TOKEN RECIPELOG_BRANCH SMTP_HOTE SMTP_PORT SMTP_UTILISATEUR SMTP_MOT_DE_PASSE SMTP_EXPEDITEUR; do
  [ -n "${!v:-}" ] && reglage "$v"
done)"
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
${REGLAGES}
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

info "VM démarrée. Installation de la plateforme dans la VM (5 à 15 minutes)…"
echo "    Ce qui se passe s'affiche ici au fur et à mesure. Tu peux laisser tourner."
# Texte renvoyé par une commande lancée dans la VM (qm guest exec répond en JSON).
dans_vm() { qm guest exec "${VMID}" -- "$@" 2>/dev/null | sed -n 's/^ *"out-data" : "\(.*\)",\{0,1\}$/\1/p' | sed 's/\\n/\n/g; s/\\t/\t/g; s/\\"/"/g'; }
FINI=0
DERNIERE=""
for _ in $(seq 1 180); do
  sleep 10
  if qm guest exec "${VMID}" -- test -f /root/recipelog-plateforme.txt 2>/dev/null | grep -Eq '"exitcode" *: *0'; then
    FINI=1; break
  fi
  # La dernière étape écrite par install.sh (« ==> … »), affichée quand elle change.
  LIGNE="$(dans_vm sh -c "grep -a '^==>\|^⚠️\|^❌' /root/install-plateforme.log 2>/dev/null | tail -n 1" | tail -n 1)"
  if [ -n "${LIGNE}" ] && [ "${LIGNE}" != "${DERNIERE}" ]; then
    echo "    ${LIGNE}"
    DERNIERE="${LIGNE}"
  fi
done

# Le jeton n'a plus rien à faire sur l'hôte.
qm set "${VMID}" --delete cicustom >/dev/null 2>&1 || true
rm -f "${SNIPPET}"

if [ "${FINI}" = 1 ]; then
  dans_vm cat /root/recipelog-plateforme.txt
  info "✅ Plateforme installée dans la VM ${VMID}."
  echo "    Pour entrer dans la VM, depuis CE shell Proxmox (la clé SSH est ici) :"
  echo "      ssh recipelog@<adresse « Machine » ci-dessus>     puis :  sudo -i"
  echo "    Sans SSH : dans Proxmox, VM ${VMID} → Console (xterm.js)."
else
  echo "⚠️  L'installation n'a pas fini en 30 minutes. Pour voir où elle en est :"
  echo "    qm guest exec ${VMID} -- tail -n 30 /root/install-plateforme.log"
  echo "    Si elle s'est arrêtée sur une erreur, elle peut être relancée sans danger dans la VM :"
  echo "    bash /root/install-plateforme.sh"
fi

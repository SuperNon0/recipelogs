#!/usr/bin/env bash
# ============================================================
# exporter-ancien.sh : prépare le déménagement d'un ancien RecipeLog (conteneur LXC)
# vers la plateforme. À lancer SUR L'HÔTE PROXMOX, en root. Ne modifie rien dans
# le conteneur : il lit la base et les fichiers, et écrit une archive sur l'hôte.
#
#   bash exporter-ancien.sh <numéro du conteneur> [--reference-demo] [fichier]
#
#   --reference-demo  pour la démo : prend l'état « figé » (recipelog-demo-figer)
#                     au lieu de l'état actuel.
#
# L'archive contient base.dump (pg_dump) et fichiers.tar.gz (photos et factures),
# le format attendu par : recipelog-instance importer <nom> <archive> --oui
# ============================================================
set -euo pipefail

die() { echo "❌ $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "À lancer en root sur l'hôte Proxmox."
command -v pct >/dev/null || die "pct introuvable : ce script se lance sur l'hôte Proxmox, pas dans un conteneur."

ctid="" reference=0 sortie=""
while [ $# -gt 0 ]; do
  case "$1" in
    --reference-demo) reference=1; shift ;;
    -*) die "Option inconnue : $1" ;;
    *) if [ -z "${ctid}" ]; then ctid="$1"; else sortie="$1"; fi; shift ;;
  esac
done
[[ "${ctid}" =~ ^[0-9]+$ ]] || die "Usage : bash exporter-ancien.sh <numéro du conteneur> [--reference-demo] [fichier]"
pct status "${ctid}" | grep -q running || die "Le conteneur ${ctid} n'est pas démarré."
pct exec "${ctid}" -- test -f /opt/recipelog/.env || die "Pas de RecipeLog dans le conteneur ${ctid} (/opt/recipelog/.env absent)."

nom="$(pct config "${ctid}" | sed -n 's/^hostname: //p')"
sortie="${sortie:-/root/recipelog-${nom:-${ctid}}-$(date +%Y%m%d-%H%M).tar.gz}"
tmp="$(mktemp -d)"
trap 'find "${tmp}" -delete 2>/dev/null || true' EXIT
umask 077

# Lu dans le conteneur : l'adresse de sa base et son dossier de fichiers.
lire() { pct exec "${ctid}" -- grep -m1 "^$1=" /opt/recipelog/.env | cut -d= -f2- | tr -d "\"'" || true; }
url="$(lire DATABASE_URL)"; url="${url%%\?*}"
uploads="$(lire UPLOAD_DIR)"; uploads="${uploads:-/var/lib/recipelog/uploads}"
[ -n "${url}" ] || die "DATABASE_URL introuvable dans le conteneur ${ctid}."

if [ "${reference}" = 1 ]; then
  pct exec "${ctid}" -- test -f /var/lib/recipelog-demo/base.dump || die "Pas d'état figé dans ${ctid} (recipelog-demo-figer jamais lancé)."
  echo "==> Base de la démo (état figé du $(pct exec "${ctid}" -- cat /var/lib/recipelog-demo/fige-le 2>/dev/null || echo '?'))…"
  pct exec "${ctid}" -- cat /var/lib/recipelog-demo/base.dump > "${tmp}/base.dump"
  echo "==> Photos de la démo (état figé)…"
  pct exec "${ctid}" -- sh -c 'd=$(mktemp -d) && mkdir "$d/uploads" && { [ ! -f /var/lib/recipelog-demo/uploads.tar.gz ] || tar -xzf /var/lib/recipelog-demo/uploads.tar.gz -C "$d/uploads"; } && tar -C "$d" -czf - uploads; rm -rf "$d"' > "${tmp}/fichiers.tar.gz"
else
  echo "==> Base de données…"
  pct exec "${ctid}" -- pg_dump -Fc --no-owner --no-acl --no-comments -d "${url}" > "${tmp}/base.dump"
  echo "==> Photos et factures (${uploads})…"
  pct exec "${ctid}" -- sh -c "d=\$(mktemp -d) && ln -s '${uploads}' \"\$d/uploads\" && tar -C \"\$d\" -chzf - uploads; rm -rf \"\$d\"" > "${tmp}/fichiers.tar.gz"
fi
[ -s "${tmp}/base.dump" ] || die "La base est vide : rien n'a été exporté."
tar -C "${tmp}" -czf "${sortie}" base.dump fichiers.tar.gz

echo "✅ Archive prête : ${sortie} ($(du -h "${sortie}" | cut -f1))"
echo "   Base : $(du -h "${tmp}/base.dump" | cut -f1), fichiers : $(du -h "${tmp}/fichiers.tar.gz" | cut -f1)."
echo "   Suite : copie-la dans la VM de la plateforme (voir A-FAIRE.md, étape E)."

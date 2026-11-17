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
# Le script compte les fichiers dans le conteneur et dans l'archive : s'il en manque
# un seul, il s'arrête au lieu de fabriquer une archive incomplète.
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
attendus=0

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
  if pct exec "${ctid}" -- test -f /var/lib/recipelog-demo/uploads.tar.gz; then
    attendus="$(pct exec "${ctid}" -- sh -c 'tar -tzf /var/lib/recipelog-demo/uploads.tar.gz | grep -vc "/$"' | tr -dc 0-9)" \
      || die "L'état figé des photos de la démo est illisible (/var/lib/recipelog-demo/uploads.tar.gz)."
  else
    echo "    (pas de photos dans l'état figé : la démo sera importée sans photo)"
  fi
  pct exec "${ctid}" -- sh -c 'set -e; d=$(mktemp -d); trap "rm -rf \"$d\"" EXIT; mkdir "$d/uploads"; if [ -f /var/lib/recipelog-demo/uploads.tar.gz ]; then tar -xzf /var/lib/recipelog-demo/uploads.tar.gz -C "$d/uploads"; fi; if [ -d "$d/uploads/uploads" ] && [ "$(ls -A "$d/uploads" | wc -l)" = 1 ]; then mv "$d/uploads" "$d/x"; mv "$d/x/uploads" "$d/uploads"; fi; tar -C "$d" -czf - uploads' > "${tmp}/fichiers.tar.gz" \
    || die "Les photos de la démo n'ont pas pu être lues."
else
  echo "==> Base de données…"
  pct exec "${ctid}" -- pg_dump -Fc --no-owner --no-acl --no-comments -d "${url}" > "${tmp}/base.dump" \
    || die "La base n'a pas pu être lue (pg_dump a échoué)."
  echo "==> Photos et factures (${uploads})…"
  pct exec "${ctid}" -- test -d "${uploads}" || die "Dossier des fichiers introuvable dans le conteneur : ${uploads}"
  attendus="$(pct exec "${ctid}" -- find -L "${uploads}" -type f | wc -l)"
  # « set -e » et pas de « ; rm » à la fin : si tar échoue (fichier illisible, disque plein), on le sait.
  pct exec "${ctid}" -- sh -c "set -e; d=\$(mktemp -d); trap 'rm -rf \"\$d\"' EXIT; ln -s '${uploads}' \"\$d/uploads\"; tar -C \"\$d\" -chzf - uploads" > "${tmp}/fichiers.tar.gz" \
    || die "Les photos et factures n'ont pas pu être lues en entier : rien n'est exporté."
fi
dans_archive="$(tar -tzf "${tmp}/fichiers.tar.gz" | grep -vc '/$' || true)"
if [ "${dans_archive:-0}" -lt "${attendus:-0}" ]; then
  die "Il manque des fichiers : ${attendus} dans le conteneur, ${dans_archive:-0} dans l'archive. Rien n'est exporté ; relance le script."
fi
[ -s "${tmp}/base.dump" ] || die "La base est vide : rien n'a été exporté."
tar -C "${tmp}" -czf "${sortie}" base.dump fichiers.tar.gz

echo "✅ Archive prête : ${sortie} ($(du -h "${sortie}" | cut -f1))"
echo "   Base : $(du -h "${tmp}/base.dump" | cut -f1), fichiers : ${dans_archive:-0} (photos et factures, $(du -h "${tmp}/fichiers.tar.gz" | cut -f1))."
echo "   À l'import, recipelog-instance affichera le même nombre de fichiers : compare-les."
echo "   Suite : copie-la dans la VM de la plateforme (voir A-FAIRE.md, étape E)."

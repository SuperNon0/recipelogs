#!/usr/bin/env bash
# ============================================================
# deploy.sh — Mise à jour de RecipeLog
# Lancé par le bouton « Mettre à jour le site » (via sudo) ou à la main :
#   bash /opt/recipelog/deploy/proxmox/deploy.sh [--force]
# ============================================================
# ⚠ Ne pas retirer le bloc de « # » ci-dessous : les anciennes versions de ce
# script continuaient à lire CE fichier après leur `git pull`, à la position
# où elles en étaient (octets ~700 à ~1260). Ces lignes ne contiennent que des
# « # » : quel que soit l'endroit où la lecture reprend, c'est un commentaire.
##############################################################################
##############################################################################
##############################################################################
##############################################################################
##############################################################################
##############################################################################
##############################################################################
##############################################################################
##############################################################################
##############################################################################
##############################################################################
##############################################################################
##############################################################################
##############################################################################
##############################################################################
# ============================================================
# Fonctionnement (tout le code est dans main(), que bash lit en ENTIER avant
# de l'exécuter : le `git pull` peut donc réécrire ce fichier sans danger).
#
#  1. git pull ; si rien de nouveau depuis le dernier déploiement réussi → fin.
#  2. Relance la NOUVELLE version de ce script (--after-pull).
#  3. pnpm install (sauté si pnpm-lock.yaml n'a pas changé), prisma generate
#     + migrate, build dans .next-build en réutilisant le cache du build
#     précédent (le site en ligne continue de tourner sur .next).
#     Un témoin (src/styles/build-stamp.css) vérifie que le CSS produit est
#     neuf ; sinon le build est refait sans cache.
#  4. Échange .next-build ↔ .next, redémarrage, vérification de /api/health.
#  5. Si le nouveau serveur ne répond pas : retour automatique à l'ancienne
#     version (.next-prev).
# ============================================================

main() {
  set -Eeuo pipefail

  local APP_USER="recipelog"
  local APP_DIR="/opt/recipelog"
  local UPLOAD_DIR="/var/lib/recipelog/uploads"
  local SELF="${APP_DIR}/deploy/proxmox/deploy.sh"
  local STAMP="${APP_DIR}/.next/DEPLOYED_COMMIT"
  local CSS_STAMP_FILE="src/styles/build-stamp.css"
  local LOCK_HASH="node_modules/.deploy-lock-hash"
  local STAGE="${1:-}"

  # Commande lancée en tant qu'utilisateur de l'application, dans APP_DIR.
  as_app() { sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && $1"; }
  fail() {
    echo "==> ❌ ÉCHEC DU DÉPLOIEMENT : $1"
    echo "==> Le site n'a pas été modifié : l'ancienne version tourne toujours."
    exit 1
  }
  trap 'fail "commande en erreur (ligne ${LINENO})"' ERR

  # ── Étape 1 : récupération du code ──────────────────────
  if [ "${STAGE}" != "--after-pull" ]; then
    echo "==> [$(date '+%H:%M:%S')] Démarrage du déploiement..."

    # Dossier des photos (hors du build, sinon effacé à chaque déploiement)
    mkdir -p "${UPLOAD_DIR}"
    local OLD_UPLOADS="${APP_DIR}/.next/standalone/public/uploads"
    if [ -d "${OLD_UPLOADS}" ]; then
      cp -rn "${OLD_UPLOADS}/." "${UPLOAD_DIR}/" || true
    fi
    chown -R "${APP_USER}:${APP_USER}" "$(dirname "${UPLOAD_DIR}")"
    if ! grep -q '^UPLOAD_DIR=' "${APP_DIR}/.env"; then
      echo "UPLOAD_DIR=\"${UPLOAD_DIR}\"" >> "${APP_DIR}/.env"
    fi

    echo "==> Git pull..."
    # Next.js peut réécrire tsconfig.json pendant le build : on le restaure
    # pour que le pull ne soit jamais bloqué par une « modification locale ».
    # Idem pour le témoin CSS, réécrit à chaque build.
    as_app "git checkout -- tsconfig.json"
    as_app "git checkout -- ${CSS_STAMP_FILE} 2>/dev/null || true"
    as_app "git pull --ff-only"
    local HEAD
    HEAD="$(as_app "git rev-parse HEAD")"
    if [ "${STAGE}" != "--force" ] && [ -f "${STAMP}" ] && [ "$(cat "${STAMP}")" = "${HEAD}" ]; then
      echo "==> ✅ DÉJÀ À JOUR : aucune nouveauté depuis le dernier déploiement."
      exit 0
    fi
    # La suite est faite par la version qui vient d'être téléchargée.
    exec bash "${SELF}" --after-pull
  fi

  # ── Étape 2 : dépendances et base de données ────────────
  local lock_hash
  lock_hash="$(sha256sum "${APP_DIR}/pnpm-lock.yaml" | cut -d' ' -f1)"
  if [ -f "${APP_DIR}/${LOCK_HASH}" ] && [ "$(cat "${APP_DIR}/${LOCK_HASH}")" = "${lock_hash}" ]; then
    echo "==> [$(date '+%H:%M:%S')] Dépendances inchangées : pnpm install sauté."
  else
    echo "==> [$(date '+%H:%M:%S')] pnpm install..."
    as_app "pnpm install --frozen-lockfile"
    as_app "echo ${lock_hash} > ${LOCK_HASH}"
  fi

  # Outils de l'outil MCP « lire_video » (Réglages → Recettes depuis TikTok) :
  # ffmpeg depuis apt, yt-dlp en binaire autonome (la version apt est trop
  # vieille : TikTok et Instagram changent souvent). Jamais bloquant.
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "==> [$(date '+%H:%M:%S')] Installation de ffmpeg..."
    { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg; } \
      || echo "⚠ ffmpeg non installé (lire_video n'aura pas d'images)"
  fi
  if [ ! -x /usr/local/bin/yt-dlp ]; then
    echo "==> [$(date '+%H:%M:%S')] Installation de yt-dlp..."
    { curl -fsSL -o /usr/local/bin/yt-dlp.tmp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
      && chmod 755 /usr/local/bin/yt-dlp.tmp && mv /usr/local/bin/yt-dlp.tmp /usr/local/bin/yt-dlp; } \
      || echo "⚠ yt-dlp non installé (lire_video ne lira pas les vidéos)"
  else
    timeout 120 /usr/local/bin/yt-dlp -U >/dev/null 2>&1 || echo "⚠ mise à jour de yt-dlp ignorée"
  fi

  echo "==> [$(date '+%H:%M:%S')] Prisma (client + migrations)..."
  local DEPLOY_START
  DEPLOY_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  as_app "pnpm exec prisma generate"
  as_app "pnpm exec prisma migrate deploy"
  as_app "pnpm exec tsx scripts/post-deploy-report.ts '${DEPLOY_START}'" || echo "⚠ post-deploy-report ignoré"

  # ── Étape 3 : build dans un dossier séparé ──────────────
  echo "==> [$(date '+%H:%M:%S')] Build Next.js (le site reste en ligne pendant ce temps)..."
  # Le cache du build précédent rend le build bien plus rapide, mais il a déjà
  # resservi un ancien CSS (V2.0 : page nouvelle, styles anciens). D'où le
  # témoin : une valeur unique écrite dans le CSS source, qui doit se
  # retrouver dans le CSS produit. Absente → CSS périmé → build sans cache.
  local css_stamp
  css_stamp="$(as_app "git rev-parse --short HEAD")-$(date +%s)"
  as_app "sed -i 's/--build-stamp: \"[^\"]*\"/--build-stamp: \"${css_stamp}\"/' ${CSS_STAMP_FILE}"
  as_app "grep -q '${css_stamp}' ${CSS_STAMP_FILE}" || fail "impossible d'écrire le témoin CSS"
  as_app "rm -rf .next-build && mkdir -p .next-build && { [ -d .next/cache ] && mv .next/cache .next-build/cache || true; }"
  as_app "NEXT_TELEMETRY_DISABLED=1 NEXT_DIST_DIR=.next-build pnpm build"
  if ! as_app "grep -qs '${css_stamp}' .next-build/static/css/*.css"; then
    echo "==> [$(date '+%H:%M:%S')] ⚠ Le cache a produit un CSS périmé : nouveau build sans cache..."
    as_app "rm -rf .next-build && mkdir -p .next-build"
    as_app "NEXT_TELEMETRY_DISABLED=1 NEXT_DIST_DIR=.next-build pnpm build"
    as_app "grep -qs '${css_stamp}' .next-build/static/css/*.css" || fail "le CSS produit est périmé même sans cache"
  fi
  as_app "git checkout -- ${CSS_STAMP_FILE}"
  # Mode standalone : static/ et public/ doivent être copiés à côté du serveur.
  as_app "cp -r .next-build/static .next-build/standalone/.next-build/static && { [ -d public ] && cp -r public .next-build/standalone/public || true; }"
  [ -f "${APP_DIR}/.next-build/standalone/server.js" ] || fail "le build n'a pas produit server.js"

  # ── Étape 4 : échange et redémarrage ────────────────────
  echo "==> [$(date '+%H:%M:%S')] Bascule vers la nouvelle version et redémarrage..."
  trap 'echo "==> ❌ ÉCHEC DU DÉPLOIEMENT pendant la bascule (ligne ${LINENO}) : vérifier /opt/recipelog/.next"; exit 1' ERR
  cd "${APP_DIR}"
  rm -rf .next-prev
  [ -d .next ] && mv .next .next-prev
  mv .next-build .next
  chmod -R o+rX .next
  systemctl restart recipelog

  echo "==> [$(date '+%H:%M:%S')] Vérification du démarrage..."
  local ok=0
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 3 http://127.0.0.1:3000/api/health; then ok=1; break; fi
    sleep 2
  done

  if [ "${ok}" != 1 ]; then
    echo "==> ⚠ La nouvelle version ne répond pas : retour à l'ancienne..."
    rm -rf .next-failed
    mv .next .next-failed
    [ -d .next-prev ] && mv .next-prev .next
    systemctl restart recipelog
    echo "==> ❌ ÉCHEC DU DÉPLOIEMENT : la nouvelle version ne démarre pas (voir journalctl -u recipelog)."
    echo "==> Retour automatique à la version précédente effectué."
    exit 1
  fi

  as_app "git rev-parse HEAD" > "${STAMP}"
  echo "==> ✅ [$(date '+%H:%M:%S')] Déploiement terminé."
}

main "$@"; exit $?

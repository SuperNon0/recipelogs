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
#  0. Lancé par le bouton du site, le script se relance dans sa propre unité
#     systemd (recipelog-deploy) : sinon le redémarrage du site l'arrête.
#  1. git pull ; si rien de nouveau depuis le dernier déploiement réussi → fin.
#  2. Relance la NOUVELLE version de ce script (--after-pull).
#  3. pnpm install (sauté si pnpm-lock.yaml n'a pas changé) et prisma generate
#     (sauté si le schéma n'a pas changé non plus).
#  4. Nouvelle version dans .next-build (le site en ligne continue de tourner
#     sur .next) : le paquet que GitHub construit à chaque mise à jour de main
#     (.github/workflows/server-build.yml), attendu s'il est en cours. Sans
#     paquet : build ici, avec le cache du build précédent ; un témoin
#     (src/styles/build-stamp.css) vérifie que le CSS produit est neuf, sinon
#     le build est refait sans cache.
#  5. Migrations de la base.
#  6. Échange .next-build ↔ .next, redémarrage, vérification de /api/health
#     (base comprise). Si le nouveau serveur ne répond pas : retour
#     automatique à l'ancienne version (.next-prev) ; si c'était le paquet
#     GitHub, build ici et nouvel essai.
#
# Options : --force (refait la mise à jour même sans nouveauté),
#           --local-build (construit ici, sans le paquet GitHub).
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
  local PRISMA_HASH="node_modules/.deploy-prisma-hash"
  local UNIT="recipelog-deploy"
  # Paquets construits par GitHub (.github/workflows/server-build.yml)
  local PREBUILT_TAG="server-builds"
  local PREBUILT_WORKFLOW="server-build.yml"
  local PREBUILT_WAIT=600 # attente maximale d'un build GitHub en cours (s)

  local STAGE="" FORCE=0 LOCAL_BUILD=0 arg
  for arg in "$@"; do
    case "${arg}" in
      --after-pull) STAGE="--after-pull" ;;
      --force) FORCE=1 ;;
      --local-build) LOCAL_BUILD=1 ;;
    esac
  done

  # Commande lancée en tant qu'utilisateur de l'application, dans APP_DIR.
  as_app() { sudo -u "${APP_USER}" bash -c "cd ${APP_DIR} && $1"; }
  now() { date '+%H:%M:%S'; }
  fail() {
    echo "==> ❌ ÉCHEC DU DÉPLOIEMENT : $1"
    echo "==> Le site n'a pas été modifié : l'ancienne version tourne toujours."
    exit 1
  }
  # shellcheck disable=SC2329 # appelée par le piège ERR de la bascule
  fail_switch() {
    echo "==> ❌ ÉCHEC DU DÉPLOIEMENT pendant la bascule (ligne $1) : vérifier /opt/recipelog/.next"
    exit 1
  }

  # ── Étape 0 : lancé par le bouton → unité systemd à part ─
  # Le bouton lance ce script depuis le service recipelog, dont il partage le
  # groupe de processus (cgroup) : `systemctl restart recipelog` l'arrêtait
  # donc net à la bascule (journal coupé, verrou jamais retiré, ni
  # vérification ni retour arrière). On le relance dans sa propre unité, qui
  # survit au redémarrage du site.
  if [ -z "${RECIPELOG_DEPLOY_DETACHED:-}" ] && grep -qs 'recipelog\.service' /proc/self/cgroup; then
    local log
    log="$(readlink -f "/proc/$$/fd/1" || true)"
    [ -f "${log}" ] || log="/tmp/recipelog-deploy.log"
    if systemctl is-active --quiet "${UNIT}.service"; then
      echo "==> Une mise à jour est déjà en cours : suivi de celle-ci."
    elif ! systemd-run --unit="${UNIT}" --collect --quiet --setenv=PATH="${PATH}" \
      --setenv=RECIPELOG_DEPLOY_DETACHED=1 --setenv=RECIPELOG_DEPLOY_LOG="${log}" \
      /bin/bash "${SELF}" "$@"; then
      echo "==> ⚠ Unité systemd impossible : la mise à jour continue dans le service du site."
      log=""
    fi
    if [ -n "${log}" ]; then
      # Ce processus-ci est arrêté avec le site au redémarrage, sans effet sur
      # la mise à jour, qui continue dans son unité.
      while systemctl is-active --quiet "${UNIT}.service"; do sleep 2; done
      exit 0
    fi
  fi
  if [ -n "${RECIPELOG_DEPLOY_LOG:-}" ]; then
    # Le journal appartient à l'utilisateur du site : dans /tmp, root ne peut
    # pas l'ouvrir lui-même (protection fs.protected_regular). D'où tee.
    exec > >(sudo -u "${APP_USER}" tee -a "${RECIPELOG_DEPLOY_LOG}" >/dev/null) 2>&1
  fi
  if [ -n "${RECIPELOG_DEPLOY_DETACHED:-}" ]; then
    # Verrou posé par le bouton (src/app/actions/admin.ts) : le processus qui
    # devait le retirer a été arrêté avec le site au redémarrage. Puis on
    # attend que tee ait fini d'écrire le journal.
    trap 'rm -f /tmp/recipelog-deploy.lock; exec >&- 2>&-; wait' EXIT
  fi
  trap 'fail "commande en erreur (ligne ${LINENO})"' ERR

  # ── Étape 1 : récupération du code ──────────────────────
  if [ "${STAGE}" != "--after-pull" ]; then
    echo "==> [$(now)] Démarrage du déploiement..."
    export RECIPELOG_DEPLOY_T0
    RECIPELOG_DEPLOY_T0="$(date +%s)"

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
    if [ "${FORCE}" != 1 ] && [ -f "${STAMP}" ] && [ "$(cat "${STAMP}")" = "${HEAD}" ]; then
      echo "==> ✅ DÉJÀ À JOUR : aucune nouveauté depuis le dernier déploiement."
      exit 0
    fi
    # La suite est faite par la version qui vient d'être téléchargée.
    if [ "${LOCAL_BUILD}" = 1 ]; then
      exec bash "${SELF}" --after-pull --local-build
    fi
    exec bash "${SELF}" --after-pull
  fi

  local T0="${RECIPELOG_DEPLOY_T0:-$(date +%s)}"
  local HEAD
  HEAD="$(as_app "git rev-parse HEAD")"

  # ── Étape 2 : dépendances ───────────────────────────────
  local lock_hash prisma_hash
  lock_hash="$(sha256sum "${APP_DIR}/pnpm-lock.yaml" | cut -d' ' -f1)"
  if [ -f "${APP_DIR}/${LOCK_HASH}" ] && [ "$(cat "${APP_DIR}/${LOCK_HASH}")" = "${lock_hash}" ]; then
    echo "==> [$(now)] Dépendances inchangées : pnpm install sauté."
  else
    echo "==> [$(now)] pnpm install..."
    as_app "pnpm install --frozen-lockfile"
    as_app "echo ${lock_hash} > ${LOCK_HASH}"
  fi
  # Le client Prisma ne dépend que du schéma et des dépendances.
  prisma_hash="$(cat "${APP_DIR}/prisma/schema.prisma" "${APP_DIR}/pnpm-lock.yaml" | sha256sum | cut -d' ' -f1)"
  if [ -f "${APP_DIR}/${PRISMA_HASH}" ] && [ "$(cat "${APP_DIR}/${PRISMA_HASH}")" = "${prisma_hash}" ]; then
    echo "==> [$(now)] Schéma de la base inchangé : prisma generate sauté."
  else
    echo "==> [$(now)] Prisma generate..."
    as_app "pnpm exec prisma generate"
    as_app "echo ${prisma_hash} > ${PRISMA_HASH}"
  fi

  # Outils de l'outil MCP « lire_video » (Réglages → Recettes depuis TikTok) :
  # ffmpeg depuis apt, yt-dlp en binaire autonome (la version apt est trop
  # vieille : TikTok et Instagram changent souvent). Jamais bloquant.
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "==> [$(now)] Installation de ffmpeg..."
    { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg; } \
      || echo "⚠ ffmpeg non installé (lire_video n'aura pas d'images)"
  fi
  if [ ! -x /usr/local/bin/yt-dlp ]; then
    echo "==> [$(now)] Installation de yt-dlp..."
    { curl -fsSL -o /usr/local/bin/yt-dlp.tmp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
      && chmod 755 /usr/local/bin/yt-dlp.tmp && mv /usr/local/bin/yt-dlp.tmp /usr/local/bin/yt-dlp; } \
      || echo "⚠ yt-dlp non installé (lire_video ne lira pas les vidéos)"
  else
    timeout 60 /usr/local/bin/yt-dlp -U >/dev/null 2>&1 || echo "⚠ mise à jour de yt-dlp ignorée"
  fi

  # État du build GitHub de ce commit : running, success, failure, none ou unknown.
  github_build_state() {
    local json
    json="$(curl -fsS --max-time 15 -H 'Accept: application/vnd.github+json' \
      "https://api.github.com/repos/$1/actions/workflows/${PREBUILT_WORKFLOW}/runs?head_sha=${HEAD}&per_page=1" 2>/dev/null)" ||
      { echo unknown; return 0; }
    printf '%s' "${json}" | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        try {
          const run = JSON.parse(s).workflow_runs?.[0];
          if (!run) console.log("none");
          else if (run.status !== "completed") console.log("running");
          else console.log(run.conclusion === "success" ? "success" : "failure");
        } catch {
          console.log("unknown");
        }
      });' 2>/dev/null || echo unknown
  }

  # Paquet construit par GitHub pour ce commit → .next-build. Si GitHub est
  # encore en train de le construire, on l'attend : c'est bien plus court
  # qu'un build ici. Retourne 1 sans paquet utilisable.
  fetch_prebuilt() {
    local repo name url state="" seen_success=0 said=0
    local start=${SECONDS} next_check=${SECONDS}
    repo="$(as_app "git remote get-url origin" | sed -nE 's#^(https://github\.com/|git@github\.com:)([^/]+/[^/]+)$#\2#p')"
    repo="${repo%.git}"
    if [ -z "${repo}" ]; then
      echo "==> [$(now)] Dépôt hors de GitHub : pas de paquet à télécharger."
      return 1
    fi
    name="recipelog-${HEAD}.tar.gz"
    url="https://github.com/${repo}/releases/download/${PREBUILT_TAG}/${name}"
    echo "==> [$(now)] Téléchargement de la version construite par GitHub..."
    as_app "rm -rf .next-download && mkdir .next-download" || return 1
    until as_app "curl -fsSL --connect-timeout 15 --max-time 600 -o .next-download/${name} ${url} && curl -fsSL --connect-timeout 15 --max-time 60 -o .next-download/${name}.sha256 ${url}.sha256"; do
      # Pas (encore) de paquet : GitHub est-il en train de le construire ?
      if [ "${SECONDS}" -ge "${next_check}" ]; then
        state="$(github_build_state "${repo}")"
        next_check=$((SECONDS + 60))
      fi
      case "${state}" in
        failure)
          echo "==> [$(now)] ⚠ Le build sur GitHub a échoué."
          return 1
          ;;
        none)
          if [ $((SECONDS - start)) -ge 120 ]; then
            echo "==> [$(now)] ⚠ GitHub n'a pas construit ce commit."
            return 1
          fi
          ;;
        success)
          if [ "${seen_success}" = 1 ]; then
            echo "==> [$(now)] ⚠ Paquet introuvable sur GitHub."
            return 1
          fi
          seen_success=1
          ;;
      esac
      if [ $((SECONDS - start)) -ge "${PREBUILT_WAIT}" ]; then
        echo "==> [$(now)] ⚠ GitHub n'a pas fini au bout de $((PREBUILT_WAIT / 60)) min."
        return 1
      fi
      if [ "${said}" = 0 ]; then
        echo "==> [$(now)] GitHub construit encore cette version (2 à 4 min en général) : attente..."
        said=1
      fi
      sleep 15
    done
    if ! as_app "cd .next-download && sha256sum --quiet -c ${name}.sha256"; then
      echo "==> [$(now)] ⚠ Paquet GitHub abîmé."
      return 1
    fi
    if ! as_app "rm -rf .next-build && mkdir .next-build && tar -xzf .next-download/${name} -C .next-build && rm -rf .next-download"; then
      echo "==> [$(now)] ⚠ Paquet GitHub illisible."
      return 1
    fi
    if [ "$(cat "${APP_DIR}/.next-build/BUILD_COMMIT" 2>/dev/null)" != "${HEAD}" ]; then
      echo "==> [$(now)] ⚠ Le paquet GitHub ne correspond pas à ce commit."
      return 1
    fi
    echo "==> [$(now)] Version de GitHub prête."
  }

  # Build sur le serveur dans .next-build, avec le cache du build précédent.
  # Le cache a déjà resservi un ancien CSS (V2.0 : page nouvelle, styles
  # anciens). D'où le témoin : une valeur unique écrite dans le CSS source,
  # qui doit se retrouver dans le CSS produit. Absente → CSS périmé → build
  # sans cache.
  build_locally() {
    echo "==> [$(now)] Build Next.js sur le serveur (le site reste en ligne pendant ce temps)..."
    local css_stamp
    css_stamp="$(as_app "git rev-parse --short HEAD")-$(date +%s)"
    as_app "rm -rf .next-download"
    as_app "sed -i 's/--build-stamp: \"[^\"]*\"/--build-stamp: \"${css_stamp}\"/' ${CSS_STAMP_FILE}"
    as_app "grep -q '${css_stamp}' ${CSS_STAMP_FILE}" || fail "impossible d'écrire le témoin CSS"
    as_app "rm -rf .next-build && mkdir -p .next-build && { [ -d .next/cache ] && mv .next/cache .next-build/cache || true; }"
    as_app "NEXT_TELEMETRY_DISABLED=1 NEXT_DIST_DIR=.next-build pnpm build"
    if ! as_app "grep -qs '${css_stamp}' .next-build/static/css/*.css"; then
      echo "==> [$(now)] ⚠ Le cache a produit un CSS périmé : nouveau build sans cache..."
      as_app "rm -rf .next-build && mkdir -p .next-build"
      as_app "NEXT_TELEMETRY_DISABLED=1 NEXT_DIST_DIR=.next-build pnpm build"
      as_app "grep -qs '${css_stamp}' .next-build/static/css/*.css" || fail "le CSS produit est périmé même sans cache"
    fi
    as_app "git checkout -- ${CSS_STAMP_FILE}"
  }

  # Mode standalone : static/ et public/ doivent être copiés à côté du
  # serveur. Le cache de build suit la version en ligne (pour un build ici).
  finish_build() {
    as_app "cp -r .next-build/static .next-build/standalone/.next-build/static && { [ -d public ] && cp -r public .next-build/standalone/public || true; }"
    as_app "{ [ -d .next/cache ] && [ ! -d .next-build/cache ] && mv .next/cache .next-build/cache || true; }"
    [ -f "${APP_DIR}/.next-build/standalone/server.js" ] || fail "la nouvelle version n'a pas de server.js"
  }

  # Échange .next-build ↔ .next, redémarrage et vérification, base comprise.
  # Si le site ne répond pas : retour à l'ancienne version. switched=1 si OK.
  switch_version() {
    echo "==> [$(now)] Bascule vers la nouvelle version et redémarrage..."
    cd "${APP_DIR}"
    rm -rf .next-prev
    [ -d .next ] && mv .next .next-prev
    mv .next-build .next
    chmod -R o+rX .next
    systemctl restart recipelog

    echo "==> [$(now)] Vérification du démarrage..."
    for _ in $(seq 1 30); do
      if curl -fsS -o /dev/null --max-time 10 "http://127.0.0.1:3000/api/health?db=1"; then
        switched=1
        return 0
      fi
      sleep 2
    done
    echo "==> [$(now)] ⚠ La nouvelle version ne répond pas : retour à l'ancienne..."
    rm -rf .next-failed
    mv .next .next-failed
    [ -d .next-prev ] && mv .next-prev .next
    systemctl restart recipelog
  }

  # ── Étape 3 : nouvelle version dans .next-build ─────────
  local built_by="GitHub"
  if [ "${LOCAL_BUILD}" = 1 ] || ! fetch_prebuilt; then
    built_by="le serveur"
    build_locally
  fi
  finish_build

  # ── Étape 4 : base de données ───────────────────────────
  echo "==> [$(now)] Migrations de la base..."
  local DEPLOY_START
  DEPLOY_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  as_app "pnpm exec prisma migrate deploy"
  as_app "pnpm exec tsx scripts/post-deploy-report.ts '${DEPLOY_START}'" || echo "⚠ post-deploy-report ignoré"

  # ── Étape 5 : échange et redémarrage ────────────────────
  trap 'fail_switch "${LINENO}"' ERR
  local switched=0
  switch_version
  if [ "${switched}" != 1 ] && [ "${built_by}" = "GitHub" ]; then
    echo "==> [$(now)] ⚠ La version de GitHub ne démarre pas ici : build sur le serveur, puis nouvel essai."
    trap 'fail "commande en erreur (ligne ${LINENO})"' ERR
    if [ -d "${APP_DIR}/.next-failed/cache" ] && [ ! -d "${APP_DIR}/.next/cache" ]; then
      mv "${APP_DIR}/.next-failed/cache" "${APP_DIR}/.next/cache"
    fi
    built_by="le serveur"
    build_locally
    finish_build
    trap 'fail_switch "${LINENO}"' ERR
    switch_version
  fi
  if [ "${switched}" != 1 ]; then
    echo "==> ❌ ÉCHEC DU DÉPLOIEMENT : la nouvelle version ne démarre pas (voir journalctl -u recipelog)."
    echo "==> Retour automatique à la version précédente effectué."
    exit 1
  fi

  as_app "git rev-parse HEAD" > "${STAMP}"
  local took=$(($(date +%s) - T0))
  echo "==> ✅ [$(now)] Déploiement terminé en $((took / 60)) min $((took % 60)) s (version construite par ${built_by})."
}

main "$@"; exit $?

#!/usr/bin/env bash
# ============================================================
# mise-a-jour.sh — Met à jour le site vitrine depuis la branche site-vitrine.
#
# Depuis le shell de l'hôte Proxmox :
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/mise-a-jour.sh)"
# Pour mettre aussi à jour le RecipeLog de la démo (branche stable) :
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/mise-a-jour.sh)" _ --demo
# Pour mettre à jour SEULEMENT la démo (la vitrine ne bouge pas) :
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/mise-a-jour.sh)" _ --demo-seulement
#
# Dans le conteneur de la vitrine, la même chose : vitrine-maj
# ============================================================
set -euo pipefail
AVEC_DEMO=0
AVEC_VITRINE=1
for a in "$@"; do
  case "$a" in
    --demo) AVEC_DEMO=1 ;;
    --demo-seulement) AVEC_DEMO=1; AVEC_VITRINE=0 ;;
  esac
done
RAW_DEFAULT="https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine"

# ── Sur l'hôte Proxmox : on retrouve les conteneurs et on lance la mise à jour dedans ──
if command -v pct >/dev/null 2>&1; then
  [ "$(id -u)" = 0 ] || { echo "Lance-moi en root." >&2; exit 1; }
  find_ct() { pct list | awk -v h="$1" 'NR>1 && $NF==h {print $1; exit}'; }
  VID="${VITRINE_VMID:-$(find_ct recipelog-vitrine)}"
  [ -n "$VID" ] || { echo "Conteneur recipelog-vitrine introuvable (règle VITRINE_VMID=…)." >&2; exit 1; }
  if [ "$AVEC_VITRINE" = 1 ]; then
    echo "==> Vitrine (conteneur ${VID})…"
    # La version la plus récente de ce script fait la mise à jour dans le conteneur.
    TMP="$(mktemp)"
    curl -fsSL "${VITRINE_RAW_BASE:-$RAW_DEFAULT}/mise-a-jour.sh" -o "$TMP"
    pct push "$VID" "$TMP" /root/vitrine-maj.sh && rm -f "$TMP"
    pct exec "$VID" -- bash /root/vitrine-maj.sh
  fi
  if [ "$AVEC_DEMO" = 1 ]; then
    # Démo dans le même conteneur que la vitrine (ou, anciennes installations, dans recipelog-demo).
    DID="${DEMO_VMID:-$(find_ct recipelog-demo)}"
    DID="${DID:-$VID}"
    if ! pct exec "$DID" -- test -x /usr/local/sbin/recipelog-deploy; then
      echo "RecipeLog introuvable dans le conteneur ${DID} : démo non mise à jour." >&2
    else
      echo "==> Démo : RecipeLog (conteneur ${DID})…"
      pct exec "$DID" -- /usr/local/sbin/recipelog-deploy
      echo "==> Démo : scripts de remise à zéro…"
      TMP="$(mktemp)"
      curl -fsSL "${VITRINE_RAW_BASE:-$RAW_DEFAULT}/scripts/demo-setup.sh" -o "$TMP"
      pct push "$DID" "$TMP" /root/demo-setup.sh && rm -f "$TMP"
      pct exec "$DID" -- env VITRINE_RAW_BASE="${VITRINE_RAW_BASE:-$RAW_DEFAULT}" bash /root/demo-setup.sh
    fi
  fi
  echo "==> Terminé."
  exit 0
fi

# ── Dans le conteneur de la vitrine ──
if [ "$AVEC_DEMO" = 1 ]; then
  [ -x /usr/local/sbin/recipelog-deploy ] || { echo "RecipeLog introuvable : démo non mise à jour." >&2; exit 1; }
  /usr/local/sbin/recipelog-deploy
  TMP="$(mktemp)"
  trap 'rm -f "$TMP"' EXIT
  curl -fsSL "${VITRINE_RAW_BASE:-$RAW_DEFAULT}/scripts/demo-setup.sh" -o "$TMP"
  VITRINE_RAW_BASE="${VITRINE_RAW_BASE:-$RAW_DEFAULT}" bash "$TMP"
  rm -f "$TMP"
  trap - EXIT
fi
[ "$AVEC_VITRINE" = 1 ] || exit 0
DIR=/opt/vitrine
[ -d "$DIR/.git" ] || { echo "Site vitrine introuvable dans $DIR." >&2; exit 1; }
BRANCH="$(cat "$DIR/.branche" 2>/dev/null || echo site-vitrine)"
AVANT="$(git -C "$DIR" rev-parse --short HEAD)"
git -C "$DIR" fetch -q --depth 1 origin "$BRANCH"
git -C "$DIR" reset -q --hard FETCH_HEAD
APRES="$(git -C "$DIR" rev-parse --short HEAD)"
rm -f /usr/local/sbin/vitrine-adresse-demo
# Réinstalle tout ce qui vient du code (nginx, formulaire, commandes) ; les réglages sont gardés.
VITRINE_BRANCH="$BRANCH" bash "$DIR/scripts/vitrine-setup.sh" >/dev/null
if [ "$AVANT" = "$APRES" ]; then
  echo "    Vitrine déjà à jour (${APRES})."
else
  echo "    Vitrine mise à jour : ${AVANT} → ${APRES}"
  git -C "$DIR" log --oneline -1 2>/dev/null | sed 's/^/    /' || true
fi

#!/usr/bin/env bash
# demo-setup.sh — transforme un RecipeLog classique en site de démo (lancé DANS le conteneur de la démo).
#  - RECIPELOG_DEMO=1 dans le .env : bandeau « démo », comptes, clé Claude et mise à jour coupés ;
#  - recipelog-demo-figer : garde l'état actuel comme démo de référence ;
#  - recipelog-demo-reset : remet ce état (chaque nuit à 4 h 30, minuteur systemd).
set -euo pipefail
RAW="${VITRINE_RAW_BASE:-https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine}"
ENV_FILE=/opt/recipelog/.env
[ -f "$ENV_FILE" ] || { echo "RecipeLog introuvable ($ENV_FILE)." >&2; exit 1; }

echo "==> Mode démo dans ${ENV_FILE}…"
if grep -q '^RECIPELOG_DEMO=' "$ENV_FILE"; then
  sed -i 's/^RECIPELOG_DEMO=.*/RECIPELOG_DEMO=1/' "$ENV_FILE"
else
  printf '\n# Site de démonstration (voir branche site-vitrine)\nRECIPELOG_DEMO=1\n' >> "$ENV_FILE"
fi

echo "==> Scripts de la démo…"
for f in recipelog-demo-figer recipelog-demo-reset; do
  curl -fsSL "${RAW}/scripts/${f}" -o "/usr/local/sbin/${f}"
  chmod 0755 "/usr/local/sbin/${f}"
done

cat > /etc/systemd/system/recipelog-demo-reset.service <<'UNIT'
[Unit]
Description=RecipeLog démo : remise à zéro
After=postgresql.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/recipelog-demo-reset
UNIT
cat > /etc/systemd/system/recipelog-demo-reset.timer <<'UNIT'
[Unit]
Description=RecipeLog démo : remise à zéro chaque nuit

[Timer]
OnCalendar=*-*-* 04:30:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable -q --now recipelog-demo-reset.timer

echo "==> Redémarrage du site…"
systemctl restart recipelog
for i in $(seq 1 30); do
  curl -fsS -o /dev/null http://127.0.0.1:3000/api/health && break
  sleep 2
done

if [ ! -f /var/lib/recipelog-demo/base.dump ]; then
  echo "==> Première photo de la démo (vide pour l'instant)…"
  /usr/local/sbin/recipelog-demo-figer
fi
echo "==> Démo prête. Ajoute tes recettes de démo sur le site, puis : recipelog-demo-figer"

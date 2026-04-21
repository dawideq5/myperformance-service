#!/usr/bin/env bash
# MyPerformance — reattach Postal SMTP container to every service network so
# Chatwoot / Directus / Documenso / Keycloak / Dashboard can send mail over
# docker DNS using hostname `smtp-iut9wf1rz9ey54g7lbkje0je:25`.
#
# Network connections are ephemeral; Postal / service recreates wipe them.
# This script is idempotent: run it any time you need to guarantee connectivity.
# It is also scheduled via /etc/cron.d/postal-reattach (every 5 minutes).
set -euo pipefail
SMTP_CONTAINER="smtp-iut9wf1rz9ey54g7lbkje0je"
NETWORKS=(
  coolify                          # dashboard + panels
  c9dxxjvb3rskueiuguudbqgb         # documenso
  pu8b37hw19akg5gx1445j3f2         # directus
  zdlueek1sg2dgdbi7nk5xrh5         # chatwoot
  hg0i1ii7tg5btyok3o2gqnf0         # keycloak
)
for net in "${NETWORKS[@]}"; do
  if docker network inspect "$net" >/dev/null 2>&1; then
    if docker inspect "$SMTP_CONTAINER" --format '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' 2>/dev/null | grep -qx "$net"; then
      echo "[skip] $SMTP_CONTAINER already on $net"
    else
      echo "[connect] $SMTP_CONTAINER -> $net"
      docker network connect "$net" "$SMTP_CONTAINER" || true
    fi
  else
    echo "[absent] network $net does not exist — skipping"
  fi
done

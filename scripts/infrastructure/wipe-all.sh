#!/usr/bin/env bash
# =============================================================================
# wipe-all.sh — hard reset całego ekosystemu MyPerformance.
#
# CEL: Usuwa kontenery Docker + wszystkie wolumeny (DANE) aplikacji:
#      Chatwoot, Moodle, Documenso, Outline, Directus, Postal.
#      Keycloak, step-ca, dashboard — ZOSTAWIA, bo w przeciwnym wypadku
#      tracimy tożsamość + PKI.
#
# PRZED URUCHOMIENIEM:
#   - Upewnij się, że to jest środowisko NIE-produkcyjne (albo masz backup).
#   - Skrypt nie prosi o potwierdzenie per-volume — jedyny guard to
#     `IAM_WIPE_CONFIRM=1`. Bez zmiennej: dry-run (pokazuje co by usunął).
#
# PO URUCHOMIENIU:
#   - Odpal `scripts/infrastructure/bootstrap.sh` — przywróci apki na
#     czystych wolumenach, zreimportuje realm Keycloak.
#
# Uruchomienie (na VPS, root / user z dostępem do docker socket):
#   IAM_WIPE_CONFIRM=1 sudo -E bash scripts/infrastructure/wipe-all.sh
# =============================================================================

set -euo pipefail

DRY_RUN="${IAM_WIPE_CONFIRM:-}"
if [ "$DRY_RUN" != "1" ]; then
  echo "[wipe-all] DRY-RUN (ustaw IAM_WIPE_CONFIRM=1 żeby faktycznie wywalić)"
  DO=echo
else
  DO=""
fi

# -----------------------------------------------------------------------------
# Container name prefixes per aplikacja. Coolify dodaje sufix UUID —
# używamy `docker ps --filter name=` żeby matchować.
# -----------------------------------------------------------------------------
APPS=(
  chatwoot
  moodle
  documenso
  outline
  directus
  postal
)

# Wolumeny do usunięcia (prefix-match). Każda apka ma własne wolumeny
# nazywane wg konwencji `<app>-<dataset>-data` lub `<app>-<dataset>`.
VOLUME_PATTERNS=(
  "^chatwoot[-_]"
  "^moodle[-_]"
  "^documenso[-_]"
  "^outline[-_]"
  "^directus[-_]"
  "^postal[-_]"
)

stop_containers_by_name() {
  local pattern="$1"
  local ids
  ids=$(docker ps -aq --filter "name=${pattern}" || true)
  if [ -z "$ids" ]; then
    echo "  no containers matching '${pattern}'"
    return
  fi
  for id in $ids; do
    local name
    name=$(docker inspect --format '{{.Name}}' "$id" 2>/dev/null | sed 's|^/||')
    echo "  stop+rm container ${name} (${id:0:12})"
    ${DO} docker rm -f "$id" >/dev/null
  done
}

remove_volumes_by_pattern() {
  local pattern="$1"
  local vols
  vols=$(docker volume ls --format '{{.Name}}' | grep -E "$pattern" || true)
  if [ -z "$vols" ]; then
    echo "  no volumes matching /${pattern}/"
    return
  fi
  for v in $vols; do
    echo "  rm volume ${v}"
    ${DO} docker volume rm "$v" >/dev/null || echo "    (in-use or gone, skipping)"
  done
}

echo "[wipe-all] === step 1: stop & remove containers ==="
for app in "${APPS[@]}"; do
  echo "[${app}]"
  stop_containers_by_name "${app}"
done

echo
echo "[wipe-all] === step 2: remove volumes ==="
for pat in "${VOLUME_PATTERNS[@]}"; do
  echo "[pattern=${pat}]"
  remove_volumes_by_pattern "$pat"
done

echo
echo "[wipe-all] === step 3: orphan docker networks ==="
ORPHAN_NETS=$(docker network ls --format '{{.Name}}' | grep -E '^(chatwoot|moodle|documenso|outline|directus|postal)' || true)
if [ -n "$ORPHAN_NETS" ]; then
  for n in $ORPHAN_NETS; do
    echo "  rm network ${n}"
    ${DO} docker network rm "$n" >/dev/null || true
  done
else
  echo "  no orphan networks"
fi

echo
echo "[wipe-all] === step 4: reset Keycloak OIDC clients (opcjonalnie) ==="
echo "Keycloak i jego baza POZOSTAJĄ (żeby nie stracić tożsamości userów)."
echo "Klienci OIDC per aplikacja zostaną zreimportowane przez"
echo "realm.json podczas bootstrap.sh — ale to OSTATECZNIE:"
echo "  - nadpisuje existing client configs do stanu z repo,"
echo "  - nie dotyka user accounts."
echo
echo "Jeśli chcesz też zresetować user-accounts (RESTART KC OD ZERA):"
echo "  docker rm -f coolify-... (kontenery KC)"
echo "  docker volume rm keycloak-database-* keycloak-data-*"
echo "  (+ potem docker compose up -d → realm.json zostanie zaimportowany)"
echo

if [ "$DRY_RUN" != "1" ]; then
  echo "[wipe-all] DONE. Odpal bootstrap.sh żeby przywrócić apki."
else
  echo "[wipe-all] DRY-RUN. Nic nie zostało zmienione."
fi

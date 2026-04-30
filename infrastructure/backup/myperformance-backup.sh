#!/usr/bin/env bash
#
# MyPerformance — codzienny backup całego stacku.
#
# Uruchomienie: cron `0 23 * * *` (patrz infrastructure/backup/myperformance-backup.cron).
#
# Backupuje:
#   - 8 baz: dashboard (PG), KC (PG), Outline (PG), Directus (PG), Chatwoot (PG),
#     Documenso (PG), Postal (MariaDB), Moodle (MariaDB).
#   - /data/coolify/ (compose, secrets, traefik dynamic configs).
#   - Step-CA volumes (root CA, intermediate CA, JWK provisioner).
#   - mTLS bundle (myperformance-ca.pem).
#
# Retencja: 7 dni lokalnie. Off-site sync (S3 / rclone) — patrz README.
#
# Idempotentny — wielokrotne uruchomienie tego samego dnia nadpisuje katalog
# z tą samą nazwą (timestamp w minute precision).
#
# Wymagania na hoście:
#   - docker (z dostępem do Coolify-managed containers przez `docker exec`)
#   - tar, gzip, sha256sum, jq
#   - curl (dla webhook do dashboarda)

set -euo pipefail

# ── Konfiguracja ─────────────────────────────────────────────────────────────
BACKUP_ROOT="${BACKUP_ROOT:-/backups/myperformance}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DASHBOARD_URL="${DASHBOARD_URL:-https://myperformance.pl}"
BACKUP_WEBHOOK_SECRET="${BACKUP_WEBHOOK_SECRET:?BACKUP_WEBHOOK_SECRET musi być ustawione}"

# Container names — DOSTOSUJ do swojego deploymentu (Coolify generuje UUID-y).
# Można sourcować z osobnego pliku /etc/myperformance-backup.env zamiast hardkodować.
PG_CONTAINERS_FILE="${PG_CONTAINERS_FILE:-/etc/myperformance-backup.containers}"
if [[ -f "$PG_CONTAINERS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$PG_CONTAINERS_FILE"
fi

# Domyślne wartości — override przez /etc/myperformance-backup.containers
: "${DASHBOARD_DB_CONTAINER:=}"
: "${DASHBOARD_DB_NAME:=dashboard}"
: "${DASHBOARD_DB_USER:=postgres}"

: "${KC_DB_CONTAINER:=}"
: "${KC_DB_NAME:=keycloak}"
: "${KC_DB_USER:=postgres}"

: "${OUTLINE_DB_CONTAINER:=}"
: "${OUTLINE_DB_NAME:=outline}"
: "${OUTLINE_DB_USER:=outline}"

: "${DIRECTUS_DB_CONTAINER:=}"
: "${DIRECTUS_DB_NAME:=directus}"
: "${DIRECTUS_DB_USER:=directus}"

: "${CHATWOOT_DB_CONTAINER:=}"
: "${CHATWOOT_DB_NAME:=chatwoot}"
: "${CHATWOOT_DB_USER:=postgres}"

: "${DOCUMENSO_DB_CONTAINER:=}"
: "${DOCUMENSO_DB_NAME:=documenso}"
: "${DOCUMENSO_DB_USER:=documenso}"

: "${POSTAL_DB_CONTAINER:=}"
: "${POSTAL_DB_NAME:=postal}"
: "${POSTAL_DB_USER:=root}"

: "${MOODLE_DB_CONTAINER:=}"
: "${MOODLE_DB_NAME:=moodle}"
: "${MOODLE_DB_USER:=root}"

COOLIFY_DATA="${COOLIFY_DATA:-/data/coolify}"
TRAEFIK_DYNAMIC="${TRAEFIK_DYNAMIC:-/data/coolify/proxy/dynamic}"
TRAEFIK_CERTS="${TRAEFIK_CERTS:-/data/coolify/proxy/certs}"

# ── Setup ────────────────────────────────────────────────────────────────────
TIMESTAMP="$(date +%Y-%m-%d_%H-%M)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
mkdir -p "$BACKUP_DIR"

START_EPOCH=$(date +%s)
declare -a errors=()

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { errors+=("$*"); log "FAIL: $*"; }

# ── Helpers ──────────────────────────────────────────────────────────────────
dump_pg() {
  local label="$1" container="$2" db="$3" user="$4"
  if [[ -z "$container" ]]; then
    log "skip ${label}: container env nieustawiony"
    return 0
  fi
  local out="${BACKUP_DIR}/${label}.sql.gz"
  if docker exec "$container" pg_dump --clean --if-exists -U "$user" "$db" \
       2>/dev/null | gzip -9 > "$out"; then
    log "${label} (PG): $(du -h "$out" | cut -f1)"
  else
    fail "pg_dump ${label} (${container}/${db}) failed"
    rm -f "$out"
  fi
}

dump_mysql() {
  local label="$1" container="$2" db="$3" user="$4"
  if [[ -z "$container" ]]; then
    log "skip ${label}: container env nieustawiony"
    return 0
  fi
  local out="${BACKUP_DIR}/${label}.sql.gz"
  # MYSQL_PWD przekazywane przez env w docker exec (nie w cmdline → leak).
  if docker exec -e MYSQL_PWD "$container" mysqldump \
       --single-transaction --routines --triggers \
       -u "$user" "$db" 2>/dev/null | gzip -9 > "$out"; then
    log "${label} (MariaDB): $(du -h "$out" | cut -f1)"
  else
    fail "mysqldump ${label} (${container}/${db}) failed"
    rm -f "$out"
  fi
}

archive_dir() {
  local label="$1" src="$2"
  if [[ ! -d "$src" ]]; then
    log "skip ${label}: $src nie istnieje"
    return 0
  fi
  local out="${BACKUP_DIR}/${label}.tar.gz"
  if tar -C "$(dirname "$src")" -czf "$out" "$(basename "$src")" 2>/dev/null; then
    log "${label}: $(du -h "$out" | cut -f1)"
  else
    fail "tar ${label} (${src}) failed"
    rm -f "$out"
  fi
}

# ── Faza 1: Database dumps ───────────────────────────────────────────────────
log "=== Database dumps ==="
dump_pg "dashboard"   "$DASHBOARD_DB_CONTAINER" "$DASHBOARD_DB_NAME" "$DASHBOARD_DB_USER"
dump_pg "keycloak"    "$KC_DB_CONTAINER"        "$KC_DB_NAME"        "$KC_DB_USER"
dump_pg "outline"     "$OUTLINE_DB_CONTAINER"   "$OUTLINE_DB_NAME"   "$OUTLINE_DB_USER"
dump_pg "directus"    "$DIRECTUS_DB_CONTAINER"  "$DIRECTUS_DB_NAME"  "$DIRECTUS_DB_USER"
dump_pg "chatwoot"    "$CHATWOOT_DB_CONTAINER"  "$CHATWOOT_DB_NAME"  "$CHATWOOT_DB_USER"
dump_pg "documenso"   "$DOCUMENSO_DB_CONTAINER" "$DOCUMENSO_DB_NAME" "$DOCUMENSO_DB_USER"
dump_mysql "postal"   "$POSTAL_DB_CONTAINER"    "$POSTAL_DB_NAME"    "$POSTAL_DB_USER"
dump_mysql "moodle"   "$MOODLE_DB_CONTAINER"    "$MOODLE_DB_NAME"    "$MOODLE_DB_USER"

# ── Faza 2: Filesystem snapshots ─────────────────────────────────────────────
log "=== Filesystem snapshots ==="
archive_dir "coolify-data"     "$COOLIFY_DATA"
archive_dir "traefik-dynamic"  "$TRAEFIK_DYNAMIC"
archive_dir "traefik-certs"    "$TRAEFIK_CERTS"

# ── Faza 3: Manifest + SHA256 ────────────────────────────────────────────────
log "=== Manifest ==="
MANIFEST="${BACKUP_DIR}/manifest.json"
{
  echo "{"
  echo "  \"timestamp\": \"${TIMESTAMP}\","
  echo "  \"hostname\": \"$(hostname)\","
  echo "  \"errors\": ["
  if (( ${#errors[@]} > 0 )); then
    printf '    "%s"' "${errors[0]}"
    for e in "${errors[@]:1}"; do printf ',\n    "%s"' "$e"; done
  fi
  echo ""
  echo "  ],"
  echo "  \"files\": ["
  cd "$BACKUP_DIR"
  local_first=true
  for f in *.sql.gz *.tar.gz 2>/dev/null; do
    [[ -f "$f" ]] || continue
    if $local_first; then local_first=false; else echo ","; fi
    sha=$(sha256sum "$f" | cut -d' ' -f1)
    size=$(stat -c '%s' "$f")
    printf '    { "name": "%s", "size": %d, "sha256": "%s" }' "$f" "$size" "$sha"
  done
  echo ""
  echo "  ]"
  echo "}"
} > "$MANIFEST"

ARCHIVE_SIZE_BYTES=$(du -sb "$BACKUP_DIR" | cut -f1)
DURATION_SEC=$(( $(date +%s) - START_EPOCH ))

log "Backup zakończony: ${BACKUP_DIR} ($(du -sh "$BACKUP_DIR" | cut -f1), ${DURATION_SEC}s, ${#errors[@]} errors)"

# ── Faza 4: Retencja — kasuj starsze niż RETENTION_DAYS ──────────────────────
log "=== Retencja (>${RETENTION_DAYS} dni) ==="
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -print -exec rm -rf {} \;

# ── Faza 5: Webhook do dashboarda — async notify ─────────────────────────────
STATUS="success"
ERROR_MSG=""
if (( ${#errors[@]} > 0 )); then
  STATUS="partial"
  ERROR_MSG=$(printf '%s; ' "${errors[@]}")
fi

PAYLOAD=$(jq -nc \
  --arg status "$STATUS" \
  --argjson archiveSize "$ARCHIVE_SIZE_BYTES" \
  --argjson durationSec "$DURATION_SEC" \
  --arg destination "$BACKUP_DIR" \
  --arg error "$ERROR_MSG" \
  '{status: $status, archiveSize: $archiveSize, durationSec: $durationSec,
    destination: $destination, error: ($error | select(. != "")) }')

# HMAC-SHA256 signature — oczekiwane przez /api/webhooks/backup
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$BACKUP_WEBHOOK_SECRET" -binary | xxd -p -c 256)

curl -fsS -X POST "${DASHBOARD_URL}/api/webhooks/backup" \
  -H "Content-Type: application/json" \
  -H "X-Backup-Signature: sha256=${SIGNATURE}" \
  -d "$PAYLOAD" \
  --max-time 30 \
  || log "Webhook do dashboarda failed (non-fatal)"

# Exit code: 0 jeśli zero errors, 1 jeśli partial
(( ${#errors[@]} == 0 )) && exit 0 || exit 1

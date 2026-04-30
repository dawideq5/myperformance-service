#!/usr/bin/env bash
#
# MyPerformance — off-site backup sync (rclone → OVH Object Storage S3)
# =====================================================================
#
# Uruchamiane przez cron 30 min po `myperformance-backup.sh` (codziennie 23:30).
# Sync `/backups/myperformance/` → `ovh-s3:<BUCKET>/`.
#
# Wymagania na hoście:
#   - rclone (zakładamy że operator zainstaluje: apt install rclone)
#   - skonfigurowany remote w `/root/.config/rclone/rclone.conf` o nazwie `ovh-s3`
#     (patrz `infrastructure/backup/README.md` sekcja "S3 sync — OVH config")
#   - source `/etc/myperformance-backup.containers` musi zawierać
#     S3_BUCKET=<nazwa_bucketu> (opcjonalnie S3_REMOTE=ovh-s3, S3_PREFIX=/)
#
# Idempotentne:
#   - rclone sync używa atomic upload + checksum, kolejne uruchomienie nie
#     duplikuje plików.
#   - --max-age 7d ogranicza retencję na zdalnym storage do 7 dni
#     (dopasowane do `RETENTION_DAYS=7` w lokalnym backup).
#
# Exit code: 0 gdy sync OK, 1 przy błędzie (cron alertuje przez stderr w log).

set -euo pipefail

# ── Konfiguracja ──────────────────────────────────────────────────────────────
PG_CONTAINERS_FILE="${PG_CONTAINERS_FILE:-/etc/myperformance-backup.containers}"
if [[ -f "$PG_CONTAINERS_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$PG_CONTAINERS_FILE"
fi

BACKUP_ROOT="${BACKUP_ROOT:-/backups/myperformance}"
S3_REMOTE="${S3_REMOTE:-ovh-s3}"
S3_BUCKET="${S3_BUCKET:?S3_BUCKET musi być ustawione (w /etc/myperformance-backup.containers lub env)}"
S3_PREFIX="${S3_PREFIX:-}"
S3_MAX_AGE="${S3_MAX_AGE:-7d}"
S3_TRANSFERS="${S3_TRANSFERS:-4}"

DEST="${S3_REMOTE}:${S3_BUCKET}${S3_PREFIX}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── Pre-flight ───────────────────────────────────────────────────────────────
if ! command -v rclone >/dev/null 2>&1; then
  log "FATAL: rclone nie zainstalowane — apt install rclone"
  exit 1
fi

if [[ ! -d "$BACKUP_ROOT" ]]; then
  log "FATAL: BACKUP_ROOT=$BACKUP_ROOT nie istnieje (czy myperformance-backup.sh już się kiedyś uruchomił?)"
  exit 1
fi

# Sanity: czy remote istnieje w rclone config
if ! rclone listremotes | grep -qx "${S3_REMOTE}:"; then
  log "FATAL: rclone remote '${S3_REMOTE}' nie skonfigurowany — patrz README §S3 sync"
  exit 1
fi

# ── Sync ─────────────────────────────────────────────────────────────────────
log "rclone sync ${BACKUP_ROOT}/ → ${DEST}/  (max-age=${S3_MAX_AGE}, transfers=${S3_TRANSFERS})"

START_EPOCH=$(date +%s)
if rclone sync "${BACKUP_ROOT}/" "${DEST}/" \
     --max-age "${S3_MAX_AGE}" \
     --transfers "${S3_TRANSFERS}" \
     --checksum \
     --stats=30s \
     --stats-one-line; then
  DURATION=$(( $(date +%s) - START_EPOCH ))
  SIZE_BYTES=$(rclone size "${DEST}/" --json 2>/dev/null | grep -o '"bytes":[0-9]*' | head -1 | cut -d: -f2 || echo 0)
  log "OK — sync zakończony, ${DURATION}s, remote total ${SIZE_BYTES} bytes"

  # Webhook do dashboarda (opcjonalny, non-fatal jeśli się nie uda)
  if [[ -n "${BACKUP_WEBHOOK_SECRET:-}" && -n "${DASHBOARD_URL:-}" ]]; then
    PAYLOAD=$(printf '{"status":"success","kind":"s3-sync","destination":"%s","sizeBytes":%s,"durationSec":%d}' \
      "$DEST" "${SIZE_BYTES:-0}" "$DURATION")
    SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$BACKUP_WEBHOOK_SECRET" -binary | xxd -p -c 256)
    curl -fsS -X POST "${DASHBOARD_URL}/api/webhooks/backup" \
      -H "Content-Type: application/json" \
      -H "X-Backup-Signature: sha256=${SIGNATURE}" \
      -d "$PAYLOAD" \
      --max-time 30 \
      || log "Webhook do dashboarda failed (non-fatal)"
  fi
  exit 0
else
  log "FAIL: rclone sync zakończony non-zero exit"
  exit 1
fi

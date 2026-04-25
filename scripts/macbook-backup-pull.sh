#!/usr/bin/env bash
# MacBook side: pull backupów z OVH VPS na lokalne dyski.
#
# Uruchom raz: ten skrypt + LaunchAgent (cron-like na macOS) który odpala
# go np. co godzinę. Backup na VPS robi się o 23:00 UTC, więc każde pull
# po 23:30 UTC dostanie świeży backup.
#
# Wymagania:
#   - SSH key MacBook → ubuntu@57.128.249.245 (skopiuj public key na VPS:
#       ssh-copy-id ubuntu@57.128.249.245)
#   - rsync (default na macOS) lub `brew install rsync` dla nowszej wersji
#   - Folder docelowy: ~/MyPerformance-Backups (utworzony przy pierwszym uruchomieniu)
#
# Restore: po pull, zobacz `~/MyPerformance-Backups/restore.sh`

set -euo pipefail

REMOTE_USER="ubuntu"
REMOTE_HOST="57.128.249.245"
REMOTE_PATH="/backups/myperformance"
LOCAL_PATH="$HOME/MyPerformance-Backups"
LOG_PATH="$LOCAL_PATH/.pull.log"
RETENTION_DAYS=30

mkdir -p "$LOCAL_PATH"
exec >> "$LOG_PATH" 2>&1

echo "=== $(date) — pull start ==="

# 1. Sprawdź dostępność SSH (5s timeout)
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}" 'echo ok' >/dev/null 2>&1; then
  echo "✗ SSH nieosiągalny — pomijam pull"
  exit 1
fi

# 2. Pobierz brakujące katalogi backup (incremental)
# rsync flags:
#   -a   archive (preserve perms, times, etc)
#   -v   verbose
#   --partial   wznów częściowy upload
#   --delete-excluded   usuń lokalne pliki które są w wykluczeniach
#   --exclude .pull.log   nie nadpisuj naszego loga
START=$(date +%s)
rsync -avz --partial --info=stats1 \
  --exclude='.pull.log' \
  --exclude='restore.sh' \
  -e "ssh -o ConnectTimeout=10" \
  "sudo:${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/" \
  "${LOCAL_PATH}/" 2>&1 || {
  # fallback bez sudo (jeśli /backups/myperformance jest readable bez sudo)
  rsync -avz --partial --info=stats1 \
    --exclude='.pull.log' \
    --exclude='restore.sh' \
    -e "ssh -o ConnectTimeout=10" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/" \
    "${LOCAL_PATH}/"
}
END=$(date +%s)

# 3. Lokalna retencja (tylko na MacBook — VPS ma swoją 7-dni)
find "$LOCAL_PATH" -maxdepth 1 -type d -name "20*" -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true

# 4. Lista backupów + suma rozmiar
TOTAL_SIZE=$(du -sh "$LOCAL_PATH" 2>/dev/null | awk '{print $1}')
LATEST=$(ls -1d "$LOCAL_PATH"/20* 2>/dev/null | sort | tail -1)
LATEST_NAME=$(basename "$LATEST" 2>/dev/null || echo "?")

echo "✓ Pull complete: ${TOTAL_SIZE} total · latest: ${LATEST_NAME} · time: $((END - START))s"
echo ""
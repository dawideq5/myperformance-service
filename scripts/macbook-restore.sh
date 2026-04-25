#!/usr/bin/env bash
# MacBook side: restore z lokalnego backup-u na CZYSTY OVH VPS.
#
# Use cases:
#   - Padł serwer i kupujesz nowy VPS
#   - Chcesz cofnąć duże zmiany do określonego punktu w czasie
#   - Migracja na inny VPS
#
# Pre-requirements:
#   - Czysty Ubuntu 22.04+ VPS z dostępem SSH (root lub sudo)
#   - Coolify zainstalowany (skrypt go zainstaluje jeśli brak)
#
# Usage:
#   ./macbook-restore.sh <YYYY-MM-DD_HH-MM> <NEW_VPS_USER@NEW_VPS_IP>
#
# Przykład:
#   ./macbook-restore.sh 2026-04-25_23-00 ubuntu@1.2.3.4

set -euo pipefail

BACKUP_NAME="${1:-}"
TARGET="${2:-}"
LOCAL_BACKUPS="$HOME/MyPerformance-Backups"

if [ -z "$BACKUP_NAME" ] || [ -z "$TARGET" ]; then
  echo "Usage: $0 <YYYY-MM-DD_HH-MM> <user@vps-ip>"
  echo ""
  echo "Dostępne backupy:"
  ls -1 "$LOCAL_BACKUPS" 2>/dev/null | grep "^20" | sort -r | head -10
  exit 1
fi

BACKUP_DIR="$LOCAL_BACKUPS/$BACKUP_NAME"
if [ ! -d "$BACKUP_DIR" ]; then
  echo "✗ Backup $BACKUP_NAME nie istnieje w $LOCAL_BACKUPS"
  exit 1
fi

echo "═══════════════════════════════════════════════════════"
echo "  MyPerformance — Restore"
echo "  Backup: $BACKUP_NAME"
echo "  Target: $TARGET"
echo "═══════════════════════════════════════════════════════"
echo ""
read -p "Kontynuować? Operacja może trwać 10-30 minut. [y/N] " -n 1 -r
echo
[[ ! $REPLY =~ ^[Yy]$ ]] && exit 1

echo ""
echo "▶ Step 1: SSH check + Coolify presence"
if ssh -o ConnectTimeout=10 "$TARGET" 'which docker' >/dev/null 2>&1; then
  echo "  ✓ Docker zainstalowany"
else
  echo "  ✗ Docker brak. Zainstaluj Coolify:"
  echo "    ssh $TARGET 'curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash'"
  exit 1
fi

echo ""
echo "▶ Step 2: Upload backup do /tmp"
rsync -avz --info=progress2 -e ssh "$BACKUP_DIR/" "$TARGET:/tmp/restore-backup/"

echo ""
echo "▶ Step 3: Restore baz danych"
ssh "$TARGET" 'bash -s' <<'REMOTE_RESTORE'
set -e
RESTORE_DIR="/tmp/restore-backup"
[ -d "$RESTORE_DIR/databases" ] || { echo "Brak databases/"; exit 1; }

restore_pg() {
  local file=$1
  local label=$(basename "$file" .sql.gz)
  local container=$(sudo docker ps --format "{{.Names}}" | grep -E "(${label}|postgres-${label}|${label}-db)" | head -1)
  if [ -z "$container" ]; then
    echo "  ⚠ Container dla $label nie istnieje (pomijam — wymagany Coolify deploy najpierw)"
    return
  fi
  local user=$(sudo docker exec "$container" env | grep '^POSTGRES_USER=' | cut -d= -f2-)
  local pwd=$(sudo docker exec "$container" env | grep '^POSTGRES_PASSWORD=' | cut -d= -f2-)
  echo "  ▶ Restore PostgreSQL: $label → $container"
  zcat "$file" | sudo docker exec -i -e PGPASSWORD="$pwd" "$container" psql -U "$user" -d postgres
}

restore_my() {
  local file=$1
  local label=$(basename "$file" .sql.gz)
  local container=$(sudo docker ps --format "{{.Names}}" | grep -E "mariadb.*${label}|${label}.*mariadb" | head -1)
  [ -z "$container" ] && container=$(sudo docker ps --format "{{.Names}}" | grep mariadb | head -1)
  [ -z "$container" ] && { echo "  ⚠ MariaDB container brak"; return; }
  local pwd=$(sudo docker exec "$container" env | grep '^MARIADB_ROOT_PASSWORD=' | cut -d= -f2-)
  echo "  ▶ Restore MariaDB: $label → $container"
  zcat "$file" | sudo docker exec -i -e PWD="$pwd" "$container" sh -c 'mariadb -uroot -p"$PWD"'
}

for f in "$RESTORE_DIR"/databases/*.sql.gz; do
  case "$(basename "$f")" in
    postal.sql.gz|moodle.sql.gz) restore_my "$f" ;;
    *) restore_pg "$f" ;;
  esac
done
echo "✓ Bazy zrestaurowane"
REMOTE_RESTORE

echo ""
echo "▶ Step 4: Restore /data/coolify config"
ssh "$TARGET" "sudo tar -xzf /tmp/restore-backup/coolify-data.tar.gz -C / && echo '✓ coolify config'"

echo ""
echo "▶ Step 5: Restore Step-CA + Traefik certs"
ssh "$TARGET" "
[ -f /tmp/restore-backup/step-ca-data.tar.gz ] && sudo tar -xzf /tmp/restore-backup/step-ca-data.tar.gz -C / && echo '✓ step-ca'
[ -f /tmp/restore-backup/traefik-dynamic.tar.gz ] && sudo tar -xzf /tmp/restore-backup/traefik-dynamic.tar.gz -C / && echo '✓ traefik dynamic'
[ -f /tmp/restore-backup/traefik-certs.tar.gz ] && sudo tar -xzf /tmp/restore-backup/traefik-certs.tar.gz -C / && echo '✓ traefik certs'
"

echo ""
echo "▶ Step 6: Restart Coolify proxy + apek"
ssh "$TARGET" "sudo docker restart coolify-proxy 2>/dev/null || echo 'proxy not running'"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✓ RESTORE COMPLETE"
echo "  Następnie: zaloguj się do Coolify $TARGET, zweryfikuj"
echo "  że apki widzą zrestaurowane DB. Może być wymagane restart"
echo "  każdej apki ręcznie z UI Coolify."
echo "═══════════════════════════════════════════════════════"

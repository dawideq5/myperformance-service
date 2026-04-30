#!/usr/bin/env bash
#
# Chatwoot — bootstrap Platform App permissions (jednorazowo po instalacji).
#
# Chatwoot Platform API może domyślnie zarządzać TYLKO obiektami które sam
# stworzył (konta, userzy). Aby dashboardowy Platform Token mógł edytować
# role/userów stworzonych ręcznie w Chatwoot UI przed podłączeniem IAM,
# trzeba dopisać wpis do tabeli `platform_app_permissibles`.
#
# Dokumentacja: https://www.chatwoot.com/developers/api/#tag/platform_apps
# Raport IAM: sekcja "Rozwiązanie problemu uprawnień platformy".
#
# Wymagania:
#   - dostęp do hosta Coolify z `docker` CLI
#   - uruchomiony kontener Chatwoot Rails (imię wg Coolify compose)
#   - ID konta głównego (typowo 1)
#   - ID zainstalowanej Platform App (z /super_admin/platform_apps)
#
# Użycie:
#   ./scripts/chatwoot-bootstrap-platform-app.sh <chatwoot_container> [account_id] [platform_app_id]
#
# Parametry opcjonalne domyślnie 1. Skrypt jest idempotentny — Rails waliduje
# unikalność pary (platform_app_id, permissible_type, permissible_id).

set -euo pipefail

CONTAINER="${1:-}"
ACCOUNT_ID="${2:-1}"
PLATFORM_APP_ID="${3:-1}"

if [[ -z "$CONTAINER" ]]; then
  echo "Usage: $0 <chatwoot_container> [account_id=1] [platform_app_id=1]" >&2
  echo "" >&2
  echo "Znajdź nazwę kontenera: docker ps --filter 'name=chatwoot' --format '{{.Names}}'" >&2
  exit 2
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "ERROR: kontener ${CONTAINER} nie działa. Sprawdź 'docker ps'." >&2
  exit 3
fi

echo "[*] Pobieram status Platform App #${PLATFORM_APP_ID} w Chatwoot kontenerze ${CONTAINER}..."
docker exec "$CONTAINER" bundle exec rails runner "
  app = PlatformApp.find(${PLATFORM_APP_ID})
  puts \"  PlatformApp: \#{app.name} (id=\#{app.id})\"
  existing = PlatformAppPermissible.where(platform_app_id: app.id)
  puts \"  Istniejące uprawnienia: \#{existing.count}\"
  existing.each { |p| puts \"    - \#{p.permissible_type}##{}\#{p.permissible_id}\" }
" || {
  echo "ERROR: nie można odczytać PlatformApp #${PLATFORM_APP_ID}." >&2
  echo "  1. Zaloguj się do /super_admin/platform_apps i sprawdź ID" >&2
  echo "  2. Jeśli nie ma — stwórz Platform App i zapisz api_access_token jako CHATWOOT_PLATFORM_TOKEN" >&2
  exit 4
}

echo ""
echo "[*] Dopisuję PlatformAppPermissible: app #${PLATFORM_APP_ID} → Account #${ACCOUNT_ID}..."
docker exec "$CONTAINER" bundle exec rails runner "
  app = PlatformApp.find(${PLATFORM_APP_ID})
  account = Account.find(${ACCOUNT_ID})
  permission = PlatformAppPermissible.find_or_create_by!(
    platform_app: app,
    permissible: account,
  )
  puts \"OK — PlatformAppPermissible id=\#{permission.id} (created_at=\#{permission.created_at})\"
"

echo ""
echo "[*] Gotowe. Dashboard IAM ma teraz pełny dostęp do roli users/custom_roles konta ${ACCOUNT_ID}."
echo "    Zweryfikuj: curl -H 'api_access_token: \$CHATWOOT_PLATFORM_TOKEN' \\"
echo "      \"\$CHATWOOT_URL/platform/api/v1/users?q=admin\""

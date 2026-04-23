#!/usr/bin/env bash
# =============================================================================
# bootstrap.sh — playbook po wipe-all.sh.
#
# CEL: Przeprowadza enterprise-clean reinstall wszystkich natywnych aplikacji
#      w ustalonej kolejności dependencies.
#
# ZAŁOŻENIA:
#   - Keycloak + step-ca + dashboard już działają (NIE wipe-uje się ich).
#   - `infrastructure/keycloak/realm.json` jest aktualny — Coolify re-importuje
#     go przy re-deployu (lub `kcadm.sh create-realm -f realm.json`).
#   - Secrets w Coolify (SERVICE_*, *_OIDC_CLIENT_SECRET, *_CLIENT_SECRET)
#     są wygenerowane i nie zmieniły się.
#
# WYKONANIE (po uruchomieniu IAM_WIPE_CONFIRM=1 bash wipe-all.sh):
#   bash scripts/infrastructure/bootstrap.sh
#
# Alternatywnie: każdy krok uruchom manualnie w Coolify UI (Redeploy per service).
# =============================================================================

set -euo pipefail

ORDER=(
  postal      # potrzebny przez inne apki jako SMTP relay
  directus    # niezależny
  outline     # potrzebuje postal dla maili
  documenso   # potrzebuje postal dla maili + webhooków
  chatwoot    # potrzebuje postal dla maili
  moodle      # potrzebuje postal dla maili
)

echo "[bootstrap] Enterprise reinstall order: ${ORDER[*]}"
echo
echo "Co ten skrypt robi:"
echo "  1. Redeploys Keycloak (żeby zaimportował nowy realm.json z clientami)"
echo "  2. Redeploys każdą apkę w kolejności"
echo "  3. Czeka na health (healthcheck w compose) przed następną"
echo

# Coolify CLI nie jest standard — większość deploy-ów trzeba robić z UI.
# Tutaj jest tylko sequencer — faktyczne wywołanie deploy delegujemy do
# użytkownika (echo INSTRUKCJE), chyba że masz Coolify API token.
#
# Jeśli chcesz automatyzacji: ustaw COOLIFY_API_URL + COOLIFY_API_TOKEN
# i odkomentuj sekcję `coolify_redeploy`.

coolify_redeploy() {
  local slug="$1"
  if [ -z "${COOLIFY_API_TOKEN:-}" ] || [ -z "${COOLIFY_API_URL:-}" ]; then
    echo "  → Manualnie: w Coolify UI kliknij Redeploy dla serwisu '${slug}'"
    return 0
  fi
  echo "  → Coolify API redeploy: ${slug}"
  curl -fsS -X POST \
    -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
    "${COOLIFY_API_URL%/}/api/v1/deploy?tag=${slug}" \
    >/dev/null
}

wait_for_https() {
  local url="$1"
  echo "  ... czekam na ${url} (healthcheck)"
  for i in $(seq 1 60); do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then
      echo "  OK (${i}s)"
      return 0
    fi
    sleep 5
  done
  echo "  WARN: ${url} nie odpowiada po 5min — sprawdź logi w Coolify"
  return 1
}

echo "=== step 1: Redeploy Keycloak (re-import realm.json) ==="
coolify_redeploy keycloak
wait_for_https https://auth.myperformance.pl/realms/MyPerformance/.well-known/openid-configuration || true

for app in "${ORDER[@]}"; do
  echo
  echo "=== step: ${app} ==="
  coolify_redeploy "${app}"
  case "${app}" in
    postal)     wait_for_https https://postal.myperformance.pl/login || true ;;
    directus)   wait_for_https https://cms.myperformance.pl/server/health || true ;;
    outline)    wait_for_https https://knowledge.myperformance.pl/_health || true ;;
    documenso)  wait_for_https https://sign.myperformance.pl/ || true ;;
    chatwoot)   wait_for_https https://chat.myperformance.pl/ || true ;;
    moodle)     wait_for_https https://moodle.myperformance.pl/login/index.php || true ;;
  esac
done

echo
echo "=== step: post-install ==="
echo "Chatwoot: pobierz token z logów 'chatwoot-bootstrap' sidecara i wpisz do envów dashboardu:"
echo "  docker logs \$(docker ps -af name=chatwoot-bootstrap --format '{{.ID}}' | head -1)"
echo "  → skopiuj CHATWOOT_PLATFORM_TOKEN + CHATWOOT_ACCOUNT_ID do myperformance-service"
echo
echo "Moodle: przejdź do Administracja → Server → Web services → Enable → Create token dla admina."
echo "  → skopiuj token do MOODLE_API_TOKEN"
echo
echo "Documenso: po zalogowaniu jako realm-admin stwórz Organisation."
echo "  → skopiuj Organisation UUID do DOCUMENSO_ORGANISATION_ID"
echo "  → (opcjonalnie) stwórz Team wewnątrz Org → DOCUMENSO_TEAM_ID"
echo
echo "Directus: po zalogowaniu jako admin utwórz rolę Administrator w Settings → Access Control."
echo "  → skopiuj UUID roli do DIRECTUS_DEFAULT_ROLE_ID"
echo
echo "Postal: zaloguj się przez SSO jako keycloak_admin — Postal UI automatycznie nadaje pierwszemu userowi admin."
echo "  → (opcjonalnie) dodaj klucz API dla monitoringu"
echo
echo "Dashboard: w /admin/users kliknij 'Synchronizuj role z Keycloak' — zsynchronizuje"
echo "nową taksonomię ról do realmu. Następnie 'Testuj wszystkich' — sprawdzi czy wszystkie"
echo "providery odpowiadają."
echo
echo "[bootstrap] DONE. Ekosystem czyszczony i reinstalowany z enterprise-clean configami."

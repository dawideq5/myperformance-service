#!/usr/bin/env bash
set -euo pipefail

# coolify-deploy-keycloak-theme.sh
# Builds the Keycloakify theme JAR and uploads it to the production
# Keycloak managed by Coolify, then restarts the service.
#
# Required env:
#   COOLIFY_BASE_URL        e.g. https://coolify.myperformance.pl
#   COOLIFY_API_TOKEN       Coolify API bearer token
#   COOLIFY_KC_SERVICE_UUID UUID of the Keycloak "service" in Coolify
#
# Coolify API v1 does not expose an exec-in-container endpoint, so the
# JAR must be delivered either by (a) a compose-level mount configured
# once per service, (b) a public HTTP URL consumed by a Keycloak init
# command, or (c) SSH access to the Coolify host. This script handles
# step 1 (build + optional restart) and prints the expected JAR path
# for whichever transport you've chosen.

: "${COOLIFY_BASE_URL:?set COOLIFY_BASE_URL}"
: "${COOLIFY_API_TOKEN:?set COOLIFY_API_TOKEN}"
: "${COOLIFY_KC_SERVICE_UUID:?set COOLIFY_KC_SERVICE_UUID}"

cd "$(dirname "$0")/.."

echo "[1/3] Building Keycloakify theme…"
npm run build-keycloak-theme >/dev/null

JAR="build_keycloak/keycloak-theme-for-kc-all-other-versions.jar"
test -s "$JAR" || { echo "JAR missing: $JAR" >&2; exit 1; }
echo "  -> $JAR ($(du -h "$JAR" | cut -f1))"

TARGET_PATH="/opt/keycloak/providers/myperformance-theme.jar"
echo "[2/3] JAR ready. Deliver to Keycloak at: $TARGET_PATH"
echo "     (upload via the transport configured for the service)"

echo "[3/3] Restarting Keycloak service via Coolify API…"
RESTART_URL="$COOLIFY_BASE_URL/api/v1/services/$COOLIFY_KC_SERVICE_UUID/restart"
HTTP=$(curl -sS -o /tmp/coolify_restart.json -w "%{http_code}" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN" "$RESTART_URL")
echo "  -> HTTP $HTTP"
test "$HTTP" = "200" || { cat /tmp/coolify_restart.json; exit 1; }

echo "Done. Poll $COOLIFY_BASE_URL or https://auth.myperformance.pl/health/ready"

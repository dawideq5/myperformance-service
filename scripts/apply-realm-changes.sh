#!/usr/bin/env bash
# Idempotent Keycloak realm sync for MyPerformance panels.
#
# Ensures the 3 confidential OIDC clients (panel-sprzedawca/serwisant/
# kierowca) and the matching realm roles (sprzedawca, serwisant, kierowca)
# exist in the target realm. Safe to run multiple times: 201 means created,
# 409 means already exists.
#
# Env vars:
#   KC_URL               Base URL of Keycloak (e.g. https://auth.myperformance.pl)
#   KC_ADMIN_USER        master realm admin username
#   KC_ADMIN_PASS        master realm admin password
#   KC_REALM             target realm (default: MyPerformance)
#   PANEL_SPRZEDAWCA_CLIENT_SECRET
#   PANEL_SERWISANT_CLIENT_SECRET
#   PANEL_KIEROWCA_CLIENT_SECRET
#
# Usage:
#   env $(cat .env.local | xargs) bash scripts/apply-realm-changes.sh

set -euo pipefail

KC_URL="${KC_URL:?KC_URL is required}"
KC_ADMIN_USER="${KC_ADMIN_USER:?KC_ADMIN_USER is required}"
KC_ADMIN_PASS="${KC_ADMIN_PASS:?KC_ADMIN_PASS is required}"
KC_REALM="${KC_REALM:-MyPerformance}"

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 1; }; }
need_cmd curl
need_cmd jq

log() { printf '[apply-realm] %s\n' "$*"; }

log "Authenticating against ${KC_URL} as ${KC_ADMIN_USER}..."
TOKEN="$(curl -fsS -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d grant_type=password \
  -d client_id=admin-cli \
  -d "username=${KC_ADMIN_USER}" \
  --data-urlencode "password=${KC_ADMIN_PASS}" | jq -r .access_token)"
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || { echo "Failed to obtain admin token" >&2; exit 1; }

AUTH_HDR=(-H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json")

http_code() {
  # $1 = method, $2 = path, $3 = body (optional)
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -o /dev/null -w '%{http_code}' -X "$method" "${AUTH_HDR[@]}" \
      "${KC_URL}${path}" --data "$body"
  else
    curl -sS -o /dev/null -w '%{http_code}' -X "$method" "${AUTH_HDR[@]}" \
      "${KC_URL}${path}"
  fi
}

create_role() {
  local name="$1" description="$2"
  local body
  body=$(jq -n --arg n "$name" --arg d "$description" \
    '{name:$n,description:$d,composite:false,clientRole:false,attributes:{}}')
  local code
  code=$(http_code POST "/admin/realms/${KC_REALM}/roles" "$body")
  case "$code" in
    201) log "role '${name}' created" ;;
    409) log "role '${name}' already exists" ;;
    *)   echo "unexpected status ${code} creating role ${name}" >&2; exit 1 ;;
  esac
}

create_client() {
  local client_id="$1" display_name="$2" host="$3" secret_env="$4" local_port="$5"
  local secret="${!secret_env:-}"
  if [[ -z "$secret" ]]; then
    echo "Missing env ${secret_env} for client ${client_id}" >&2
    exit 1
  fi
  local body
  body=$(jq -n \
    --arg cid "$client_id" \
    --arg name "$display_name" \
    --arg host "$host" \
    --arg secret "$secret" \
    --arg port "$local_port" \
    '{
       clientId: $cid,
       name: $name,
       enabled: true,
       clientAuthenticatorType: "client-secret",
       secret: $secret,
       publicClient: false,
       standardFlowEnabled: true,
       implicitFlowEnabled: false,
       directAccessGrantsEnabled: false,
       serviceAccountsEnabled: false,
       frontchannelLogout: true,
       protocol: "openid-connect",
       rootUrl: ("https://" + $host),
       baseUrl: "/",
       redirectUris: [
         ("https://" + $host + "/api/auth/callback/keycloak"),
         ("http://localhost:" + $port + "/api/auth/callback/keycloak")
       ],
       webOrigins: ["+"],
       attributes: {
         "post.logout.redirect.uris": ("https://" + $host + "/*##http://localhost:" + $port + "/*"),
         "pkce.code.challenge.method": "S256",
         "backchannel.logout.session.required": "true"
       },
       fullScopeAllowed: true,
       defaultClientScopes: ["web-origins","acr","profile","roles","basic","email"],
       optionalClientScopes: ["offline_access","phone","address","microprofile-jwt"]
     }')
  local code
  code=$(http_code POST "/admin/realms/${KC_REALM}/clients" "$body")
  case "$code" in
    201) log "client '${client_id}' created" ;;
    409) log "client '${client_id}' already exists — leaving as-is" ;;
    *)   echo "unexpected status ${code} creating client ${client_id}" >&2; exit 1 ;;
  esac
}

log "Creating realm roles..."
create_role "sprzedawca" "Dostęp do Panelu Sprzedawcy (cert-gated)"
create_role "serwisant" "Dostęp do Panelu Serwisanta (cert-gated)"
create_role "kierowca" "Dostęp do Panelu Kierowcy (cert-gated)"

log "Creating panel clients..."
create_client "panel-sprzedawca" "Panel Sprzedawcy" \
  "panelsprzedawcy.myperformance.pl" "PANEL_SPRZEDAWCA_CLIENT_SECRET" "3001"
create_client "panel-serwisant" "Panel Serwisanta" \
  "panelserwisanta.myperformance.pl" "PANEL_SERWISANT_CLIENT_SECRET" "3002"
create_client "panel-kierowca" "Panel Kierowcy" \
  "panelkierowcy.myperformance.pl" "PANEL_KIEROWCA_CLIENT_SECRET" "3003"

log "Done."

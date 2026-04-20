#!/usr/bin/env bash
# Trigger Coolify deployments for one or more apps in parallel.
#
# Coolify is wired to auto-deploy each app on push to main, but that
# depends on per-app git webhook configuration. This script is the
# explicit, idempotent fallback: it calls the Coolify API directly so
# every affected panel is rebuilt regardless of webhook state.
#
# Required env:
#   COOLIFY_BASE_URL     e.g. https://coolify.myperformance.pl
#   COOLIFY_API_TOKEN    Coolify API bearer token (Settings → API tokens)
#
# Per-app UUIDs (only those you want to deploy need be set):
#   COOLIFY_DASHBOARD_UUID
#   COOLIFY_DOKUMENTY_UUID
#   COOLIFY_SPRZEDAWCA_UUID
#   COOLIFY_SERWISANT_UUID
#   COOLIFY_KIEROWCA_UUID
#
# Usage:
#   scripts/coolify-deploy.sh                       # deploys every app with a UUID set
#   scripts/coolify-deploy.sh dashboard dokumenty   # deploys the listed apps only
#   FORCE=1 scripts/coolify-deploy.sh dokumenty     # force rebuild (ignore cache)

set -euo pipefail

: "${COOLIFY_BASE_URL:?set COOLIFY_BASE_URL}"
: "${COOLIFY_API_TOKEN:?set COOLIFY_API_TOKEN}"

FORCE="${FORCE:-0}"

declare -A UUIDS=(
  [dashboard]="${COOLIFY_DASHBOARD_UUID:-}"
  [dokumenty]="${COOLIFY_DOKUMENTY_UUID:-}"
  [sprzedawca]="${COOLIFY_SPRZEDAWCA_UUID:-}"
  [serwisant]="${COOLIFY_SERWISANT_UUID:-}"
  [kierowca]="${COOLIFY_KIEROWCA_UUID:-}"
)

if [[ $# -gt 0 ]]; then
  requested=("$@")
else
  requested=()
  for name in "${!UUIDS[@]}"; do
    [[ -n "${UUIDS[$name]}" ]] && requested+=("$name")
  done
fi

if [[ ${#requested[@]} -eq 0 ]]; then
  echo "nothing to deploy — set at least one COOLIFY_*_UUID or pass app names as arguments" >&2
  exit 1
fi

deploy_one() {
  local name="$1"
  local uuid="${UUIDS[$name]:-}"
  if [[ -z "$uuid" ]]; then
    echo "skip ${name}: UUID not set (COOLIFY_$(echo ${name} | tr '[:lower:]' '[:upper:]')_UUID)" >&2
    return 2
  fi
  local url="${COOLIFY_BASE_URL}/api/v1/deploy?uuid=${uuid}&force=${FORCE}"
  local body http
  body="$(mktemp)"
  http=$(curl -sS -o "$body" -w '%{http_code}' -X GET \
    -H "Authorization: Bearer ${COOLIFY_API_TOKEN}" \
    "$url")
  if [[ "$http" =~ ^2 ]]; then
    echo "[${name}] queued ($http): $(cat "$body")"
  else
    echo "[${name}] FAILED ($http): $(cat "$body")" >&2
    rm -f "$body"
    return 1
  fi
  rm -f "$body"
}

rc=0
for name in "${requested[@]}"; do
  deploy_one "$name" || rc=1
done
exit $rc

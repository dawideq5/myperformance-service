#!/usr/bin/env bash
# Renders infrastructure/traefik/wazuh-webhook.yml.template
# (with ${COOLIFY_DASHBOARD_UUID} placeholder) into wazuh-webhook.yml
# (production-ready, hardcoded UUID).
#
# Coolify deploys plain Traefik dynamic config files — nie wspiera env
# substitution po stronie servera. Dlatego trzymamy kanoniczny plik
# `wazuh-webhook.yml` w git z hardcoded UUID, ale generujemy go z
# template + .env żeby było jawne skąd ta wartość pochodzi.
#
# Po regeneracji (po zmianie UUID dashboardu w Coolify):
#   1. Uruchom ten skrypt
#   2. `git diff infrastructure/traefik/wazuh-webhook.yml`
#   3. Commit + Coolify redeploy Traefika żeby przeładował config
#
# Wymagania: bash, envsubst (gnu gettext) lub sed fallback.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${REPO_ROOT}/infrastructure/traefik/wazuh-webhook.yml.template"
OUTPUT="${REPO_ROOT}/infrastructure/traefik/wazuh-webhook.yml"
ENV_FILE="${REPO_ROOT}/.env"

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "[render-traefik-config] BRAK template: ${TEMPLATE}" >&2
  exit 1
fi

# Akceptujemy COOLIFY_DASHBOARD_UUID albo z env (CI/CD), albo z .env.
# Jeśli niedostępne — exit z hint'em jak ustawić.
COOLIFY_DASHBOARD_UUID="${COOLIFY_DASHBOARD_UUID:-}"

if [[ -z "${COOLIFY_DASHBOARD_UUID}" && -f "${ENV_FILE}" ]]; then
  # Wczytaj tylko COOLIFY_DASHBOARD_UUID z .env (bez całego sourcingu — bezpieczniej)
  COOLIFY_DASHBOARD_UUID="$(grep -E '^COOLIFY_DASHBOARD_UUID=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi

if [[ -z "${COOLIFY_DASHBOARD_UUID}" ]]; then
  echo "[render-traefik-config] COOLIFY_DASHBOARD_UUID nie jest ustawiony" >&2
  echo "[render-traefik-config] Ustaw albo w .env (COOLIFY_DASHBOARD_UUID=...)" >&2
  echo "[render-traefik-config] albo jako env var: COOLIFY_DASHBOARD_UUID=xxx $0" >&2
  exit 1
fi

export COOLIFY_DASHBOARD_UUID

if command -v envsubst >/dev/null 2>&1; then
  envsubst '${COOLIFY_DASHBOARD_UUID}' < "${TEMPLATE}" > "${OUTPUT}"
else
  # Fallback sed gdy envsubst nieobecny (np. czysty alpine)
  sed "s|\${COOLIFY_DASHBOARD_UUID}|${COOLIFY_DASHBOARD_UUID}|g" "${TEMPLATE}" > "${OUTPUT}"
fi

echo "[render-traefik-config] wyrenderowane: ${OUTPUT}"
echo "[render-traefik-config] UUID użyte: ${COOLIFY_DASHBOARD_UUID}"

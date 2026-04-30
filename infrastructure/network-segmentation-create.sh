#!/usr/bin/env bash
#
# Network segmentation — Step 1 (create networks).
# Idempotent: jeśli sieć już istnieje, skip + log.
#
# Uruchomienie na VPS (jako root, sudo lub w docker-group):
#   sudo bash infrastructure/network-segmentation-create.sh
#
# Po skutku: 11 nowych sieci Docker:
#   - mp_public (bridge, Traefik + wazuh-webhook receiver)
#   - mp_auth (bridge, dashboard + KC + panele)
#   - mp_admin (bridge, Wazuh + step-ca + Coolify)
#   - mp_data_dashboard (bridge, internal=true)
#   - mp_data_keycloak (internal)
#   - mp_data_outline (internal)
#   - mp_data_directus (internal)
#   - mp_data_chatwoot (internal)
#   - mp_data_documenso (internal)
#   - mp_data_postal (internal)
#   - mp_data_moodle (internal)
#
# `internal: true` na data-zone networks zapewnia że containers nie mogą
# wyjść na internet — DB-y nie potrzebują outbound.

set -euo pipefail

PUBLIC_ZONE="mp_public"
AUTH_ZONE="mp_auth"
ADMIN_ZONE="mp_admin"

DATA_ZONES=(
  "mp_data_dashboard"
  "mp_data_keycloak"
  "mp_data_outline"
  "mp_data_directus"
  "mp_data_chatwoot"
  "mp_data_documenso"
  "mp_data_postal"
  "mp_data_moodle"
)

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

ensure_network() {
  local name="$1"
  shift
  if docker network inspect "$name" >/dev/null 2>&1; then
    log "skip $name (already exists)"
    return 0
  fi
  log "creating $name $*"
  docker network create "$@" "$name"
}

# Public zone — Traefik routes inbound traffic from internet
ensure_network "$PUBLIC_ZONE" --driver bridge \
  --label "myperformance.zone=public" \
  --label "myperformance.purpose=traefik+inbound"

# Auth zone — dashboard ⇄ KC ⇄ panele (mTLS-gated)
ensure_network "$AUTH_ZONE" --driver bridge \
  --label "myperformance.zone=auth" \
  --label "myperformance.purpose=oidc+sessions"

# Admin zone — Wazuh, step-ca, Coolify (no inbound from public)
ensure_network "$ADMIN_ZONE" --driver bridge \
  --label "myperformance.zone=admin" \
  --label "myperformance.purpose=siem+pki+orchestrator"

# Data zones — internal only (no outbound to internet)
for zone in "${DATA_ZONES[@]}"; do
  ensure_network "$zone" --driver bridge --internal \
    --label "myperformance.zone=data" \
    --label "myperformance.app=${zone#mp_data_}" \
    --label "myperformance.purpose=db-backend"
done

log "OK — wszystkie sieci utworzone (lub już istniały)"
log "Następny krok: Step 2 — connect kontenerów (patrz infrastructure/network-segmentation.md §5)"

# Lista finalna
echo
echo "Sieci myperformance:"
docker network ls --filter "label=myperformance.zone" --format "table {{.Name}}\t{{.Driver}}\t{{.Scope}}\t{{.IPv6}}"

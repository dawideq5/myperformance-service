#!/usr/bin/env bash
#
# Network segmentation — ROLLBACK.
# Odpinanie wszystkich kontenerów z mp_* sieci i ich usunięcie.
#
# Uruchomienie na VPS:
#   sudo bash infrastructure/network-segmentation-rollback.sh [--dry-run]
#
# UWAGA: po rollback kontenery wracają do oryginalnych sieci proxy-network +
# myperformance_backend. Te sieci MUSZĄ jeszcze istnieć — w czasie
# segmentation rollout nie usuwamy ich aż do Step 5.
#
# DRY-RUN: --dry-run pokazuje co zostanie zrobione bez wykonywania.

set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  echo "[DRY-RUN] Tryb podglądu — żadne zmiany nie będą wykonane."
fi

run() {
  if (( DRY_RUN )); then
    echo "[DRY-RUN] $*"
  else
    echo "[exec] $*"
    "$@"
  fi
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Lista sieci mp_* do rollback
NETWORKS=$(docker network ls --filter "label=myperformance.zone" --format "{{.Name}}")

if [[ -z "$NETWORKS" ]]; then
  log "Brak sieci mp_* — nic do rollback."
  exit 0
fi

# Per sieć: disconnect wszystkich kontenerów + usuń sieć
for net in $NETWORKS; do
  log "Processing $net..."
  containers=$(docker network inspect "$net" --format '{{range $k,$v := .Containers}}{{$v.Name}} {{end}}')
  if [[ -n "$containers" ]]; then
    log "  Connected: $containers"
    for c in $containers; do
      run docker network disconnect "$net" "$c"
    done
  fi
  run docker network rm "$net"
done

log "Rollback ukończony. Sprawdź czy kontenery są nadal w proxy-network + myperformance_backend:"
log "  docker network inspect proxy-network --format '{{range \$k,\$v := .Containers}}{{\$v.Name}}{{println}}{{end}}'"

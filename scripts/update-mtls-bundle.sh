#!/usr/bin/env bash
# Rebuild the Traefik client-cert trust bundle used by all cert-gated panels.
#
# step-ca issues client leaves signed by an *intermediate* CA, so Traefik
# (RequireAndVerifyClientCert) must be able to chain leaf → intermediate → root.
# Our .p12 files don't embed the chain (node-forge 1.x can't pack the EC
# intermediate), therefore Traefik must hold BOTH intermediate and root in
# its caFiles bundle.
#
# Usage (run on the VPS):
#   sudo bash update-mtls-bundle.sh
#
# Env overrides:
#   STEP_CA_CONTAINER_NAME   default: step-ca
#   COOLIFY_PROXY_CERTS_DIR  default: /data/coolify/proxy/certs
#   BUNDLE_FILE              default: myperformance-ca.pem
#   COOLIFY_PROXY_NAME       default: coolify-proxy

set -euo pipefail

STEP_CONTAINER="${STEP_CA_CONTAINER_NAME:-step-ca}"
CERTS_DIR="${COOLIFY_PROXY_CERTS_DIR:-/data/coolify/proxy/certs}"
BUNDLE="${BUNDLE_FILE:-myperformance-ca.pem}"
PROXY_NAME="${COOLIFY_PROXY_NAME:-coolify-proxy}"

step_cid="$(docker ps -qf "name=${STEP_CONTAINER}" | head -n1)"
if [ -z "$step_cid" ]; then
  echo "ERROR: step-ca container not found (name filter: ${STEP_CONTAINER})" >&2
  exit 1
fi

mkdir -p "$CERTS_DIR"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

docker exec "$step_cid" cat /home/step/certs/root_ca.crt          >  "$tmp"
docker exec "$step_cid" cat /home/step/certs/intermediate_ca.crt  >> "$tmp"

# Sanity check — two PEM blocks expected.
blocks="$(grep -c 'BEGIN CERTIFICATE' "$tmp" || true)"
if [ "$blocks" -lt 2 ]; then
  echo "ERROR: expected root + intermediate, got ${blocks} certificate block(s)" >&2
  exit 2
fi

mv "$tmp" "${CERTS_DIR}/${BUNDLE}"
chmod 0644 "${CERTS_DIR}/${BUNDLE}"
echo "Wrote ${CERTS_DIR}/${BUNDLE} (${blocks} CA certs)."

proxy_cid="$(docker ps -qf "name=${PROXY_NAME}" | head -n1)"
if [ -n "$proxy_cid" ]; then
  docker kill --signal=HUP "$proxy_cid" >/dev/null
  echo "Reloaded Traefik (${PROXY_NAME})."
else
  echo "WARN: Traefik proxy container not found — reload manually." >&2
fi

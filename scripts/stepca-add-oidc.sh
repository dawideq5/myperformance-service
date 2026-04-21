#!/usr/bin/env bash
# Atomically switch step-ca from admin-API-managed provisioners to a static
# ca.json-managed list that includes the existing JWK provisioner plus a new
# OIDC provisioner bound to Keycloak's stepca-oidc client.
#
# Rollback is automatic on any failure — step-ca's /health endpoint is probed
# after restart; if it does not come up, the previous ca.json is restored.
#
# Required env:
#   STEPCA_CONTAINER   name of the running step-ca container
#   STEPCA_CLIENT_SECRET   the Keycloak stepca-oidc client_secret
#   STEPCA_ADMIN_EMAIL     email that gets --admin in the new OIDC provisioner
#
# Run this on the VPS (has `docker` + `jq`).
set -euo pipefail

: "${STEPCA_CONTAINER:?}"
: "${STEPCA_CLIENT_SECRET:?}"
: "${STEPCA_ADMIN_EMAIL:?}"
: "${KEYCLOAK_ISSUER:=https://auth.myperformance.pl/realms/MyPerformance}"
: "${DOMAINS:=myperformance.pl,gmail.com}"

cd /tmp
echo "[stepca] dumping current ca.json + JWK provisioner..."
docker exec "$STEPCA_CONTAINER" cat /home/step/config/ca.json > /tmp/stepca_ca.json.bak
docker exec "$STEPCA_CONTAINER" step ca provisioner list \
  --ca-url=https://localhost:9000 \
  --root=/home/step/certs/root_ca.crt > /tmp/stepca_provs.json

JWK_PROV=$(jq '.[] | select(.type == "JWK" and .name == "admin@myperformance.pl")' /tmp/stepca_provs.json)
if [[ -z "$JWK_PROV" ]]; then
  echo "[stepca] FATAL: JWK provisioner admin@myperformance.pl not found" >&2
  exit 1
fi

# Build domain array from comma-separated STEPCA_DOMAINS.
DOMAINS_JSON=$(python3 -c "import json,sys,os; print(json.dumps([d.strip() for d in os.environ['DOMAINS'].split(',') if d.strip()]))")

OIDC_PROV=$(jq -n \
  --arg clientID "stepca-oidc" \
  --arg clientSecret "$STEPCA_CLIENT_SECRET" \
  --arg configEp "${KEYCLOAK_ISSUER}/.well-known/openid-configuration" \
  --arg admin "$STEPCA_ADMIN_EMAIL" \
  --argjson domains "$DOMAINS_JSON" \
  '{
    type: "OIDC",
    name: "keycloak",
    clientID: $clientID,
    clientSecret: $clientSecret,
    configurationEndpoint: $configEp,
    admins: [$admin],
    domains: $domains,
    listenAddress: ":10000",
    claims: {
      minTLSCertDuration: "5m",
      maxTLSCertDuration: "87600h",
      defaultTLSCertDuration: "8760h"
    }
  }')

# Rebuild ca.json: drop enableAdmin, add authority.provisioners + claims.
jq \
  --argjson jwk "$JWK_PROV" \
  --argjson oidc "$OIDC_PROV" \
  'del(.authority.enableAdmin)
   | .authority.claims = {
       minTLSCertDuration: "5m",
       maxTLSCertDuration: "87600h",
       defaultTLSCertDuration: "8760h"
     }
   | .authority.provisioners = [$jwk, $oidc]' \
  /tmp/stepca_ca.json.bak > /tmp/stepca_ca.json.new

echo "[stepca] new ca.json provisioners:"
jq '.authority.provisioners | map({type, name})' /tmp/stepca_ca.json.new

# Push new config + restart.
docker cp /tmp/stepca_ca.json.new "$STEPCA_CONTAINER":/home/step/config/ca.json
echo "[stepca] restarting container..."
docker restart "$STEPCA_CONTAINER" > /dev/null

# Wait for /health.
for i in $(seq 1 30); do
  if docker exec "$STEPCA_CONTAINER" wget -q -O- --no-check-certificate https://localhost:9000/health 2>/dev/null | grep -q 'ok'; then
    echo "[stepca] /health OK on attempt $i"
    docker exec "$STEPCA_CONTAINER" step ca provisioner list \
      --ca-url=https://localhost:9000 \
      --root=/home/step/certs/root_ca.crt | jq 'map({type, name})'
    echo "[stepca] success"
    exit 0
  fi
  sleep 1
done

echo "[stepca] step-ca did not come back up — rolling back ca.json"
docker cp /tmp/stepca_ca.json.bak "$STEPCA_CONTAINER":/home/step/config/ca.json
docker restart "$STEPCA_CONTAINER" > /dev/null
for i in $(seq 1 30); do
  if docker exec "$STEPCA_CONTAINER" wget -q -O- --no-check-certificate https://localhost:9000/health 2>/dev/null | grep -q 'ok'; then
    echo "[stepca] rollback /health OK"
    exit 2
  fi
  sleep 1
done
echo "[stepca] ROLLBACK ALSO FAILED — MANUAL INTERVENTION REQUIRED"
exit 3

#!/usr/bin/env bash
# Tworzy publiczny URL dla lokalnego dev serwera aby webhooks (Keycloak,
# Chatwoot, Moodle) mogły docierać do localhost:3000.
# Wymaga ngrok (brew install ngrok) lub cloudflared (brew install cloudflare/cloudflare/cloudflared).

set -e

if command -v cloudflared &>/dev/null; then
  echo "🌐 Cloudflare Tunnel → http://localhost:3000"
  echo "   Skopiuj URL i ustaw jako WEBHOOK_TUNNEL_URL w .env.hybrid"
  cloudflared tunnel --url http://localhost:3000
elif command -v ngrok &>/dev/null; then
  echo "🌐 ngrok → http://localhost:3000"
  ngrok http 3000
else
  echo "❌ Zainstaluj ngrok lub cloudflared:"
  echo "   brew install ngrok"
  echo "   brew install cloudflare/cloudflare/cloudflared"
  exit 1
fi

#!/usr/bin/env bash
# ============================================================
# Uruchamia środowisko hybrydowe:
#   - lokalny Next.js dev server (hot reload)
#   - zdalne usługi na serwerze myperformance.pl
#   - opcjonalny SSH tunnel dla baz danych
#
# Użycie:
#   ./scripts/dev-hybrid.sh          # bez tunnelu
#   ./scripts/dev-hybrid.sh --tunnel  # z SSH tunnel do DB
# ============================================================

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.hybrid"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Brak .env.hybrid. Skopiuj .env.hybrid z .env.example i uzupełnij sekrety."
  exit 1
fi

# Merge .env.local (sekrety) z .env.hybrid (konfiguracja dev)
# .env.hybrid ma priorytet dla URL-i i trybów
if [ -f "$ROOT/.env.local" ]; then
  echo "✓ Mergowanie sekretów z .env.local"
  # Eksportuj zmienne z .env.local które NIE są w .env.hybrid (sekrety)
  set -a
  source "$ROOT/.env.local" 2>/dev/null || true
  source "$ROOT/.env.hybrid"  # override URLs i tryby
  set +a
else
  echo "⚠️  Brak .env.local — sekrety nie będą dostępne"
  set -a
  source "$ENV_FILE"
  set +a
fi

# Opcjonalny SSH tunnel do bazy danych
if [ "$1" = "--tunnel" ]; then
  echo "🔗 Uruchamiam SSH tunnel do bazy danych na porcie 5433..."
  ssh -N -o StrictHostKeyChecking=no \
      -L 5433:127.0.0.1:5432 \
      ubuntu@57.128.249.245 \
      -i ~/.ssh/id_rsa 2>/dev/null &
  TUNNEL_PID=$!
  echo "✓ Tunnel PID: $TUNNEL_PID (Ctrl+C zatrzyma all)"

  # Nadpisz DATABASE_URL na tunel
  export DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD:-postgres}@localhost:5433/myperformance"

  trap "kill $TUNNEL_PID 2>/dev/null; echo '🛑 Tunnel zamknięty'" EXIT
fi

echo ""
echo "🚀 Startuje Next.js dev server..."
echo "   Dashboard:  http://localhost:3000"
echo "   Keycloak:   https://auth.myperformance.pl"
echo "   Directus:   https://cms.myperformance.pl"
echo "   Dev mode:   DEV_CERT_BYPASS=true (panele bez certu)"
echo ""

cd "$ROOT"
exec npx next dev --port 3000

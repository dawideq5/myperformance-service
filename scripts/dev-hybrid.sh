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

# SSH tunnel do bazy danych — zawsze włączony (DB jest na wewnętrznej sieci Dockera)
echo "🔗 Uruchamiam SSH tunnel → myperformance-dashboard-db:5432 → localhost:5433..."
ssh -N -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
    -L 5433:myperformance-dashboard-db:5432 \
    ubuntu@57.128.249.245 2>/dev/null &
TUNNEL_PID=$!
sleep 2

# Sprawdź czy tunel działa
if ! nc -z localhost 5433 2>/dev/null; then
  echo "⚠️  Tunel SSH nie odpowiada — database może nie działać lokalnie"
  echo "   Spróbuj ręcznie: ssh -N -L 5433:myperformance-dashboard-db:5432 ubuntu@57.128.249.245"
else
  echo "✓ Tunel DB aktywny (port 5433)"
fi

export DATABASE_URL="postgres://dashboard:RNveybkBsZkjcBSioAcLNkowtN53qA00@localhost:5433/dashboard"
trap "kill $TUNNEL_PID 2>/dev/null; echo '🛑 Tunel zamknięty'" EXIT INT TERM

echo ""
echo "🚀 Startuje Next.js dev server..."
echo "   Dashboard:  http://localhost:3000"
echo "   Keycloak:   https://auth.myperformance.pl"
echo "   Directus:   https://cms.myperformance.pl"
echo "   Dev mode:   DEV_CERT_BYPASS=true (panele bez certu)"
echo ""

cd "$ROOT"
exec npx next dev --port 3000

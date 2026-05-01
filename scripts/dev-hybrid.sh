#!/usr/bin/env bash
# ============================================================
# Lokalne środowisko dev — enterprise-grade, "just works".
#
#   - LOKALNY Postgres w Dockerze (auto-start, schema bootstrapuje się
#     sama przez CREATE TABLE IF NOT EXISTS w lib/*).
#   - Lokalny Next.js dashboard z hot-reloadem na porcie 3000.
#   - Zdalne SSO/CMS (Keycloak, Directus) — używamy publicznych URL-i.
#   - DEV_CERT_BYPASS=true → mTLS gating wyłączony lokalnie.
#   - Opcjonalnie panele sprzedawca/serwisant/kierowca na 3001/3002/3003.
#
# Użycie:
#   ./scripts/dev-hybrid.sh            # dashboard + DB
#   ./scripts/dev-hybrid.sh --panels   # + panele 3001-3003
#   ./scripts/dev-hybrid.sh --no-db    # nie startuj Postgresa (musi już działać)
# ============================================================

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.hybrid"
COMPOSE_FILE="$ROOT/docker-compose.dev.yml"
WITH_PANELS=false
SKIP_DB=false

for arg in "$@"; do
  case "$arg" in
    --panels) WITH_PANELS=true ;;
    --no-db)  SKIP_DB=true ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Brak .env.hybrid."
  exit 1
fi

# ── Sprzątanie po poprzednich sesjach ──────────────────────────────────────
# Stare SSH tunele do prod DB zajmują 127.0.0.1:5433 przed kontenerem
# Postgresa, więc lokalne queries dostają ECONNRESET. Killujemy je.
STALE_TUNNELS=$(pgrep -f "ssh -N.*5433.*ubuntu@57.128.249.245" 2>/dev/null || true)
if [ -n "$STALE_TUNNELS" ]; then
  echo "🧹 Zabijam stare SSH tunele na port 5433: $STALE_TUNNELS"
  echo "$STALE_TUNNELS" | xargs kill 2>/dev/null || true
  sleep 1
fi

# ── Lokalna baza danych ─────────────────────────────────────────────────────
if [ "$SKIP_DB" = false ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Brak Dockera. Zainstaluj Docker Desktop lub uruchom z --no-db."
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker daemon nie działa. Uruchom Docker Desktop."
    exit 1
  fi
  echo "🐘 Startuję lokalną Postgres (myperformance_dev na porcie 5433)..."
  docker compose -f "$COMPOSE_FILE" up -d postgres-dev >/dev/null

  echo -n "⏳ Czekam na gotowość bazy"
  for i in $(seq 1 30); do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres-dev \
         pg_isready -U mp_dev -d myperformance_dev >/dev/null 2>&1; then
      echo " ✓"
      break
    fi
    echo -n "."
    sleep 1
    if [ "$i" = "30" ]; then
      echo ""
      echo "❌ Postgres nie odpowiada po 30s. Sprawdź: docker compose -f docker-compose.dev.yml logs postgres-dev"
      exit 1
    fi
  done
fi

# ── Załaduj env: .env.hybrid + nadpisz sekretami z .env.local ──────────────
set -a
source "$ENV_FILE"
if [ -f "$ROOT/.env.local" ]; then
  echo "✓ Mergowanie sekretów z .env.local"
  source "$ROOT/.env.local"
fi
set +a

# Wymuszamy lokalną bazę nawet jeśli .env.local miało stare DATABASE_URL
export DATABASE_URL="postgres://mp_dev:mp_dev_local@localhost:5433/myperformance_dev?sslmode=disable"
export NODE_ENV="development"
export DEV_CERT_BYPASS="true"

PANEL_PIDS=()

cleanup() {
  echo ""
  echo "🛑 Zatrzymuję procesy dev..."
  for pid in "${PANEL_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Postgres zostaje — szybszy restart przy następnym dev.
}
trap cleanup EXIT INT TERM

# ── Opcjonalne panele ──────────────────────────────────────────────────────
if [ "$WITH_PANELS" = true ]; then
  PANEL_DIRS=("sprzedawca:3001" "serwisant:3002" "kierowca:3003")
  for entry in "${PANEL_DIRS[@]}"; do
    name="${entry%%:*}"
    port="${entry##*:}"
    panel_dir="$ROOT/panels/$name"
    if [ -d "$panel_dir" ]; then
      echo "🎛  Startuję panel-$name na http://localhost:$port"
      # Inline env zapewnia że subproces dostanie DEV_CERT_BYPASS
      # niezależnie od własnego .env loadingu Next.js.
      # NEXT_PUBLIC_DASHBOARD_URL — link "Powrót do dashboardu" w panelach
      # musi wskazywać na lokalny dashboard, nie produkcję.
      ( cd "$panel_dir" && \
        NODE_ENV=development \
        DEV_CERT_BYPASS=true \
        NEXTAUTH_URL="http://localhost:$port" \
        NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
        KEYCLOAK_URL="$KEYCLOAK_URL" \
        KEYCLOAK_REALM="$KEYCLOAK_REALM" \
        KEYCLOAK_ISSUER="$KEYCLOAK_ISSUER" \
        KEYCLOAK_CLIENT_ID="$KEYCLOAK_CLIENT_ID" \
        KEYCLOAK_CLIENT_SECRET="$KEYCLOAK_CLIENT_SECRET" \
        DATABASE_URL="$DATABASE_URL" \
        DASHBOARD_URL="http://localhost:3000" \
        NEXT_PUBLIC_DASHBOARD_URL="http://localhost:3000" \
        PORT="$port" \
        npx next dev --port "$port" 2>&1 | sed "s/^/[panel-$name] /" ) &
      PANEL_PIDS+=($!)
    else
      echo "⚠️  Katalog panelu nie znaleziony: $panel_dir"
    fi
  done
  sleep 1
fi

echo ""
echo "🚀 Startuje Next.js dashboard..."
echo "   Dashboard:  http://localhost:3000"
echo "   Postgres:   localhost:5433 (mp_dev / myperformance_dev)"
echo "   Keycloak:   $KEYCLOAK_URL"
echo "   Directus:   $DIRECTUS_URL"
if [ "$WITH_PANELS" = true ]; then
  echo "   Panele:     http://localhost:3001 / 3002 / 3003"
fi
echo "   Tryb dev:   DEV_CERT_BYPASS=$DEV_CERT_BYPASS"
echo ""

cd "$ROOT"
exec npx next dev --port 3000

#!/usr/bin/env bash
# Uruchamia lokalną bazę PostgreSQL dla dev.
# DATABASE_URL dla tej bazy: postgresql://mp_dev:mp_dev_local@localhost:5433/myperformance_dev

set -e
cd "$(dirname "$0")/.."

echo "Uruchamiam lokalną bazę PostgreSQL (port 5433)..."
docker compose -f docker-compose.dev.yml up -d postgres-dev

echo ""
echo "Baza dostępna na: postgresql://mp_dev:mp_dev_local@localhost:5433/myperformance_dev"
echo ""
echo "Dodaj do .env.hybrid:"
echo "  DATABASE_URL=postgresql://mp_dev:mp_dev_local@localhost:5433/myperformance_dev"

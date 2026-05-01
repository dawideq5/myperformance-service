#!/usr/bin/env bash
# Promuje lokalny branch do produkcji przez git push + Coolify deploy.
# Uruchom z głównego katalogu projektu.

set -e
COOLIFY_TOKEN="24|5acf7b9650fde84f351e8def6c3eee4fdbef657a"
APP_UUID="cft13k98wnuqm4u8p6freksn"
COOLIFY_URL="https://coolify.myperformance.pl/api/v1"

echo "🧪 Uruchamiam testy przed wdrożeniem..."
npm run test
npm run build

echo ""
echo "📦 Commituj i push do GitHub..."
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "⚠️  Jesteś na branchu '$BRANCH', nie 'main'."
  read -p "Czy na pewno chcesz wdrożyć z tego brancha? (y/N): " confirm
  [ "$confirm" = "y" ] || exit 1
fi

git push origin "$BRANCH"

echo ""
echo "🚀 Triggeruję wdrożenie Coolify..."
RESPONSE=$(curl -s -X POST "$COOLIFY_URL/deploy?uuid=$APP_UUID&force=true" \
  -H "Authorization: Bearer $COOLIFY_TOKEN")
DEPLOY_UUID=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['deployments'][0]['deployment_uuid'])" 2>/dev/null)

if [ -z "$DEPLOY_UUID" ]; then
  echo "❌ Błąd triggera wdrożenia: $RESPONSE"
  exit 1
fi

echo "✓ Wdrożenie w kolejce: $DEPLOY_UUID"
echo "  Status: https://coolify.myperformance.pl/project/n2ds5ufwnysb6g2x2ragt2kl/environment/hz87tqpzc3k9pij51idoifje/application/$APP_UUID/deployments/$DEPLOY_UUID"
echo ""

# Czekaj na zakończenie
echo "⏳ Czekam na zakończenie wdrożenia..."
until STATUS=$(curl -s "$COOLIFY_URL/deployments/$DEPLOY_UUID" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))" 2>/dev/null) && \
  [ "$STATUS" = "finished" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "error" ]; do
  printf "."
  sleep 15
done

echo ""
if [ "$STATUS" = "finished" ]; then
  echo "✅ Wdrożenie zakończone sukcesem!"
  echo "   https://myperformance.pl"
else
  echo "❌ Wdrożenie nieudane (status: $STATUS)"
  echo "   Sprawdź logi: https://coolify.myperformance.pl"
  exit 1
fi

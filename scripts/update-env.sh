#!/bin/bash
# Skrypt pomocniczy do dodawania zmiennych środowiskowych do .env.local
# Użycie: ./scripts/update-env.sh

echo "🔧 SimpliSalonCloud - Environment Setup Helper"
echo "=============================================="
echo ""

ENV_FILE=".env.local"

# Sprawdź czy .env.local istnieje
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Plik .env.local nie istnieje!"
    echo "Skopiuj .env.example do .env.local i spróbuj ponownie."
    exit 1
fi

echo "✅ Znaleziono $ENV_FILE"
echo ""

# Funkcja do dodawania zmiennej
add_variable() {
    local var_name=$1
    local var_description=$2
    local var_default=$3

    # Sprawdź czy zmienna już istnieje
    if grep -q "^$var_name=" "$ENV_FILE"; then
        echo "⚠️  $var_name już istnieje w $ENV_FILE (pomijam)"
        return
    fi

    echo ""
    echo "📝 $var_description"
    echo "Domyślna wartość: $var_default"
    read -p "Wartość dla $var_name (Enter aby pominąć): " user_input

    if [ -n "$user_input" ]; then
        echo "$var_name=$user_input" >> "$ENV_FILE"
        echo "✅ Dodano $var_name"
    else
        echo "⏭️  Pominięto $var_name"
    fi
}

echo "PHASE 1 - Wymagane zmienne dla production"
echo "=========================================="

add_variable "ALLOWED_ORIGINS" \
    "Dozwolone origins dla CORS (comma-separated)" \
    "http://localhost:3000,http://localhost:5173"

add_variable "UPSTASH_REDIS_REST_URL" \
    "Upstash Redis REST URL (https://console.upstash.com)" \
    "https://your-redis.upstash.io"

add_variable "UPSTASH_REDIS_REST_TOKEN" \
    "Upstash Redis REST Token" \
    "AX..."

add_variable "NEXT_PUBLIC_SENTRY_DSN" \
    "Sentry DSN (https://sentry.io)" \
    "https://xxx@oyyy.ingest.sentry.io/zzz"

add_variable "SENTRY_AUTH_TOKEN" \
    "Sentry Auth Token (dla CI/CD)" \
    "sntrys_..."

add_variable "SENTRY_ORG" \
    "Sentry Organization Slug" \
    "your-org"

add_variable "SENTRY_PROJECT" \
    "Sentry Project Slug" \
    "simplisaloncloud"

echo ""
echo "=========================================="
echo "✅ Konfiguracja zakończona!"
echo ""
echo "Następne kroki:"
echo "1. Uruchom: npm run dev"
echo "2. Sprawdź logi czy wszystko działa"
echo "3. Przetestuj: curl http://localhost:3000/api/health"
echo ""
echo "Pełna dokumentacja: docs/ENVIRONMENT_SETUP.md"

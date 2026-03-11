#!/bin/bash
# Script para probar el webhook de n8n desde la terminal
# Uso: ./test-n8n-webhook.sh

WEBHOOK_URL="${1:-http://localhost:5678/webhook-test/chatbot}"

echo "========================================="
echo "  Pruebas del Webhook de n8n"
echo "========================================="
echo ""
echo "URL: $WEBHOOK_URL"
echo ""

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Saludo simple
echo -e "${BLUE}Test 1: Saludo simple${NC}"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"mensaje": "hola"}' \
  -w "\nStatus: %{http_code}\n" \
  -s | python -m json.tool 2>/dev/null || cat
echo ""
echo ""

# Test 2: Precio actual
echo -e "${BLUE}Test 2: Consulta de precio${NC}"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "mensaje": "precio actual",
    "cotizacionId": 216834,
    "cliente": "Nike",
    "temporada": "2024-SS"
  }' \
  -w "\nStatus: %{http_code}\n" \
  -s | python -m json.tool 2>/dev/null || cat
echo ""
echo ""

# Test 3: Análisis completo
echo -e "${BLUE}Test 3: Análisis con IA${NC}"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "mensaje": "analiza esta cotización y dame recomendaciones",
    "cotizacionId": 216834,
    "cliente": "Adidas",
    "temporada": "2024-FW"
  }' \
  -w "\nStatus: %{http_code}\n" \
  -s | python -m json.tool 2>/dev/null || cat
echo ""
echo ""

# Test 4: Comparación con similares
echo -e "${BLUE}Test 4: Comparar con similares${NC}"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "mensaje": "compara con similares del mismo cliente",
    "cotizacionId": 216834,
    "cliente": "Nike",
    "temporada": "2024-SS"
  }' \
  -w "\nStatus: %{http_code}\n" \
  -s | python -m json.tool 2>/dev/null || cat
echo ""
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Tests completados${NC}"
echo -e "${GREEN}=========================================${NC}"

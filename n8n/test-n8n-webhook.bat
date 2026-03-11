@echo off
REM Script para probar el webhook de n8n desde Windows CMD
REM Uso: test-n8n-webhook.bat [WEBHOOK_URL]

setlocal
set WEBHOOK_URL=%1
if "%WEBHOOK_URL%"=="" set WEBHOOK_URL=http://localhost:5678/webhook-test/chatbot

echo =========================================
echo   Pruebas del Webhook de n8n
echo =========================================
echo.
echo URL: %WEBHOOK_URL%
echo.

REM Test 1: Saludo simple
echo ========================================
echo Test 1: Saludo simple
echo ========================================
curl -X POST "%WEBHOOK_URL%" ^
  -H "Content-Type: application/json" ^
  -d "{\"mensaje\": \"hola\"}"
echo.
echo.
timeout /t 2 /nobreak >nul

REM Test 2: Precio actual
echo ========================================
echo Test 2: Consulta de precio
echo ========================================
curl -X POST "%WEBHOOK_URL%" ^
  -H "Content-Type: application/json" ^
  -d "{\"mensaje\": \"precio actual\", \"cotizacionId\": 216834, \"cliente\": \"Nike\", \"temporada\": \"2024-SS\"}"
echo.
echo.
timeout /t 2 /nobreak >nul

REM Test 3: Análisis completo
echo ========================================
echo Test 3: Analisis con IA
echo ========================================
curl -X POST "%WEBHOOK_URL%" ^
  -H "Content-Type: application/json" ^
  -d "{\"mensaje\": \"analiza esta cotizacion y dame recomendaciones\", \"cotizacionId\": 216834, \"cliente\": \"Adidas\", \"temporada\": \"2024-FW\"}"
echo.
echo.
timeout /t 2 /nobreak >nul

REM Test 4: Comparación con similares
echo ========================================
echo Test 4: Comparar con similares
echo ========================================
curl -X POST "%WEBHOOK_URL%" ^
  -H "Content-Type: application/json" ^
  -d "{\"mensaje\": \"compara con similares del mismo cliente\", \"cotizacionId\": 216834, \"cliente\": \"Nike\", \"temporada\": \"2024-SS\"}"
echo.
echo.

echo =========================================
echo   Tests completados
echo =========================================
pause

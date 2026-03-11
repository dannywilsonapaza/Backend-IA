@echo off
REM Script para iniciar n8n y configurar el entorno de prueba
REM Uso: ejecutar-prueba-n8n.bat

echo ========================================
echo  Prueba de Integracion n8n + Backend IA
echo ========================================
echo.

REM Verificar si n8n esta instalado
where n8n >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] n8n no esta instalado
    echo.
    echo Instalacion recomendada con Docker:
    echo   docker run -it --rm --name n8n -p 5678:5678 -v %USERPROFILE%\n8n-data:/home/node/.n8n n8nio/n8n
    echo.
    echo O con npm:
    echo   npm install -g n8n
    echo.
    pause
    exit /b 1
)

echo [OK] n8n encontrado
echo.

REM Verificar si el backend esta corriendo
echo Verificando backend en http://localhost:5066/health...
curl -s http://localhost:5066/health >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ADVERTENCIA] Backend no esta corriendo en puerto 5066
    echo.
    echo Por favor ejecuta en otra terminal:
    echo   cd %CD%
    echo   npm run dev
    echo.
    echo O ejecuta automaticamente? (S/N)
    set /p START_BACKEND=
    if /i "%START_BACKEND%"=="S" (
        start "Backend IA" cmd /k "npm run dev"
        echo Esperando 5 segundos a que inicie el backend...
        timeout /t 5 /nobreak >nul
    )
) else (
    echo [OK] Backend corriendo
)

echo.
echo ========================================
echo  Iniciando n8n...
echo ========================================
echo.
echo 1. n8n se abrira en: http://localhost:5678
echo 2. Importa el workflow desde: %CD%\n8n\workflow-chatbot-cotizaciones.json
echo 3. Activa el workflow
echo 4. Prueba con: curl -X POST http://localhost:5678/webhook/chatbot -H "Content-Type: application/json" -d "{\"mensaje\": \"hola\"}"
echo.
echo Presiona Ctrl+C para detener n8n
echo.

REM Iniciar n8n
n8n start

# CLAUDE.md

Este archivo proporciona orientación a Claude Code (claude.ai/code) para trabajar con el código en este repositorio.

## Descripción del Proyecto

Servidor de sugerencias con IA para cotizaciones textiles. Proporciona análisis inteligente, comparaciones y recomendaciones para optimización de precios y markup usando OpenAI u Ollama como proveedores de LLM.

## Comandos

```bash
# Desarrollo con hot-reload
npm run dev

# Desarrollo en puerto 5066
npm run dev:5066

# Compilar TypeScript a JavaScript
npm run build

# Iniciar servidor en producción
npm start
```

## Arquitectura

### Servidor Express en un Solo Archivo
Toda la aplicación está en [src/index.ts](src/index.ts) - un servidor Express que incluye:

1. **Proveedores de IA** (variable `PROVIDER`):
   - `openai`: Usa GPT-4o-mini via API de OpenAI
   - `ollama`: Usa Ollama local con modelo configurable (default: llama3.1:8b)
   - `mock`: Modo fallback sin LLM

2. **Sistema de Menús Conversacionales**: Estructura jerárquica (`CONVERSATIONAL_MENUS`) con categorías:
   - `datos`: Datos básicos de cotización (fast-path, sin LLM)
   - `comparacion`: Comparación con cotizaciones similares
   - `analisis`: Análisis detallado de tendencias y competitividad
   - `recomendacion`: Sugerencias de optimización de precios

3. **Respuestas Fast-path**: Consultas predefinidas (`PREDEFINED_QUERIES`) que se responden sin llamar al LLM, identificadas por `fastPath: true`

4. **Caché en Memoria**: Caché LRU para listas de cotizaciones usando hash (`listaCache`)

5. **Integración Upstream**: Obtiene datos de cotizaciones del API upstream (`UPSTREAM_BASE_URL`)

### Endpoints Principales

- `POST /api/ai/cotizaciones/sugerencias` - Endpoint principal de sugerencias IA
- `GET /api/ai/consultas-predefinidas` - Devuelve consultas predefinidas disponibles
- `GET /health` - Health check
- `GET /health/ai` - Estado del proveedor de IA

### Clasificación de Respuestas

El servidor clasifica los mensajes del usuario en modos:
- `greeting`: Saludos simples, devuelve menú
- `data-only`: Solicitudes de datos simples (precio, costo, markup)
- `detalle`: Solicitudes de análisis detallado
- `similares`: Comparaciones de cotizaciones similares

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto del servidor (default: 5055) |
| `PROVIDER` | Proveedor IA: `openai`, `ollama` o `mock` |
| `OPENAI_API_KEY` | API key de OpenAI |
| `OLLAMA_MODEL` | Modelo de Ollama (default: llama3.1:8b) |
| `UPSTREAM_BASE_URL` | API upstream para datos de cotizaciones |
| `UPSTREAM_TOKEN` | Token Bearer para API upstream |
| `MAX_LISTA_COTS` | Máx. cotizaciones a procesar (default: 400) |
| `MAX_LISTA_CACHE_ENTRIES` | Tamaño del caché (default: 50) |
| `JSON_LIMIT` | Límite de tamaño del body (default: 2mb) |

## Modelo de Datos

Los campos de cotización usan prefijo `T` (ej: `TCODICOTI`, `TPRECCOTI`, `TCOSTPOND`, `TMKUPOBJE`).

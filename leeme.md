# CLAUDE.md

Este archivo proporciona orientación a Claude Code (claude.ai/code) para trabajar con el código en este repositorio.

## Descripción del Proyecto

Servidor de IA para cotizaciones textiles. Proporciona análisis inteligente, comparaciones entre temporadas y recomendaciones de precios usando OpenAI como proveedor de LLM. Soporta dos modos de ejecución: **Assistants API (gpt-4o)** y **Function Calling (o3)**.

## Comandos

```bash
# Desarrollo — Assistants API + gpt-4o (por defecto)
npm run dev

# Desarrollo — Function Calling + o3
npm run dev:fc

# Desarrollo en puerto 5066
npm run dev:5066

# Compilar TypeScript a JavaScript
npm run build

# Iniciar servidor en producción
npm start
```

## Arquitectura

### Dual Mode — Selección por Variable de Entorno

El modo se selecciona con la variable `AI_MODE`:

- **Sin `AI_MODE`** (default): Usa **Assistants API + gpt-4o** → `agentRunner.ts`
- **`AI_MODE=fc`**: Usa **Function Calling + o3** → `agentRunnerFC.ts`

### Estructura del Proyecto

```
src/
├── index.ts                  # Servidor Express (entry point)
├── config/
│   └── env.ts                # Variables de entorno y configuración
├── routes/
│   ├── chat.ts               # POST /api/chat — endpoint principal
│   └── health.ts             # GET /health, GET /health/ai
├── ai/
│   ├── agentRunner.ts        # Assistants API: Threads + Runs + polling (gpt-4o)
│   ├── agentRunnerFC.ts      # Function Calling: Chat Completions + tool_calls (o3)
│   ├── systemPromptFC.ts     # System prompt para modo FC
│   └── providers/
│       └── openai.ts         # Cliente OpenAI compartido
├── tools/
│   ├── toolsRegistry.ts      # Registro central de herramientas
│   ├── toolsCompare.ts       # Herramientas de comparación entre temporadas
│   ├── toolsQuote.ts         # Herramientas de datos de cotización
│   ├── toolSelectorLLM.ts    # Selector de herramientas por LLM
│   ├── extractors.ts         # Extractores de parámetros desde texto
│   ├── types.ts              # Tipos de herramientas
│   ├── http.ts               # Utilidades HTTP para llamadas API
│   └── backendPrincipalApi.ts # Cliente API del backend principal
├── services/
│   ├── comparacionService.ts # Lógica de comparación de cotizaciones
│   └── n8nChat.ts            # Integración con n8n (desactivado)
├── types/
│   └── index.ts              # Tipos TypeScript compartidos
└── utils/                    # Utilidades generales
```

### Modo 1 — Assistants API (default)

- Usa la API de Asistentes de OpenAI con modelo **gpt-4o**
- El asistente tiene ID `OPENAI_ASSISTANT_ID` (creado previamente con `scripts/setup-assistant.ts`)
- Gestiona conversaciones con **Threads**: cada sesión crea un thread que se reutiliza durante 30 min
- Las herramientas están definidas en el asistente de OpenAI
- Flujo: crear/reusar thread → añadir mensaje → crear run → polling hasta completado → ejecutar tool calls si los hay → devolver respuesta

### Modo 2 — Function Calling (o3)

- Usa Chat Completions API con modelo **o3**
- Historial de conversación en RAM por sesión (30 min TTL)
- System prompt en `systemPromptFC.ts`
- Herramientas definidas localmente en `toolsRegistry.ts`
- Flujo: enviar historial + tools → modelo responde con tool_calls → ejecutar → devolver resultado al modelo → respuesta final

### Endpoints

| Método | Ruta               | Descripción                         |
| ------ | ------------------ | ----------------------------------- |
| `POST` | `/api/chat`        | Endpoint principal de chat IA       |
| `GET`  | `/api/chat/health` | Estado del módulo chat              |
| `GET`  | `/health`          | Health check básico                 |
| `GET`  | `/health/ai`       | Estado del proveedor, modelo y modo |

### Request/Response del Chat

```typescript
// POST /api/chat
{
  "chatInput": "Compara la cotización 217517 usando el grupo ESTILO_NETTALCO",
  "sessionId": "session_abc123",
  "uiContext": {
    "screen": "cotizacion",
    "route": "/cotizar/detalle/217517",
    "cotizacionId": 217517
  }
}

// Response: string (texto plano con markdown)
```

## Variables de Entorno

| Variable                | Descripción                                                                   |
| ----------------------- | ----------------------------------------------------------------------------- |
| `PORT`                  | Puerto del servidor (default: 5055)                                           |
| `AI_MODE`               | `fc` para Function Calling + o3, vacío para Assistants API + gpt-4o           |
| `PROVIDER`              | Proveedor IA: `openai` o `mock`                                               |
| `OPENAI_API_KEY`        | API key de OpenAI                                                             |
| `OPENAI_ASSISTANT_ID`   | ID del asistente de OpenAI (modo Assistants API)                              |
| `BACKEND_PRINCIPAL_URL` | URL del backend principal para comparaciones (default: http://localhost:3920) |
| `JSON_LIMIT`            | Límite de tamaño del body (default: 2mb)                                      |

## Modelo de Datos

Los campos de cotización usan prefijo `T` (ej: `TCODICOTI`, `TPRECCOTI`, `TCOSTPOND`, `TMKUPOBJE`).

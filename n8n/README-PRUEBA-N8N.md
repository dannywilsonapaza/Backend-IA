# Prueba de Integración con n8n

## 📋 Descripción

Este directorio contiene un flujo de trabajo (workflow) de n8n que demuestra cómo integrar n8n con tu backend de IA para cotizaciones textiles.

## 🎯 ¿Qué hace este flujo?

El workflow implementa un chatbot básico que:

1. **Recibe mensajes** a través de un webhook
2. **Detecta saludos** y responde automáticamente sin llamar al backend
3. **Envía consultas complejas** a tu backend de IA en `localhost:5066`
4. **Procesa respuestas** del modelo OpenAI/Ollama
5. **Maneja errores** de forma elegante
6. **Responde en JSON** con metadata útil

## 🚀 Instalación de n8n

### Opción 1: Docker (Recomendado)
```bash
docker run -it --rm --name n8n -p 5678:5678 -v c:\Users\dapaza\n8n-data:/home/node/.n8n n8nio/n8n
```

### Opción 2: npm global
```bash
npm install -g n8n
n8n start
```

### Opción 3: npx (sin instalación)
```bash
npx n8n
```

n8n estará disponible en: http://localhost:5678

## 📥 Importar el Workflow

1. Abre n8n en tu navegador: http://localhost:5678
2. Haz clic en el botón **"+ Add workflow"** o **"Import from file"**
3. Selecciona el archivo: `workflow-chatbot-cotizaciones.json`
4. Haz clic en **"Import"**

## ⚙️ Configuración

### 1. Asegúrate de que tu backend esté corriendo

```bash
cd c:\Users\dapaza\Desktop\Backend-IA-Cotizaciones\server
npm run dev
```

Verifica que esté en: http://localhost:5066

### 2. Activa el workflow en n8n

- En la interfaz de n8n, haz clic en el toggle **"Active"** en la esquina superior derecha
- El webhook se activará automáticamente

### 3. Obtén la URL del webhook

- Haz clic en el nodo **"Webhook Entrada"**
- Copia la **Production URL** que aparece (algo como: `http://localhost:5678/webhook/chatbot`)

## 🧪 Probar el Workflow

### Prueba 1: Saludo Simple (Sin backend)

```bash
curl -X POST http://localhost:5678/webhook-test/chatbot ^
  -H "Content-Type: application/json" ^
  -d "{\"mensaje\": \"hola\"}"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "respuesta": "¡Hola! Soy tu asistente de cotizaciones textiles. ¿En qué te puedo ayudar hoy?\n\nPuedes preguntarme sobre:\n• 📊 Datos de la cotización\n• 📈 Comparación con similares\n• 🔍 Análisis de tendencias\n• 💡 Recomendaciones de precios",
  "provider": "n8n-conversational",
  "metadata": {
    "similares": 0,
    "confidence": 1,
    "timestamp": "2024-11-13T..."
  }
}
```

### Prueba 2: Consulta al Backend

```bash
curl -X POST http://localhost:5678/webhook-test/chatbot ^
  -H "Content-Type: application/json" ^
  -d "{\"mensaje\": \"precio actual\", \"cotizacionId\": 216834, \"cliente\": \"Nike\", \"temporada\": \"2024-SS\"}"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "respuesta": "💰 **Precio actual: $0** (Markup objetivo: 5%)",
  "provider": "fast-predefined",
  "metadata": {
    "similares": 0,
    "confidence": 0.95,
    "timestamp": "2024-11-13T..."
  }
}
```

### Prueba 3: Análisis Completo con IA

```bash
curl -X POST http://localhost:5678/webhook-test/chatbot ^
  -H "Content-Type: application/json" ^
  -d "{\"mensaje\": \"analiza esta cotización y dame recomendaciones\", \"cotizacionId\": 216834, \"cliente\": \"Adidas\", \"temporada\": \"2024-FW\"}"
```

## 🔍 Estructura del Workflow

```
┌─────────────────┐
│ Webhook Entrada │  ← Recibe POST requests
└────────┬────────┘
         │
         v
┌─────────────────┐
│Extraer Variables│  ← Parsea mensaje, cotizacionId, cliente, etc.
└────────┬────────┘
         │
         v
┌─────────────────┐
│  ¿Es saludo?    │  ← Detecta "hola", "buenos días", etc.
└────┬───────┬────┘
     │ Sí    │ No
     v       v
┌────────┐ ┌──────────────────┐
│Respuesta│ │Llamar Backend IA │  ← HTTP POST a localhost:5066
│ Saludo │ └────────┬─────────┘
└───┬────┘          │
    │               v
    │      ┌─────────────────────┐
    │      │Procesar Respuesta IA│
    │      └────────┬────────────┘
    │               │
    v               v
┌──────────────────────┐
│     Responder        │  ← Devuelve JSON al cliente
└──────────────────────┘
```

## 📊 Ventajas de usar n8n

### 1. **Orquestación Visual**
- Ves el flujo completo del chatbot
- Fácil de modificar sin código
- Debug visual en cada paso

### 2. **Lógica de Negocio sin Código**
- Puedes agregar condiciones, filtros, transformaciones
- Integrar bases de datos, APIs externas
- Cachear respuestas

### 3. **Integraciones Listas**
- Conectar con Slack, WhatsApp, Telegram
- Guardar conversaciones en MongoDB, PostgreSQL
- Enviar notificaciones por email

### 4. **Escalabilidad**
- Agregar rate limiting
- Implementar circuit breakers
- Crear workflows paralelos

## 🔧 Mejoras Sugeridas

### 1. Agregar Memoria de Conversación
```json
// Agregar nodo "Supabase" o "PostgreSQL"
// Guardar: usuario_id, mensaje, respuesta, timestamp
```

### 2. Conectar con WhatsApp
```json
// Agregar nodo "WhatsApp Business"
// Recibir mensajes → Procesar → Responder
```

### 3. Implementar Rate Limiting
```json
// Agregar nodo "Redis" para contadores
// Limitar a N consultas por usuario por minuto
```

### 4. Analytics y Logging
```json
// Agregar nodo "Google Analytics" o "Mixpanel"
// Trackear: tipo_consulta, tiempo_respuesta, satisfacción
```

## 🐛 Debugging

### Ver ejecuciones en n8n
1. Ve a la pestaña **"Executions"** en el sidebar
2. Haz clic en una ejecución para ver el flujo completo
3. Inspecciona los datos en cada nodo

### Logs del backend
```bash
# En tu terminal donde corre el backend
# Verás logs como:
[ai][incoming] /api/ai/cotizaciones/sugerencias {...}
X-AI-Provider: openai
X-AI-Data-Source: none
```

### Errores comunes

**Error: ECONNREFUSED**
- El backend no está corriendo en localhost:5066
- Solución: `npm run dev` en el directorio del backend

**Error: Timeout**
- El modelo de IA está tardando mucho
- Solución: Aumentar timeout en el nodo HTTP Request a 60000ms

**Error: 404 Not Found**
- La URL del webhook cambió
- Solución: Verifica la URL en el nodo "Webhook Entrada"

## 📚 Recursos

- [Documentación de n8n](https://docs.n8n.io/)
- [n8n Community](https://community.n8n.io/)
- [Templates de n8n](https://n8n.io/workflows/)

## 🎉 Próximos Pasos

1. **Personalizar el flujo**: Agregar más lógica de negocio
2. **Conectar con frontend**: Usar la URL del webhook desde tu app Angular
3. **Agregar autenticación**: Implementar JWT o API Keys
4. **Desplegar en producción**: Usar n8n Cloud o self-host en VPS

## 💡 Ejemplo de Integración con Frontend

```typescript
// En tu servicio Angular
async enviarMensajeN8n(mensaje: string, cotizacionId: number) {
  const response = await fetch('http://localhost:5678/webhook/chatbot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mensaje,
      cotizacionId,
      cliente: this.cotizacion.cliente,
      temporada: this.cotizacion.temporada
    })
  });
  
  return await response.json();
}
```

---

¿Dudas o problemas? Revisa los logs en n8n y en tu backend. ¡Buena suerte! 🚀

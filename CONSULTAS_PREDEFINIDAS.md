# Sistema de Consultas Predefinidas - Documentación

## Descripción

Se ha implementado un sistema de consultas predefinidas para optimizar la velocidad de respuesta del asistente de IA de cotizaciones. Este sistema incluye:

- **Fast-path queries**: Respuestas instantáneas sin invocar LLM para consultas simples de datos
- **Template queries**: Prompts optimizados para consultas complejas que requieren LLM
- **Categorización**: Organización de consultas por tipo (datos, comparación, análisis, recomendación)

## Endpoints Implementados

### 1. Obtener Consultas Predefinidas

```http
GET /api/ai/consultas-predefinidas
```

**Respuesta:**
```json
{
  "queries": {
    "datos": [
      { "id": "precio-actual", "label": "Ver precio actual", "fastPath": true },
      { "id": "costo-actual", "label": "Ver costo ponderado", "fastPath": true },
      { "id": "markup-actual", "label": "Ver markup actual", "fastPath": true },
      { "id": "info-cliente", "label": "Información del cliente", "fastPath": true }
    ],
    "comparacion": [
      { "id": "similares-cliente", "label": "Comparar con similares del mismo cliente", "fastPath": false },
      { "id": "similares-temporada", "label": "Comparar con similares de la temporada", "fastPath": false }
    ],
    "analisis": [
      { "id": "tendencia-precios", "label": "Analizar tendencia de precios", "fastPath": false },
      { "id": "analisis-competitividad", "label": "Análisis de competitividad", "fastPath": false }
    ],
    "recomendacion": [
      { "id": "optimizar-precio", "label": "Sugerencias para optimizar precio", "fastPath": false },
      { "id": "mejoras-markup", "label": "Cómo mejorar el markup", "fastPath": false }
    ]
  },
  "total": 10,
  "categories": ["datos", "comparacion", "analisis", "recomendacion"]
}
```

### 2. Usar Consulta Predefinida

```http
POST /api/ai/cotizaciones/sugerencias
```

**Body con consulta predefinida:**
```json
{
  "cotizacionId": 123,
  "predefinedQueryId": "precio-actual",
  "detalleCotizacion": {
    "TPRECCOTI": 25.50,
    "TMKUPOBJE": 15
  }
}
```

**Respuesta rápida (Fast-path):**
```json
{
  "reply": "💰 **Precio actual: $25.5** (Markup objetivo: 15%)",
  "similares": [],
  "confidence": 0.95,
  "provider": "fast-predefined",
  "queryId": "precio-actual",
  "dataSource": "none"
}
```

## Consultas Fast-path Disponibles

### 1. precio-actual
- **Respuesta:** Precio actual con markup objetivo
- **Tiempo:** ~10-50ms
- **Ejemplo:** "💰 **Precio actual: $25.5** (Markup objetivo: 15%)"

### 2. costo-actual
- **Respuesta:** Costo ponderado con precio de referencia
- **Tiempo:** ~10-50ms
- **Ejemplo:** "📊 **Costo ponderado: $20.5** (Precio: $25.5)"

### 3. markup-actual
- **Respuesta:** Markup objetivo definido
- **Tiempo:** ~10-50ms
- **Ejemplo:** "📈 **Markup objetivo: 15%**"

### 4. info-cliente
- **Respuesta:** Información completa del cliente
- **Tiempo:** ~10-50ms
- **Ejemplo:** 
```
👤 **Cliente:** NIKE
🏷️ **Estilo:** NK-POLO-01
📅 **Temporada:** 2024-SS
```

## Consultas con LLM Optimizadas

### Comparaciones
- `similares-cliente`: Compara con cotizaciones del mismo cliente
- `similares-temporada`: Compara con cotizaciones de la misma temporada

### Análisis
- `tendencia-precios`: Analiza tendencias de precios historicas
- `analisis-competitividad`: Evalúa posicionamiento competitivo

### Recomendaciones
- `optimizar-precio`: Sugerencias para optimizar el precio
- `mejoras-markup`: Estrategias para mejorar márgenes

## Headers de Respuesta

El sistema añade headers informativos para debugging y monitoreo:

- `X-AI-Provider`: Proveedor usado (`fast-predefined`, `openai`, `ollama`, `mock`)
- `X-AI-Fast-Path`: Tipo de fast-path usado (`predefined`, `data-only`)
- `X-AI-Query-Id`: ID de la consulta predefinida usada
- `X-AI-Template-Used`: Template aplicado para consultas LLM
- `X-AI-Timing`: Información de tiempos de ejecución

## Ventajas de Rendimiento

### Fast-path Queries
- **Antes:** 800ms - 2s (invocando LLM para datos simples)
- **Ahora:** 10-50ms (respuesta directa desde código)
- **Mejora:** 95-98% reducción en tiempo de respuesta

### Template Queries
- **Antes:** Prompts largos y clasificación de intención
- **Ahora:** Prompts específicos y optimizados
- **Mejora:** 30-50% reducción en tokens y tiempo

### Experiencia de Usuario
- Opciones claras y predefinidas
- Respuestas más consistentes
- Menor frustración por consultas mal interpretadas

## Implementación en Frontend

### 1. Cargar consultas disponibles
```typescript
async loadPredefinedQueries() {
  const response = await fetch('/api/ai/consultas-predefinidas');
  this.consultasPredefinidas = await response.json();
}
```

### 2. Mostrar opciones categorizadas
```html
<div class="predefined-queries">
  <div *ngFor="let category of categories" class="category">
    <h3>{{ getCategoryLabel(category) }}</h3>
    <button 
      *ngFor="let query of consultasPredefinidas.queries[category]"
      (click)="enviarConsultaPredefinida(query.id)"
      [class.fast-path]="query.fastPath">
      {{ query.label }}
      <span *ngIf="query.fastPath" class="fast-icon">⚡</span>
    </button>
  </div>
</div>
```

### 3. Enviar consulta predefinida
```typescript
async enviarConsultaPredefinida(queryId: string) {
  this.cargando = true;
  const payload = {
    cotizacionId: this.cotizacion.id,
    predefinedQueryId: queryId,
    detalleCotizacion: this.cotizacion,
    // ...otros campos según sea necesario
  };
  
  const response = await this.aiService.obtenerSugerencias(payload);
  this.mostrarRespuesta(response);
  this.cargando = false;
}
```

## Configuración

Se pueden configurar las siguientes variables de entorno:

- `MAX_PREDEFINED_CACHE`: Máximo de respuestas en cache (default: 100)
- `PREDEFINED_TTL`: TTL del cache en segundos (default: 300)

## Monitoreo

El sistema registra métricas importantes:
- Tipo de consulta utilizada
- Tiempos de respuesta por categoría
- Ratio de fast-path vs LLM queries
- Errores y fallbacks

## Testing

Para probar la funcionalidad:

```bash
# Obtener consultas disponibles
curl http://localhost:5066/api/ai/consultas-predefinidas

# Probar fast-path query
curl -X POST http://localhost:5066/api/ai/cotizaciones/sugerencias \
  -H "Content-Type: application/json" \
  -d '{
    "cotizacionId": 123,
    "predefinedQueryId": "precio-actual",
    "detalleCotizacion": {"TPRECCOTI": 25.50, "TMKUPOBJE": 15}
  }'
```

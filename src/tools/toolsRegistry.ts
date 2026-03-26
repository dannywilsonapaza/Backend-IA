import type { ToolDefinition } from "./types.js";
import {
  quoteColorsTool,
  quoteComponentsTool,
  quoteDetailTool,
  quoteDescriptoresEstiloNettalcoTool,
  quoteDimensionesEstiloNettalcoTool,
  quoteExtrasCotizacionTool,
  quoteHiladosPorColorCotizacionTool,
  quoteHiladosEspecialesCotizacionTool,
  quoteMinutajesCotizacionTool,
  quoteListCandidatesTool,
  quoteCompareKpisTool,
  quoteCompareComponentesTool,
  quoteCompareMinutajesTool,
  quoteSearchTool,
  quoteSuggestPriceTool,
  quoteCalcMarkupTool,
} from "./toolsQuote.js";
import { quotePredictPriceTool } from "./toolsPredict.js";

const TOOLS: ToolDefinition[] = [
  quoteDetailTool,
  quoteColorsTool,
  quoteComponentsTool,
  quoteDescriptoresEstiloNettalcoTool,
  quoteDimensionesEstiloNettalcoTool,
  quoteExtrasCotizacionTool,
  quoteHiladosPorColorCotizacionTool,
  quoteHiladosEspecialesCotizacionTool,
  quoteMinutajesCotizacionTool,
  quoteListCandidatesTool,
  quoteCompareKpisTool,
  quoteCompareComponentesTool,
  quoteCompareMinutajesTool,
  quoteSearchTool,
  quoteSuggestPriceTool,
  quoteCalcMarkupTool,
  quotePredictPriceTool,
];

export function listTools(): ToolDefinition[] {
  return [...TOOLS];
}

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id);
}

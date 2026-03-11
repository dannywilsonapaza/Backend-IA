import type { ToolDefinition } from "./types.js";
import {
  quoteColorsTool,
  quoteComponentsTool,
  quoteDetailTool,
  quoteListCandidatesTool,
  quoteCompareKpisTool,
  quoteCompareComponentesTool,
  quoteCompareMinutajesTool,
  quoteSearchTool,
  quoteSuggestPriceTool,
  quoteCalcMarkupTool,
} from "./toolsQuote.js";

const TOOLS: ToolDefinition[] = [
  quoteDetailTool,
  quoteColorsTool,
  quoteComponentsTool,
  quoteListCandidatesTool,
  quoteCompareKpisTool,
  quoteCompareComponentesTool,
  quoteCompareMinutajesTool,
  quoteSearchTool,
  quoteSuggestPriceTool,
  quoteCalcMarkupTool,
];

export function listTools(): ToolDefinition[] {
  return [...TOOLS];
}

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id);
}

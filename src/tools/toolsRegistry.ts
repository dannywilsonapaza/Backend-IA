import type { ToolDefinition } from './types.js';
import { quoteColorsTool, quoteComponentsTool, quoteDetailTool, quoteCompareClientTool, quoteCompareStyleTool, quoteCompareGlobalTool, quoteCompareTwoTool } from './toolsQuote.js';
import { compareColorsTool } from './toolsCompare.js';

const TOOLS: ToolDefinition[] = [
  quoteDetailTool,
  quoteColorsTool,
  quoteComponentsTool,
  compareColorsTool,
  quoteCompareClientTool,
  quoteCompareStyleTool,
  quoteCompareGlobalTool,
  quoteCompareTwoTool,
];

export function listTools(): ToolDefinition[] {
  return [...TOOLS];
}

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find(t => t.id === id);
}

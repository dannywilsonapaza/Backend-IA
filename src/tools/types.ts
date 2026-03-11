import type { ToolResult, UiContext } from '../types/index.js';
import type { ApiTraceItem } from './http.js';

export interface ToolExecutionContext {
  sessionId: string;
  chatInput: string;
  uiContext?: UiContext;
  traceId: string;
  apiTrace: ApiTraceItem[];
}

export interface ToolSelection {
  toolId: string;
  params: Record<string, any>;
}

export interface ToolDefinition {
  id: string;
  description: string;
  requiredParams: string[];
  examples: string[];
  execute: (params: Record<string, any>, ctx: ToolExecutionContext) => Promise<ToolResult>;
}

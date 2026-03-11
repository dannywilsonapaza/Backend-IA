import { quoteColorsTool, quoteComponentsTool, quoteDetailTool } from './toolsQuote.js';
import { compareColorsTool } from './toolsCompare.js';
const TOOLS = [
    quoteDetailTool,
    quoteColorsTool,
    quoteComponentsTool,
    compareColorsTool,
];
export function listTools() {
    return [...TOOLS];
}
export function getToolById(id) {
    return TOOLS.find(t => t.id === id);
}

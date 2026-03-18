import type { ToolDefinition, ToolResult } from "./types.js";
import { deviceTools, handleDeviceTool } from "./device-tools.js";
import { counterTools, handleCounterTool } from "./counter-tools.js";
import { insightTools, handleInsightTool } from "./insight-tools.js";

const deviceToolNames = new Set(deviceTools.map(t => t.name));
const counterToolNames = new Set(counterTools.map(t => t.name));
const insightToolNames = new Set(insightTools.map(t => t.name));

export function getTools(): ToolDefinition[] {
  return [...deviceTools, ...counterTools, ...insightTools];
}

export async function handleTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (deviceToolNames.has(name)) return handleDeviceTool(name, args);
  if (counterToolNames.has(name)) return handleCounterTool(name, args);
  if (insightToolNames.has(name)) return handleInsightTool(name, args);
  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
}

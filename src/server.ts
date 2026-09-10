import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getTools, handleTool } from "./tools/index.js";
import { log } from "./lib/logger.js";

export const SERVER_NAME = "cisco-ris-mcp";
export const SERVER_VERSION = "1.5.0";

// Accept self-signed CUCM certificates by default
const tlsMode = (process.env.RIS_MCP_TLS_MODE || "").toLowerCase();
if (tlsMode !== "strict" && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export function createMcpServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getTools(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    log("info", `Tool call: ${name}`, { args: Object.keys(rawArgs ?? {}) });
    const result = await handleTool(name, rawArgs ?? {});
    return result;
  });

  return server;
}

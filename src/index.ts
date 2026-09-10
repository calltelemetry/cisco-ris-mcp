#!/usr/bin/env node
/**
 * Cisco RIS MCP Server -- Real-time Information Service + PerfMon.
 *
 * Provides 10 tools for querying device registration status, performance
 * counters, and cluster health from Cisco CUCM via SOAP APIs.
 *
 * Install: npx @calltelemetry/cisco-ris-mcp
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { cleanupAllMonitors } from "./services/perfmon/index.js";
import { getTools } from "./tools/index.js";
import { log } from "./lib/logger.js";

export { createMcpServer, SERVER_NAME, SERVER_VERSION };

const server = createMcpServer();

const cleanup = async () => {
  log("info", "Shutting down, cleaning up monitors...");
  await cleanupAllMonitors();
  process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

const transport = new StdioServerTransport();
await server.connect(transport);
log("info", `${SERVER_NAME} started with ${getTools().length} tools`);

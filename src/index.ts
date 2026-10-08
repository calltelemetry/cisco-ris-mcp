#!/usr/bin/env node
/**
 * Cisco RIS MCP Server -- Real-time Information Service + PerfMon.
 *
 * Provides 10 tools for querying device registration status, performance
 * counters, and cluster health from Cisco CUCM via SOAP APIs.
 *
 * Install: npx @calltelemetry/cisco-ris-mcp
 */

import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { cleanupAllMonitors } from "./services/perfmon/index.js";
import { getTools, handleTool } from "./tools/index.js";
import { log } from "./lib/logger.js";
import { handleMcpFetchRequest } from "./fetch.js";
import { startSseServer } from "./sse.js";

export {
  createMcpServer,
  SERVER_NAME,
  SERVER_VERSION,
  getTools,
  handleTool,
  handleMcpFetchRequest,
  startSseServer,
};

export async function runCli(): Promise<void> {
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
}

function isDirectExecution(): boolean {
  if (typeof process === "undefined" || !process.argv?.[1]) return false;
  try {
    const scriptPath = fs.realpathSync(process.argv[1]);
    const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
    return scriptPath === currentPath;
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  runCli().catch((err) => {
    console.error("Fatal error starting Cisco RIS MCP server:", err);
    process.exit(1);
  });
}


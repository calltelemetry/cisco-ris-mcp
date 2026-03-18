#!/usr/bin/env node
/**
 * Cisco RIS MCP Server -- Real-time Information Service + PerfMon.
 *
 * Provides 10 tools for querying device registration status, performance
 * counters, and cluster health from Cisco CUCM via SOAP APIs.
 *
 * Install: npx @calltelemetry/cisco-ris-mcp
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getTools, handleTool } from "./tools/index.js";
import { cleanupAllMonitors } from "./services/perfmon/index.js";
import { log } from "./lib/logger.js";

// Accept self-signed CUCM certificates by default
const tlsMode = (process.env.RIS_MCP_TLS_MODE || "").toLowerCase();
if (tlsMode !== "strict" && !process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

class CiscoRisMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: "cisco-ris-mcp", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );
    this.setupToolHandlers();
    this.setupShutdownHandlers();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: getTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;
      log("info", `Tool call: ${name}`, { args: Object.keys(rawArgs ?? {}) });
      const result = await handleTool(name, rawArgs ?? {});
      return result;
    });
  }

  private setupShutdownHandlers(): void {
    const cleanup = async () => {
      log("info", "Shutting down, cleaning up monitors...");
      await cleanupAllMonitors();
      process.exit(0);
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log("info", `cisco-ris-mcp started with ${getTools().length} tools`);
  }
}

const server = new CiscoRisMcpServer();
server.run().catch((err) => {
  log("error", `Fatal: ${err}`);
  process.exit(1);
});

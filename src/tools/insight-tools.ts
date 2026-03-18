import type { ToolDefinition, ToolResult } from "./types.js";
import { jsonResponse } from "./types.js";
import { resolveCredentials } from "../lib/credential-resolver.js";
import { selectCmDeviceAll } from "../services/ris/index.js";
import { perfmonCollectCounterData } from "../services/perfmon/index.js";
import type { RegistrationHealthResult } from "../types/ris-types.js";
import { toJsonError } from "../types/errors.js";

const credentialProperties = {
  cucm_host: { type: "string", description: "CUCM hostname (overrides CUCM_HOST env)" },
  cucm_username: { type: "string", description: "CUCM username (overrides CUCM_USERNAME env)" },
  cucm_password: { type: "string", description: "CUCM password (overrides CUCM_PASSWORD env)" },
  cucm_port: { type: "number", description: "CUCM port (default 8443)" },
};

export const insightTools: ToolDefinition[] = [
  {
    name: "phone_summary",
    description: "Dashboard-ready phone registration summary. Returns aggregate counts by status, model, protocol, and node -- no individual device lists. Cached for 5 minutes.",
    inputSchema: {
      type: "object",
      properties: {
        deviceClass: { type: "string", enum: ["Phone", "Gateway", "H323", "CTI", "VoiceMail", "MediaResources", "SIPTrunk"], description: "Device class (default: Phone)" },
        forceRefresh: { type: "boolean", description: "Bypass cache" },
        timeoutMs: { type: "number" },
        ...credentialProperties,
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "registration_health",
    description: "Cluster-wide registration health check. Combines RIS device counts with PerfMon counters (CallsActive, RegisteredHardwarePhones) and generates threshold alerts.",
    inputSchema: {
      type: "object",
      properties: {
        alertThreshold: { type: "number", description: "Alert if any node's registration rate falls below this percentage (default: 80)" },
        timeoutMs: { type: "number" },
        ...credentialProperties,
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
];

export async function handleInsightTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const creds = resolveCredentials(args);

    if (name === "phone_summary") {
      // This delegates to device_status with summaryOnly, but is a separate tool for discoverability
      const { handleDeviceTool } = await import("./device-tools.js");
      return handleDeviceTool("device_status", { ...args, summaryOnly: true });
    }

    if (name === "registration_health") {
      const threshold = Number(args.alertThreshold) || 80;
      const perfmonHost = creds.host;

      // Parallel: RIS device scan + PerfMon counters
      const [risResult, perfmonResult] = await Promise.allSettled([
        selectCmDeviceAll(creds, { deviceClass: "Phone", timeoutMs: args.timeoutMs as number | undefined }),
        perfmonCollectCounterData(creds, perfmonHost, "Cisco CallManager", args.timeoutMs as number | undefined),
      ]);

      const alerts: string[] = [];
      let overall = { registrationRate: 0, totalDevices: 0, registered: 0, unregistered: 0 };
      const nodes: RegistrationHealthResult["nodes"] = [];

      if (risResult.status === "fulfilled") {
        const ris = risResult.value;
        let totalReg = 0;
        let totalUnreg = 0;

        for (const node of ris.cmNodes) {
          let nodeReg = 0;
          let nodeUnreg = 0;
          for (const dev of node.devices) {
            if (dev.status === "Registered") nodeReg++;
            else nodeUnreg++;
          }
          const nodeTotal = nodeReg + nodeUnreg;
          const nodeRate = nodeTotal > 0 ? Math.round((nodeReg / nodeTotal) * 10000) / 100 : 0;
          nodes.push({ name: node.name, registrationRate: nodeRate, registered: nodeReg, unregistered: nodeUnreg });

          if (nodeRate < threshold && nodeTotal > 0) {
            alerts.push(`Node "${node.name}" registration rate is ${nodeRate}% (below ${threshold}% threshold)`);
          }
          totalReg += nodeReg;
          totalUnreg += nodeUnreg;
        }

        const total = totalReg + totalUnreg;
        overall = {
          registrationRate: total > 0 ? Math.round((totalReg / total) * 10000) / 100 : 0,
          totalDevices: total,
          registered: totalReg,
          unregistered: totalUnreg,
        };
      } else {
        alerts.push(`RIS query failed: ${risResult.reason}`);
      }

      let counters: Record<string, number> | null = null;
      if (perfmonResult.status === "fulfilled") {
        counters = {};
        for (const c of perfmonResult.value) {
          counters[c.name] = c.value;
        }
      } else {
        alerts.push(`PerfMon query failed: ${perfmonResult.reason}`);
      }

      const result: RegistrationHealthResult = { overall, nodes, counters, alerts };
      return jsonResponse(result);
    }

    return { content: [{ type: "text", text: `Unknown insight tool: ${name}` }], isError: true };
  } catch (err) {
    return { content: [{ type: "text", text: toJsonError(err) }], isError: true };
  }
}

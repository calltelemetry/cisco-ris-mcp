import type { ToolDefinition, ToolResult } from "./types.js";
import { jsonResponse } from "./types.js";
import { resolveCredentials } from "../lib/credential-resolver.js";
import { selectCmDeviceAll, selectCtiItem } from "../services/ris/index.js";
import type { PhoneStatusSummary } from "../types/ris-types.js";
import { toJsonError } from "../types/errors.js";

const credentialProperties = {
  cucm_host: { type: "string", description: "CUCM hostname (overrides CUCM_HOST env)" },
  cucm_username: { type: "string", description: "CUCM username (overrides CUCM_USERNAME env)" },
  cucm_password: { type: "string", description: "CUCM password (overrides CUCM_PASSWORD env)" },
  cucm_port: { type: "number", description: "CUCM port (default 8443)" },
};

export const deviceTools: ToolDefinition[] = [
  {
    name: "device_status",
    description: "Query real-time device registration status from CUCM RIS. Supports wildcard search, filtering by device class/status/protocol, and auto-pagination. Use summaryOnly=true for large clusters to get counts instead of device lists.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search pattern (supports * wildcard). Examples: 'SEP*', '10.1.*', '1001'" },
        field: { type: "string", enum: ["Name", "IPV4Address", "IPV6Address", "DirNumber", "Description", "SIPStatus"], description: "Field to search by (default: Name)" },
        deviceClass: { type: "string", enum: ["Phone", "Gateway", "H323", "CTI", "VoiceMail", "MediaResources", "HuntList", "SIPTrunk", "Unknown"], description: "Device class filter (default: Phone)" },
        status: { type: "string", enum: ["Any", "Registered", "UnRegistered", "Rejected", "PartiallyRegistered", "Unknown"], description: "Registration status filter (default: Any)" },
        protocol: { type: "string", enum: ["Any", "SIP", "SCCP", "Unknown"], description: "Protocol filter (default: Any)" },
        model: { type: "number", description: "Model number (255 = all models)" },
        limit: { type: "number", description: "Maximum number of devices to return (stops pagination early)" },
        summaryOnly: { type: "boolean", description: "Return only aggregate counts, not individual devices (recommended for large clusters)" },
        forceRefresh: { type: "boolean", description: "Bypass cached results" },
        timeoutMs: { type: "number", description: "Request timeout in milliseconds" },
        ...credentialProperties,
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "cti_status",
    description: "Query real-time CTI port, route point, and application connection status from CUCM RIS.",
    inputSchema: {
      type: "object",
      properties: {
        ctiMgrClass: { type: "string", enum: ["Provider", "Device", "Line"], description: "CTI manager class (default: Provider)" },
        maxItems: { type: "number", description: "Maximum items to return (default: 200)" },
        appId: { type: "string", description: "Filter by application ID" },
        nodeName: { type: "string", description: "Filter by CUCM node name" },
        status: { type: "string", enum: ["Any", "Open", "Close", "OpenFailed", "Unknown"], description: "Status filter (default: Any)" },
        timeoutMs: { type: "number", description: "Request timeout in milliseconds" },
        ...credentialProperties,
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
];

// -- In-memory TTL cache --
const deviceCache = new Map<string, { result: Awaited<ReturnType<typeof selectCmDeviceAll>>; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 10;

function getCacheKey(host: string, deviceClass?: string): string {
  return `${host}:${deviceClass ?? "Phone"}`;
}

async function getCachedDeviceStatus(
  creds: ReturnType<typeof resolveCredentials>,
  args: Record<string, unknown>,
): ReturnType<typeof selectCmDeviceAll> {
  const key = getCacheKey(creds.host, args.deviceClass as string | undefined);
  const forceRefresh = args.forceRefresh === true;

  if (!forceRefresh) {
    const cached = deviceCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.result;
    }
  }

  const result = await selectCmDeviceAll(creds, {
    deviceClass: args.deviceClass as string | undefined,
    model: args.model as number | undefined,
    status: args.status as string | undefined,
    selectBy: args.field as string | undefined,
    selectItems: args.query ? [String(args.query)] : undefined,
    protocol: args.protocol as string | undefined,
    timeoutMs: args.timeoutMs as number | undefined,
    limit: args.limit as number | undefined,
  });

  // Only cache full scans (no specific query)
  if (!args.query) {
    if (deviceCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = deviceCache.keys().next().value;
      if (oldest) deviceCache.delete(oldest);
    }
    deviceCache.set(key, { result, fetchedAt: Date.now() });
  }

  return result;
}

function buildSummary(result: Awaited<ReturnType<typeof selectCmDeviceAll>>): PhoneStatusSummary {
  let registered = 0;
  let unregistered = 0;
  const byModel: Record<string, { registered: number; unregistered: number }> = {};
  const byProtocol: Record<string, { registered: number; unregistered: number }> = {};
  const byNode: Array<{ name: string; registered: number; unregistered: number; total: number }> = [];

  for (const node of result.cmNodes) {
    let nodeReg = 0;
    let nodeUnreg = 0;
    for (const dev of node.devices) {
      const isReg = dev.status === "Registered";
      if (isReg) { registered++; nodeReg++; } else { unregistered++; nodeUnreg++; }

      const model = dev.activeLoadId || "Unknown";
      if (!byModel[model]) byModel[model] = { registered: 0, unregistered: 0 };
      if (isReg) byModel[model]!.registered++; else byModel[model]!.unregistered++;

      const proto = dev.protocol || "Unknown";
      if (!byProtocol[proto]) byProtocol[proto] = { registered: 0, unregistered: 0 };
      if (isReg) byProtocol[proto]!.registered++; else byProtocol[proto]!.unregistered++;
    }
    byNode.push({ name: node.name, registered: nodeReg, unregistered: nodeUnreg, total: nodeReg + nodeUnreg });
  }

  const total = registered + unregistered;
  return {
    totalDevices: total,
    registered,
    unregistered,
    registrationRate: total > 0 ? Math.round((registered / total) * 10000) / 100 : 0,
    byModel,
    byProtocol,
    byNode,
  };
}

export async function handleDeviceTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const creds = resolveCredentials(args);

    if (name === "device_status") {
      const result = await getCachedDeviceStatus(creds, args);
      if (args.summaryOnly) {
        return jsonResponse(buildSummary(result));
      }
      // Response size management
      const allDevices = result.cmNodes.flatMap(n => n.devices);
      const responseSize = JSON.stringify(allDevices).length;
      if (responseSize > 200_000) {
        const summary = buildSummary(result);
        return jsonResponse({ ...summary, devices: allDevices.slice(0, 500), truncated: true, note: `Showing first 500 of ${allDevices.length} devices. Use summaryOnly=true for counts.` });
      }
      return jsonResponse(result);
    }

    if (name === "cti_status") {
      const result = await selectCtiItem(creds, {
        ctiMgrClass: args.ctiMgrClass as string | undefined,
        maxItems: args.maxItems as number | undefined,
        appId: args.appId as string | undefined,
        nodeName: args.nodeName as string | undefined,
        status: args.status as string | undefined,
        timeoutMs: args.timeoutMs as number | undefined,
      });
      return jsonResponse(result);
    }

    return { content: [{ type: "text", text: `Unknown device tool: ${name}` }], isError: true };
  } catch (err) {
    return { content: [{ type: "text", text: toJsonError(err) }], isError: true };
  }
}

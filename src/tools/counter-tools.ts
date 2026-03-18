import type { ToolDefinition, ToolResult } from "./types.js";
import { jsonResponse } from "./types.js";
import { resolveCredentials } from "../lib/credential-resolver.js";
import {
  perfmonCollectCounterData,
  perfmonListCounter,
  perfmonListInstance,
  startMonitor,
  stopMonitor,
  getMonitorJob,
} from "../services/perfmon/index.js";
import { COUNTER_PRESETS, computeStats } from "../types/perfmon-types.js";
import { toJsonError } from "../types/errors.js";

const credentialProperties = {
  cucm_host: { type: "string", description: "CUCM hostname (overrides CUCM_HOST env)" },
  cucm_username: { type: "string", description: "CUCM username (overrides CUCM_USERNAME env)" },
  cucm_password: { type: "string", description: "CUCM password (overrides CUCM_PASSWORD env)" },
};

export const counterTools: ToolDefinition[] = [
  {
    name: "counter_snapshot",
    description: "One-shot collection of PerfMon counter values. Use presets for common scenarios: call_processing, registration, sip, media, system. Or specify a custom object name.",
    inputSchema: {
      type: "object",
      properties: {
        preset: { type: "string", enum: ["call_processing", "registration", "sip", "media", "system"], description: "Counter preset (recommended -- avoids needing to know counter names)" },
        object: { type: "string", description: "Custom PerfMon object name (e.g., 'Cisco CallManager'). Ignored if preset is set." },
        perfmonHost: { type: "string", description: "PerfMon target host (usually same as CUCM host)" },
        timeoutMs: { type: "number", description: "Request timeout in milliseconds" },
        ...credentialProperties,
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "counter_list",
    description: "Discover available PerfMon counter objects and their counters on a CUCM node.",
    inputSchema: {
      type: "object",
      properties: {
        perfmonHost: { type: "string", description: "PerfMon target host" },
        timeoutMs: { type: "number" },
        ...credentialProperties,
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "counter_instances",
    description: "List instances of a PerfMon object (e.g., each DN for 'Cisco Lines Active').",
    inputSchema: {
      type: "object",
      properties: {
        perfmonHost: { type: "string", description: "PerfMon target host" },
        object: { type: "string", description: "PerfMon object name" },
        timeoutMs: { type: "number" },
        ...credentialProperties,
      },
      required: ["object"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "counter_monitor_start",
    description: "Start background PerfMon monitoring. Returns immediately with a monitorId. Use counter_monitor_results to read accumulated samples, counter_monitor_stop to end monitoring.",
    inputSchema: {
      type: "object",
      properties: {
        preset: { type: "string", enum: ["call_processing", "registration", "sip", "media", "system"], description: "Counter preset" },
        object: { type: "string", description: "Custom PerfMon object name (ignored if preset is set)" },
        counters: { type: "array", items: { type: "string" }, description: "Specific counter names (optional -- if omitted, collects all counters for the object)" },
        perfmonHost: { type: "string", description: "PerfMon target host" },
        intervalMs: { type: "number", description: "Polling interval in ms (5000-60000, default 10000)" },
        maxSamples: { type: "number", description: "Auto-stop after this many samples (default 100)" },
        ...credentialProperties,
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: "counter_monitor_results",
    description: "Read accumulated samples from a running or completed monitor job. Returns per-counter statistics: min/max/avg for gauges, delta/rate for counters.",
    inputSchema: {
      type: "object",
      properties: {
        monitorId: { type: "string", description: "Monitor ID from counter_monitor_start" },
      },
      required: ["monitorId"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "counter_monitor_stop",
    description: "Stop a running monitor, close PerfMon session, and return final statistics.",
    inputSchema: {
      type: "object",
      properties: {
        monitorId: { type: "string", description: "Monitor ID from counter_monitor_start" },
      },
      required: ["monitorId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

function resolvePreset(args: Record<string, unknown>): { object: string; counters?: string[] } {
  const presetName = args.preset as string | undefined;
  if (presetName && COUNTER_PRESETS[presetName]) {
    return COUNTER_PRESETS[presetName]!;
  }
  const object = args.object as string;
  if (!object) throw new Error("Either preset or object is required");
  const counters = args.counters as string[] | undefined;
  return { object, counters };
}

export async function handleCounterTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    // counter_monitor_results and counter_monitor_stop don't need credentials
    if (name === "counter_monitor_results") {
      const monitorId = args.monitorId as string;
      const job = getMonitorJob(monitorId);
      if (!job) return { content: [{ type: "text", text: `Monitor ${monitorId} not found` }], isError: true };

      const allCounterNames = new Set<string>();
      for (const sample of job.samples) {
        for (const c of sample.counters) allCounterNames.add(c.name);
      }
      const stats = Array.from(allCounterNames).map(name => computeStats(job.samples, name));

      return jsonResponse({
        monitorId: job.monitorId,
        status: job.status,
        samplesCollected: job.samples.length,
        maxSamples: job.maxSamples,
        durationMs: (job.stoppedAt ?? Date.now()) - job.startedAt,
        stats,
      });
    }

    if (name === "counter_monitor_stop") {
      const monitorId = args.monitorId as string;
      const job = await stopMonitor(monitorId);
      if (!job) return { content: [{ type: "text", text: `Monitor ${monitorId} not found` }], isError: true };

      const allCounterNames = new Set<string>();
      for (const sample of job.samples) {
        for (const c of sample.counters) allCounterNames.add(c.name);
      }
      const stats = Array.from(allCounterNames).map(name => computeStats(job.samples, name));

      return jsonResponse({
        monitorId: job.monitorId,
        status: job.status,
        samplesCollected: job.samples.length,
        durationMs: (job.stoppedAt ?? Date.now()) - job.startedAt,
        stats,
      });
    }

    const creds = resolveCredentials(args);
    const perfmonHost = (args.perfmonHost as string) || creds.host;

    if (name === "counter_snapshot") {
      const { object, counters: filterCounters } = resolvePreset(args);
      const values = await perfmonCollectCounterData(creds, perfmonHost, object, args.timeoutMs as number | undefined);
      const filtered = filterCounters
        ? values.filter(v => filterCounters.some(fc => v.name === fc || v.name.endsWith(`\\${fc}`)))
        : values;
      return jsonResponse({ object, host: perfmonHost, counters: filtered });
    }

    if (name === "counter_list") {
      const result = await perfmonListCounter(creds, perfmonHost, args.timeoutMs as number | undefined);
      return jsonResponse(result);
    }

    if (name === "counter_instances") {
      const object = args.object as string;
      const result = await perfmonListInstance(creds, perfmonHost, object, args.timeoutMs as number | undefined);
      return jsonResponse({ object, instances: result });
    }

    if (name === "counter_monitor_start") {
      const { object, counters } = resolvePreset(args);
      const intervalMs = Math.max(5000, Math.min(60000, Number(args.intervalMs) || 10000));
      const maxSamples = Math.max(1, Math.min(1000, Number(args.maxSamples) || 100));

      // If no specific counters, fetch available ones
      let counterNames = counters;
      if (!counterNames) {
        const available = await perfmonCollectCounterData(creds, perfmonHost, object);
        counterNames = available.map(c => c.name);
      }

      const job = await startMonitor(creds, perfmonHost, object, counterNames, intervalMs, maxSamples);
      return jsonResponse({
        monitorId: job.monitorId,
        status: job.status,
        object,
        counters: counterNames,
        intervalMs,
        maxSamples,
        message: "Monitor started. Use counter_monitor_results to read samples, counter_monitor_stop to end.",
      });
    }

    return { content: [{ type: "text", text: `Unknown counter tool: ${name}` }], isError: true };
  } catch (err) {
    return { content: [{ type: "text", text: toJsonError(err) }], isError: true };
  }
}

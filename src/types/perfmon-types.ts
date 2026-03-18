export interface PerfmonCounterValue {
  name: string;
  value: number;
  cStatus: number;
}

export interface PerfmonCounterInfo {
  objectName: string;
  multiInstance: boolean;
  counters: string[];
}

export interface TimestampedSample {
  timestamp: number;
  counters: PerfmonCounterValue[];
}

export interface MonitorJob {
  monitorId: string;
  host: string;
  perfmonHost: string;
  object: string;
  counters: string[];
  sessionHandle: string;
  intervalMs: number;
  maxSamples: number;
  samples: TimestampedSample[];
  status: "running" | "completed" | "stopped" | "error";
  error?: string;
  startedAt: number;
  stoppedAt?: number;
}

export type CounterType = "gauge" | "counter" | "unknown";

export interface CounterStats {
  name: string;
  type: CounterType;
  values: number[];
  timestamps: number[];
  min: number;
  max: number;
  avg: number;
  delta: number;
  rate: number;
  latest: number;
}

/** Known counter classifications for presets */
export const GAUGE_COUNTERS = new Set([
  "CallsActive",
  "RegisteredHardwarePhones",
  "RegisteredOtherStationDevices",
  "UnregisteredPhoneCount",
  "PartiallyRegisteredPhone",
  "RegisteredAnalogAccess",
  "RegisteredMGCPGateway",
  "RegisteredH323Gateway",
]);

export const MONOTONIC_COUNTERS = new Set([
  "CallsCompleted",
  "CallsAttempted",
  "CallsInProgress",
]);

export const COUNTER_PRESETS: Record<string, { object: string; counters?: string[] }> = {
  call_processing: { object: "Cisco CallManager", counters: ["CallsActive", "CallsAttempted", "CallsCompleted"] },
  registration: { object: "Cisco CallManager", counters: ["RegisteredHardwarePhones", "RegisteredOtherStationDevices", "UnregisteredPhoneCount"] },
  sip: { object: "Cisco SIP" },
  media: { object: "Cisco CallManager", counters: ["VideoCallsActive", "VideoCallsCompleted"] },
  system: { object: "Processor" },
};

/** Extract bare counter name from full PerfMon path (e.g., \\\\host\\Object\\Counter → Counter) */
export function bareCounterName(name: string): string {
  const lastSlash = name.lastIndexOf("\\");
  return lastSlash >= 0 ? name.slice(lastSlash + 1) : name;
}

export function classifyCounter(name: string): CounterType {
  const bare = bareCounterName(name);
  if (GAUGE_COUNTERS.has(bare)) return "gauge";
  if (MONOTONIC_COUNTERS.has(bare)) return "counter";
  return "unknown";
}

export function computeStats(samples: TimestampedSample[], counterName: string): CounterStats {
  const type = classifyCounter(counterName);
  const values: number[] = [];
  const timestamps: number[] = [];

  for (const sample of samples) {
    const c = sample.counters.find(cv => cv.name === counterName);
    if (c) {
      values.push(c.value);
      timestamps.push(sample.timestamp);
    }
  }

  if (values.length === 0) {
    return { name: counterName, type, values: [], timestamps: [], min: 0, max: 0, avg: 0, delta: 0, rate: 0, latest: 0 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const delta = values[values.length - 1]! - values[0]!;
  const durationSec = (timestamps[timestamps.length - 1]! - timestamps[0]!) / 1000;
  const rate = durationSec > 0 ? delta / durationSec : 0;
  const latest = values[values.length - 1]!;

  return { name: counterName, type, values, timestamps, min, max, avg, delta, rate, latest };
}

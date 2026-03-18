import { describe, it, expect } from "vitest";
import { getTools } from "../src/tools/index.js";
import { computeStats, classifyCounter, bareCounterName, COUNTER_PRESETS } from "../src/types/perfmon-types.js";
import type { TimestampedSample } from "../src/types/perfmon-types.js";

describe("MCP Conformance", () => {
  const tools = getTools();

  it("should have 10 tools", () => {
    expect(tools.length).toBe(10);
  });

  it("all tools have required fields", () => {
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.annotations).toBeTruthy();
    }
  });

  it("tool names are unique", () => {
    const names = tools.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("read-only tools are not destructive", () => {
    for (const tool of tools) {
      if (tool.annotations?.readOnlyHint) {
        expect(tool.annotations?.destructiveHint).toBeFalsy();
      }
    }
  });

  it("expected tool names exist", () => {
    const names = new Set(tools.map(t => t.name));
    expect(names.has("device_status")).toBe(true);
    expect(names.has("cti_status")).toBe(true);
    expect(names.has("counter_snapshot")).toBe(true);
    expect(names.has("counter_list")).toBe(true);
    expect(names.has("counter_instances")).toBe(true);
    expect(names.has("counter_monitor_start")).toBe(true);
    expect(names.has("counter_monitor_results")).toBe(true);
    expect(names.has("counter_monitor_stop")).toBe(true);
    expect(names.has("phone_summary")).toBe(true);
    expect(names.has("registration_health")).toBe(true);
  });
});

describe("Counter type classification", () => {
  it("classifies gauge counters", () => {
    expect(classifyCounter("CallsActive")).toBe("gauge");
    expect(classifyCounter("RegisteredHardwarePhones")).toBe("gauge");
    expect(classifyCounter("PartiallyRegisteredPhone")).toBe("gauge");
  });

  it("classifies monotonic counters", () => {
    expect(classifyCounter("CallsCompleted")).toBe("counter");
    expect(classifyCounter("CallsAttempted")).toBe("counter");
  });

  it("classifies unknown counters", () => {
    expect(classifyCounter("SomethingCustom")).toBe("unknown");
  });

  it("classifies counters from full PerfMon paths", () => {
    expect(classifyCounter("\\\\192.168.1.1\\Cisco CallManager\\CallsActive")).toBe("gauge");
    expect(classifyCounter("\\\\192.168.1.1\\Cisco CallManager\\CallsCompleted")).toBe("counter");
  });
});

describe("bareCounterName", () => {
  it("extracts bare name from full path", () => {
    expect(bareCounterName("\\\\192.168.1.1\\Cisco CallManager\\CallsActive")).toBe("CallsActive");
  });

  it("returns bare name unchanged", () => {
    expect(bareCounterName("CallsActive")).toBe("CallsActive");
  });

  it("handles empty string", () => {
    expect(bareCounterName("")).toBe("");
  });
});

describe("Counter presets", () => {
  it("registration preset uses valid counter names", () => {
    const preset = COUNTER_PRESETS.registration;
    expect(preset).toBeDefined();
    expect(preset!.object).toBe("Cisco CallManager");
    expect(preset!.counters).toContain("RegisteredHardwarePhones");
    expect(preset!.counters).toContain("RegisteredOtherStationDevices");
    expect(preset!.counters).toContain("PartiallyRegisteredPhone");
    // UnregisteredPhoneCount does NOT exist on CUCM 15
    expect(preset!.counters).not.toContain("UnregisteredPhoneCount");
  });

  it("call_processing preset has expected counters", () => {
    const preset = COUNTER_PRESETS.call_processing;
    expect(preset!.counters).toContain("CallsActive");
    expect(preset!.counters).toContain("CallsAttempted");
    expect(preset!.counters).toContain("CallsCompleted");
  });

  it("all presets have an object name", () => {
    for (const [name, preset] of Object.entries(COUNTER_PRESETS)) {
      expect(preset.object, `preset ${name} missing object`).toBeTruthy();
    }
  });
});

describe("computeStats", () => {
  const samples: TimestampedSample[] = [
    { timestamp: 1000, counters: [{ name: "CallsActive", value: 5, cStatus: 1 }, { name: "CallsCompleted", value: 100, cStatus: 1 }] },
    { timestamp: 6000, counters: [{ name: "CallsActive", value: 8, cStatus: 1 }, { name: "CallsCompleted", value: 103, cStatus: 1 }] },
    { timestamp: 11000, counters: [{ name: "CallsActive", value: 3, cStatus: 1 }, { name: "CallsCompleted", value: 108, cStatus: 1 }] },
  ];

  it("computes min/max/avg for gauge counters", () => {
    const stats = computeStats(samples, "CallsActive");
    expect(stats.type).toBe("gauge");
    expect(stats.min).toBe(3);
    expect(stats.max).toBe(8);
    expect(stats.avg).toBeCloseTo(5.33, 1);
    expect(stats.latest).toBe(3);
  });

  it("computes delta/rate for monotonic counters", () => {
    const stats = computeStats(samples, "CallsCompleted");
    expect(stats.type).toBe("counter");
    expect(stats.delta).toBe(8); // 108 - 100
    expect(stats.rate).toBeCloseTo(0.8, 1); // 8 / 10 seconds
    expect(stats.latest).toBe(108);
  });

  it("uses actual timestamps for rate calculation", () => {
    const stats = computeStats(samples, "CallsCompleted");
    // Duration is 11000 - 1000 = 10000ms = 10s
    // Delta is 8, so rate = 8/10 = 0.8 per second
    expect(stats.rate).toBeCloseTo(0.8, 2);
  });

  it("handles empty samples", () => {
    const stats = computeStats([], "CallsActive");
    expect(stats.values).toHaveLength(0);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(0);
    expect(stats.avg).toBe(0);
    expect(stats.rate).toBe(0);
  });

  it("handles counter not found in samples", () => {
    const stats = computeStats(samples, "NonExistentCounter");
    expect(stats.type).toBe("unknown");
    expect(stats.values).toHaveLength(0);
  });
});

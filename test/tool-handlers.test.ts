import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock credential resolver
vi.mock("../src/lib/credential-resolver.js", () => ({
  resolveCredentials: vi.fn((overrides?: Record<string, unknown>) => ({
    host: overrides?.cucm_host ?? "cucm1",
    username: overrides?.cucm_username ?? "admin",
    password: overrides?.cucm_password ?? "pass",
    port: overrides?.cucm_port ?? 8443,
  })),
}));

// Mock RIS service
vi.mock("../src/services/ris/index.js", () => ({
  selectCmDeviceAll: vi.fn(),
  selectCtiItem: vi.fn(),
}));

// Mock PerfMon service
vi.mock("../src/services/perfmon/index.js", () => ({
  perfmonCollectCounterData: vi.fn(),
  perfmonListCounter: vi.fn(),
  perfmonListInstance: vi.fn(),
  startMonitor: vi.fn(),
  stopMonitor: vi.fn(),
  getMonitorJob: vi.fn(),
}));

vi.mock("../src/lib/logger.js", () => ({
  log: vi.fn(),
}));

import { handleDeviceTool } from "../src/tools/device-tools.js";
import { handleCounterTool } from "../src/tools/counter-tools.js";
import { handleInsightTool } from "../src/tools/insight-tools.js";
import { getTools, handleTool } from "../src/tools/index.js";
import { selectCmDeviceAll, selectCtiItem } from "../src/services/ris/index.js";
import { perfmonCollectCounterData, perfmonListCounter, perfmonListInstance, startMonitor, stopMonitor, getMonitorJob } from "../src/services/perfmon/index.js";

const mockSelectCmDeviceAll = selectCmDeviceAll as ReturnType<typeof vi.fn>;
const mockSelectCtiItem = selectCtiItem as ReturnType<typeof vi.fn>;
const mockPerfmonCollect = perfmonCollectCounterData as ReturnType<typeof vi.fn>;
const mockPerfmonListCounter = perfmonListCounter as ReturnType<typeof vi.fn>;
const mockPerfmonListInstance = perfmonListInstance as ReturnType<typeof vi.fn>;
const mockStartMonitor = startMonitor as ReturnType<typeof vi.fn>;
const mockStopMonitor = stopMonitor as ReturnType<typeof vi.fn>;
const mockGetMonitorJob = getMonitorJob as ReturnType<typeof vi.fn>;

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CUCM_HOST = "cucm1";
  process.env.CUCM_USERNAME = "admin";
  process.env.CUCM_PASSWORD = "pass";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("handleDeviceTool - device_status", () => {
  it("returns summary when summaryOnly is true", async () => {
    mockSelectCmDeviceAll.mockResolvedValue({
      totalDevicesFound: 10,
      cmNodes: [{
        name: "node1",
        returnCode: "Ok",
        devices: [
          { name: "SEP001", status: "Registered", activeLoadId: "fw1", protocol: "SIP" },
          { name: "SEP002", status: "Registered", activeLoadId: "fw1", protocol: "SIP" },
          { name: "SEP003", status: "UnRegistered", activeLoadId: "fw1", protocol: "SCCP" },
        ],
      }],
    });

    const result = await handleDeviceTool("device_status", { summaryOnly: true, cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.totalDevices).toBe(3);
    expect(parsed.registered).toBe(2);
    expect(parsed.unregistered).toBe(1);
    expect(parsed.registrationRate).toBeCloseTo(66.67, 1);
  });

  it("returns full result with query", async () => {
    mockSelectCmDeviceAll.mockResolvedValue({
      totalDevicesFound: 1,
      cmNodes: [{
        name: "node1",
        returnCode: "Ok",
        devices: [{ name: "SEP001", status: "Registered", protocol: "SIP", activeLoadId: "fw1" }],
      }],
    });

    // Use forceRefresh + query to bypass cache entirely
    const result = await handleDeviceTool("device_status", { query: "SEP001", forceRefresh: true, cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.cmNodes[0].devices).toHaveLength(1);
    expect(parsed.cmNodes[0].devices[0].name).toBe("SEP001");
  });

  it("truncates response larger than 200KB", async () => {
    // Create a large device list that exceeds 200KB when JSON-serialized
    const devices = Array.from({ length: 2000 }, (_, i) => ({
      name: `SEP${"0".repeat(12)}${i}`.slice(-15),
      status: "Registered",
      activeLoadId: "firmware-load-id-string-that-is-quite-long",
      protocol: "SIP",
      description: "A".repeat(300), // Make each device large enough
      ipAddress: "10.1.1.1",
      dirNumber: "100" + i,
      deviceClass: "Phone",
      model: 684,
      product: 684,
    }));

    mockSelectCmDeviceAll.mockResolvedValue({
      totalDevicesFound: 2000,
      cmNodes: [{ name: "node1", returnCode: "Ok", devices }],
    });

    // Use query to bypass cache, and forceRefresh just in case
    const result = await handleDeviceTool("device_status", { query: "SEP*", forceRefresh: true, cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.truncated).toBe(true);
    expect(parsed.devices.length).toBeLessThanOrEqual(500);
  });
});

describe("handleDeviceTool - cti_status", () => {
  it("returns CTI result", async () => {
    mockSelectCtiItem.mockResolvedValue({
      totalItemsFound: 1,
      items: [{ name: "Provider1", status: "Open", appId: "CiscoJTAPI" }],
    });

    const result = await handleDeviceTool("cti_status", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.totalItemsFound).toBe(1);
  });

  it("returns graceful empty state on SOAP 500 unknown", async () => {
    mockSelectCtiItem.mockRejectedValue(new Error("CUCM Serviceability HTTP 500: unknown"));

    const result = await handleDeviceTool("cti_status", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.totalItemsFound).toBe(0);
    expect(parsed.items).toEqual([]);
    expect(parsed.note).toContain("No CTI applications");
  });

  it("re-throws non-500-unknown errors", async () => {
    mockSelectCtiItem.mockRejectedValue(new Error("HTTP 401 Unauthorized"));

    const result = await handleDeviceTool("cti_status", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBe(true);
  });
});

describe("handleDeviceTool - unknown tool", () => {
  it("returns error for unknown tool name", async () => {
    const result = await handleDeviceTool("nonexistent", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Unknown device tool");
  });
});

describe("handleCounterTool - counter_snapshot", () => {
  it("uses preset to fetch counters", async () => {
    mockPerfmonCollect.mockResolvedValue([
      { name: "\\\\cucm1\\Cisco CallManager\\CallsActive", value: 5, cStatus: 1 },
      { name: "\\\\cucm1\\Cisco CallManager\\CallsAttempted", value: 100, cStatus: 1 },
      { name: "\\\\cucm1\\Cisco CallManager\\CallsCompleted", value: 90, cStatus: 1 },
      { name: "\\\\cucm1\\Cisco CallManager\\SomeOtherCounter", value: 50, cStatus: 1 },
    ]);

    const result = await handleCounterTool("counter_snapshot", { preset: "call_processing", cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    // Should filter to only the preset counters
    expect(parsed.counters).toHaveLength(3);
  });

  it("uses custom object name", async () => {
    mockPerfmonCollect.mockResolvedValue([
      { name: "Counter1", value: 10, cStatus: 1 },
    ]);

    const result = await handleCounterTool("counter_snapshot", { object: "Custom Object", cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.object).toBe("Custom Object");
  });

  it("throws when neither preset nor object provided", async () => {
    const result = await handleCounterTool("counter_snapshot", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBe(true);
  });
});

describe("handleCounterTool - counter_list", () => {
  it("returns counter list", async () => {
    mockPerfmonListCounter.mockResolvedValue([
      { objectName: "Cisco CallManager", multiInstance: true, counters: ["CallsActive"] },
    ]);

    const result = await handleCounterTool("counter_list", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed[0].objectName).toBe("Cisco CallManager");
  });
});

describe("handleCounterTool - counter_instances", () => {
  it("returns instances", async () => {
    mockPerfmonListInstance.mockResolvedValue(["Instance1", "Instance2"]);

    const result = await handleCounterTool("counter_instances", { object: "Cisco Lines Active", cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.instances).toEqual(["Instance1", "Instance2"]);
  });
});

describe("handleCounterTool - counter_monitor_start", () => {
  it("starts monitor with preset", async () => {
    mockStartMonitor.mockResolvedValue({
      monitorId: "mon-789",
      status: "running",
      object: "Cisco CallManager",
      counters: ["CallsActive", "CallsAttempted", "CallsCompleted"],
      intervalMs: 10000,
      maxSamples: 100,
    });

    const result = await handleCounterTool("counter_monitor_start", {
      preset: "call_processing",
      cucm_host: "cucm1",
      cucm_username: "admin",
      cucm_password: "pass",
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.monitorId).toBe("mon-789");
    expect(parsed.status).toBe("running");
  });

  it("starts monitor with custom object and fetches available counters", async () => {
    mockPerfmonCollect.mockResolvedValue([
      { name: "Counter1", value: 1, cStatus: 1 },
      { name: "Counter2", value: 2, cStatus: 1 },
    ]);
    mockStartMonitor.mockResolvedValue({
      monitorId: "mon-custom",
      status: "running",
      object: "Custom Object",
      counters: ["Counter1", "Counter2"],
      intervalMs: 10000,
      maxSamples: 100,
    });

    const result = await handleCounterTool("counter_monitor_start", {
      object: "Custom Object",
      cucm_host: "cucm1",
      cucm_username: "admin",
      cucm_password: "pass",
    });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.monitorId).toBe("mon-custom");
  });

  it("clamps intervalMs to valid range", async () => {
    mockStartMonitor.mockResolvedValue({
      monitorId: "mon-clamp",
      status: "running",
      object: "Cisco CallManager",
      counters: ["CallsActive"],
      intervalMs: 5000,
      maxSamples: 100,
    });

    const result = await handleCounterTool("counter_monitor_start", {
      preset: "call_processing",
      intervalMs: 1000, // Below min of 5000
      cucm_host: "cucm1",
      cucm_username: "admin",
      cucm_password: "pass",
    });
    expect(result.isError).toBeUndefined();
    // The handler should clamp to 5000
    expect(mockStartMonitor).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      5000,
      expect.anything(),
    );
  });
});

describe("handleCounterTool - counter_monitor_results", () => {
  it("returns monitor job not found error", async () => {
    mockGetMonitorJob.mockReturnValue(null);

    const result = await handleCounterTool("counter_monitor_results", { monitorId: "non-existent" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  it("returns stats for existing monitor", async () => {
    mockGetMonitorJob.mockReturnValue({
      monitorId: "mon-123",
      status: "running",
      maxSamples: 10,
      startedAt: 1000,
      samples: [
        { timestamp: 1000, counters: [{ name: "CallsActive", value: 5, cStatus: 1 }] },
        { timestamp: 6000, counters: [{ name: "CallsActive", value: 8, cStatus: 1 }] },
      ],
    });

    const result = await handleCounterTool("counter_monitor_results", { monitorId: "mon-123" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.monitorId).toBe("mon-123");
    expect(parsed.samplesCollected).toBe(2);
    expect(parsed.stats).toHaveLength(1);
    expect(parsed.stats[0].name).toBe("CallsActive");
  });
});

describe("handleCounterTool - counter_monitor_stop", () => {
  it("returns error when monitor not found", async () => {
    mockStopMonitor.mockResolvedValue(null);

    const result = await handleCounterTool("counter_monitor_stop", { monitorId: "non-existent" });
    expect(result.isError).toBe(true);
  });

  it("returns final stats when monitor stopped", async () => {
    mockStopMonitor.mockResolvedValue({
      monitorId: "mon-456",
      status: "completed",
      startedAt: 1000,
      stoppedAt: 11000,
      samples: [
        { timestamp: 1000, counters: [{ name: "CallsActive", value: 3, cStatus: 1 }] },
      ],
    });

    const result = await handleCounterTool("counter_monitor_stop", { monitorId: "mon-456" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.monitorId).toBe("mon-456");
    expect(parsed.status).toBe("completed");
    expect(parsed.durationMs).toBe(10000);
  });
});

describe("handleCounterTool - unknown tool", () => {
  it("returns error for unknown counter tool name", async () => {
    const result = await handleCounterTool("nonexistent", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Unknown counter tool");
  });
});

describe("handleInsightTool - phone_summary", () => {
  it("delegates to device_status with summaryOnly", async () => {
    mockSelectCmDeviceAll.mockResolvedValue({
      totalDevicesFound: 5,
      cmNodes: [{
        name: "node1",
        returnCode: "Ok",
        devices: [
          { name: "SEP001", status: "Registered", activeLoadId: "fw1", protocol: "SIP" },
          { name: "SEP002", status: "Registered", activeLoadId: "fw1", protocol: "SIP" },
        ],
      }],
    });

    // Use forceRefresh to bypass any cached results from previous tests
    const result = await handleInsightTool("phone_summary", { forceRefresh: true, cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.totalDevices).toBe(2);
    expect(parsed.registered).toBe(2);
  });
});

describe("handleInsightTool - registration_health", () => {
  it("combines RIS and PerfMon results", async () => {
    mockSelectCmDeviceAll.mockResolvedValue({
      totalDevicesFound: 3,
      cmNodes: [{
        name: "cucm-pub",
        returnCode: "Ok",
        devices: [
          { name: "SEP001", status: "Registered" },
          { name: "SEP002", status: "Registered" },
          { name: "SEP003", status: "UnRegistered" },
        ],
      }],
    });
    mockPerfmonCollect.mockResolvedValue([
      { name: "CallsActive", value: 10, cStatus: 1 },
      { name: "RegisteredHardwarePhones", value: 2, cStatus: 1 },
    ]);

    const result = await handleInsightTool("registration_health", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.overall.totalDevices).toBe(3);
    expect(parsed.overall.registered).toBe(2);
    expect(parsed.overall.unregistered).toBe(1);
    expect(parsed.overall.registrationRate).toBeCloseTo(66.67, 1);
    expect(parsed.counters.CallsActive).toBe(10);
    expect(parsed.nodes).toHaveLength(1);
  });

  it("generates alert when node below threshold", async () => {
    mockSelectCmDeviceAll.mockResolvedValue({
      totalDevicesFound: 2,
      cmNodes: [{
        name: "cucm-pub",
        returnCode: "Ok",
        devices: [
          { name: "SEP001", status: "Registered" },
          { name: "SEP002", status: "UnRegistered" },
          { name: "SEP003", status: "UnRegistered" },
          { name: "SEP004", status: "UnRegistered" },
        ],
      }],
    });
    mockPerfmonCollect.mockResolvedValue([]);

    const result = await handleInsightTool("registration_health", { alertThreshold: 80, cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.alerts.length).toBeGreaterThan(0);
    expect(parsed.alerts[0]).toContain("below");
  });

  it("handles RIS failure gracefully", async () => {
    mockSelectCmDeviceAll.mockRejectedValue(new Error("connection refused"));
    mockPerfmonCollect.mockResolvedValue([]);

    const result = await handleInsightTool("registration_health", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.alerts.some((a: string) => a.includes("RIS query failed"))).toBe(true);
  });

  it("handles PerfMon failure gracefully", async () => {
    mockSelectCmDeviceAll.mockResolvedValue({
      totalDevicesFound: 0,
      cmNodes: [],
    });
    mockPerfmonCollect.mockRejectedValue(new Error("timeout"));

    const result = await handleInsightTool("registration_health", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.alerts.some((a: string) => a.includes("PerfMon query failed"))).toBe(true);
    expect(parsed.counters).toBeNull();
  });
});

describe("handleInsightTool - unknown tool", () => {
  it("returns error for unknown insight tool", async () => {
    const result = await handleInsightTool("nonexistent", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBe(true);
  });
});

describe("getTools", () => {
  it("returns all 10 tools", () => {
    const tools = getTools();
    expect(tools.length).toBe(10);
  });

  it("returns tools with unique names", () => {
    const tools = getTools();
    const names = tools.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("handleTool", () => {
  it("dispatches device_status to device handler", async () => {
    mockSelectCmDeviceAll.mockResolvedValue({
      totalDevicesFound: 0,
      cmNodes: [],
    });

    const result = await handleTool("device_status", { summaryOnly: true, cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
  });

  it("dispatches counter_list to counter handler", async () => {
    mockPerfmonListCounter.mockResolvedValue([]);

    const result = await handleTool("counter_list", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
  });

  it("dispatches phone_summary to insight handler", async () => {
    mockSelectCmDeviceAll.mockResolvedValue({
      totalDevicesFound: 0,
      cmNodes: [],
    });

    const result = await handleTool("phone_summary", { cucm_host: "cucm1", cucm_username: "admin", cucm_password: "pass" });
    expect(result.isError).toBeUndefined();
  });

  it("returns error for unknown tool", async () => {
    const result = await handleTool("totally_unknown", {});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Unknown tool");
  });
});

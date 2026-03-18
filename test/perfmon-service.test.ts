import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/soap-client.js", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    fetchServiceabilitySoap: vi.fn(),
  };
});

vi.mock("../src/lib/rate-limiter.js", () => ({
  withRateLimit: vi.fn((_host: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../src/lib/logger.js", () => ({
  log: vi.fn(),
}));

import {
  perfmonCollectCounterData,
  perfmonListCounter,
  perfmonListInstance,
  perfmonOpenSession,
  perfmonAddCounter,
  perfmonCollectSessionData,
  perfmonCloseSession,
  getActiveMonitors,
  getMonitorJob,
} from "../src/services/perfmon/index.js";
import { fetchServiceabilitySoap } from "../src/lib/soap-client.js";

const mockFetch = fetchServiceabilitySoap as ReturnType<typeof vi.fn>;
const baseCreds = { host: "cucm1", username: "admin", password: "pass", port: 8443 };

describe("perfmonCollectCounterData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns parsed counter values", async () => {
    mockFetch.mockResolvedValue({
      perfmonCollectCounterDataResponse: {
        ArrayOfCounterInfo: {
          item: [
            { Name: "\\\\cucm1\\Cisco CallManager\\CallsActive", Value: 5, CStatus: 1 },
            { Name: "\\\\cucm1\\Cisco CallManager\\CallsCompleted", Value: 100, CStatus: 1 },
          ],
        },
      },
    });

    const result = await perfmonCollectCounterData(baseCreds, "cucm1", "Cisco CallManager");
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toContain("CallsActive");
    expect(result[0]!.value).toBe(5);
    expect(result[0]!.cStatus).toBe(1);
  });

  it("handles empty response", async () => {
    mockFetch.mockResolvedValue({
      perfmonCollectCounterDataResponse: {},
    });

    const result = await perfmonCollectCounterData(baseCreds, "cucm1", "Cisco CallManager");
    expect(result).toEqual([]);
  });
});

describe("perfmonListCounter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns counter info list", async () => {
    mockFetch.mockResolvedValue({
      perfmonListCounterResponse: {
        ArrayOfObjectInfo: {
          item: [
            {
              Name: "Cisco CallManager",
              MultiInstance: true,
              ArrayOfCounter: {
                item: [{ Name: "CallsActive" }, { Name: "CallsCompleted" }],
              },
            },
          ],
        },
      },
    });

    const result = await perfmonListCounter(baseCreds, "cucm1");
    expect(result).toHaveLength(1);
    expect(result[0]!.objectName).toBe("Cisco CallManager");
    expect(result[0]!.multiInstance).toBe(true);
    expect(result[0]!.counters).toContain("CallsActive");
    expect(result[0]!.counters).toContain("CallsCompleted");
  });

  it("handles string MultiInstance 'true'", async () => {
    mockFetch.mockResolvedValue({
      perfmonListCounterResponse: {
        ArrayOfObjectInfo: {
          item: [{ Name: "Obj", MultiInstance: "true", ArrayOfCounter: { item: [] } }],
        },
      },
    });

    const result = await perfmonListCounter(baseCreds, "cucm1");
    expect(result[0]!.multiInstance).toBe(true);
  });

  it("handles false MultiInstance", async () => {
    mockFetch.mockResolvedValue({
      perfmonListCounterResponse: {
        ArrayOfObjectInfo: {
          item: [{ Name: "Obj", MultiInstance: false, ArrayOfCounter: { item: [] } }],
        },
      },
    });

    const result = await perfmonListCounter(baseCreds, "cucm1");
    expect(result[0]!.multiInstance).toBe(false);
  });
});

describe("perfmonListInstance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns instance names", async () => {
    mockFetch.mockResolvedValue({
      perfmonListInstanceResponse: {
        ArrayOfInstanceInfo: {
          item: [{ Name: "Instance1" }, { Name: "Instance2" }],
        },
      },
    });

    const result = await perfmonListInstance(baseCreds, "cucm1", "Cisco Lines Active");
    expect(result).toEqual(["Instance1", "Instance2"]);
  });
});

describe("perfmonOpenSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns session handle", async () => {
    mockFetch.mockResolvedValue({
      perfmonOpenSessionResponse: {
        perfmonOpenSessionReturn: "session-handle-123",
      },
    });

    const handle = await perfmonOpenSession(baseCreds);
    expect(handle).toBe("session-handle-123");
  });

  it("throws when no session handle returned", async () => {
    mockFetch.mockResolvedValue({
      perfmonOpenSessionResponse: {},
    });

    await expect(perfmonOpenSession(baseCreds)).rejects.toThrow(/no session handle/);
  });
});

describe("perfmonAddCounter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls SOAP service without error", async () => {
    mockFetch.mockResolvedValue({});
    await expect(perfmonAddCounter(baseCreds, "session-123", ["counter1"])).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("perfmonCollectSessionData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns session counter values", async () => {
    mockFetch.mockResolvedValue({
      perfmonCollectSessionDataResponse: {
        ArrayOfCounterInfo: {
          item: [{ Name: "Counter1", Value: 42, CStatus: 1 }],
        },
      },
    });

    const result = await perfmonCollectSessionData(baseCreds, "session-123");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Counter1");
    expect(result[0]!.value).toBe(42);
  });
});

describe("perfmonCloseSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls SOAP service without error", async () => {
    mockFetch.mockResolvedValue({});
    await expect(perfmonCloseSession(baseCreds, "session-123")).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("getActiveMonitors", () => {
  it("returns a Map (may be empty if no monitors started)", () => {
    const monitors = getActiveMonitors();
    expect(monitors).toBeInstanceOf(Map);
  });
});

describe("getMonitorJob", () => {
  it("returns null for unknown monitor ID", () => {
    const job = getMonitorJob("non-existent-id");
    expect(job).toBeNull();
  });
});

describe("startMonitor and stopMonitor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts a monitor, adds it to active, and stops it", async () => {
    // Mock openSession
    mockFetch.mockResolvedValueOnce({
      perfmonOpenSessionResponse: { perfmonOpenSessionReturn: "session-abc" },
    });
    // Mock addCounter
    mockFetch.mockResolvedValueOnce({});

    const { startMonitor, stopMonitor, getMonitorJob, getActiveMonitors } = await import("../src/services/perfmon/index.js");

    const job = await startMonitor(baseCreds, "cucm1", "Cisco CallManager", ["CallsActive"], 60000, 5);
    expect(job.monitorId).toMatch(/^mon-/);
    expect(job.status).toBe("running");
    expect(job.sessionHandle).toBe("session-abc");
    expect(job.object).toBe("Cisco CallManager");

    // Should be in active monitors
    const active = getActiveMonitors();
    expect(active.size).toBeGreaterThanOrEqual(1);

    // Should be retrievable by ID
    const retrieved = getMonitorJob(job.monitorId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.monitorId).toBe(job.monitorId);

    // Mock closeSession for stop
    mockFetch.mockResolvedValueOnce({});

    const stopped = await stopMonitor(job.monitorId);
    expect(stopped).not.toBeNull();
    expect(stopped!.status).toBe("completed");
    expect(stopped!.stoppedAt).toBeDefined();
  });

  it("stopMonitor returns null for unknown ID", async () => {
    const { stopMonitor } = await import("../src/services/perfmon/index.js");
    const result = await stopMonitor("non-existent");
    expect(result).toBeNull();
  });

  it("cleanupAllMonitors stops all active monitors", async () => {
    // Mock openSession
    mockFetch.mockResolvedValueOnce({
      perfmonOpenSessionResponse: { perfmonOpenSessionReturn: "session-cleanup" },
    });
    // Mock addCounter
    mockFetch.mockResolvedValueOnce({});

    const { startMonitor, cleanupAllMonitors, getActiveMonitors } = await import("../src/services/perfmon/index.js");

    await startMonitor(baseCreds, "cucm1", "Cisco CallManager", ["CallsActive"], 60000, 5);

    // Mock closeSession
    mockFetch.mockResolvedValueOnce({});

    await cleanupAllMonitors();
    // After cleanup, job should be moved to completed (still retrievable via getMonitorJob but not active)
  });

  it("stopMonitor handles close session failure gracefully", async () => {
    // Mock openSession
    mockFetch.mockResolvedValueOnce({
      perfmonOpenSessionResponse: { perfmonOpenSessionReturn: "session-fail" },
    });
    // Mock addCounter
    mockFetch.mockResolvedValueOnce({});

    const { startMonitor, stopMonitor } = await import("../src/services/perfmon/index.js");
    const job = await startMonitor(baseCreds, "cucm1", "Cisco CallManager", ["CallsActive"], 60000, 5);

    // Mock closeSession to fail
    mockFetch.mockRejectedValueOnce(new Error("connection refused"));

    const stopped = await stopMonitor(job.monitorId);
    expect(stopped).not.toBeNull();
    expect(stopped!.status).toBe("completed");
  });
});

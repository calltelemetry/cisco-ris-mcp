import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("log", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env.RIS_MCP_LOG_LEVEL;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    if (originalEnv !== undefined) {
      process.env.RIS_MCP_LOG_LEVEL = originalEnv;
    } else {
      delete process.env.RIS_MCP_LOG_LEVEL;
    }
    vi.resetModules();
  });

  it("writes to stderr at threshold level", async () => {
    process.env.RIS_MCP_LOG_LEVEL = "warn";
    const { log } = await import("../src/lib/logger.js");

    log("warn", "warning message");
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0]![0] as string;
    expect(output).toContain("warning message");
  });

  it("writes to stderr above threshold level", async () => {
    process.env.RIS_MCP_LOG_LEVEL = "warn";
    const { log } = await import("../src/lib/logger.js");

    log("error", "error message");
    expect(stderrSpy).toHaveBeenCalled();
  });

  it("suppresses messages below threshold", async () => {
    process.env.RIS_MCP_LOG_LEVEL = "warn";
    const { log } = await import("../src/lib/logger.js");

    log("info", "info message");
    expect(stderrSpy).not.toHaveBeenCalled();

    log("debug", "debug message");
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("includes timestamp, level, and message in output", async () => {
    process.env.RIS_MCP_LOG_LEVEL = "debug";
    const { log } = await import("../src/lib/logger.js");

    log("error", "test message");
    const output = stderrSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.level).toBe("error");
    expect(parsed.msg).toBe("test message");
  });

  it("includes extra data in output", async () => {
    process.env.RIS_MCP_LOG_LEVEL = "debug";
    const { log } = await import("../src/lib/logger.js");

    log("error", "msg", { host: "cucm1", count: 42 });
    const output = stderrSpy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.host).toBe("cucm1");
    expect(parsed.count).toBe(42);
  });
});

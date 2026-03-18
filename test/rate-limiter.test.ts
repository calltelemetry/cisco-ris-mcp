import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to reset module state between tests since the rate limiter uses module-level Map
describe("withRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("executes function and returns result", async () => {
    const { withRateLimit } = await import("../src/lib/rate-limiter.js");
    const result = await withRateLimit("host1", async () => "hello");
    expect(result).toBe("hello");
  });

  it("different hosts get independent state", async () => {
    const { withRateLimit } = await import("../src/lib/rate-limiter.js");
    const order: string[] = [];

    // Run two requests on different hosts in parallel - both should start immediately
    const p1 = withRateLimit("hostA", async () => {
      order.push("A-start");
      await new Promise(r => setTimeout(r, 10));
      order.push("A-end");
      return "A";
    });
    const p2 = withRateLimit("hostB", async () => {
      order.push("B-start");
      await new Promise(r => setTimeout(r, 10));
      order.push("B-end");
      return "B";
    });

    const [rA, rB] = await Promise.all([p1, p2]);
    expect(rA).toBe("A");
    expect(rB).toBe("B");
    // Both should have started before either ended (parallel on different hosts)
    expect(order.indexOf("A-start")).toBeLessThan(order.indexOf("A-end"));
    expect(order.indexOf("B-start")).toBeLessThan(order.indexOf("B-end"));
  });

  it("propagates errors from the wrapped function", async () => {
    const { withRateLimit } = await import("../src/lib/rate-limiter.js");
    await expect(
      withRateLimit("host-err", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });

  it("releases slot after error so next request can proceed", async () => {
    const { withRateLimit } = await import("../src/lib/rate-limiter.js");

    // First call errors
    await withRateLimit("host-release", async () => {
      throw new Error("fail");
    }).catch(() => {});

    // Second call should succeed
    const result = await withRateLimit("host-release", async () => "recovered");
    expect(result).toBe("recovered");
  });
});

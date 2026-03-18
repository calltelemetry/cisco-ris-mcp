import { describe, it, expect } from "vitest";
import { jsonResponse, errorResponse } from "../src/tools/types.js";

describe("jsonResponse", () => {
  it("wraps data in MCP content format", () => {
    const result = jsonResponse({ key: "value", count: 42 });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.key).toBe("value");
    expect(parsed.count).toBe(42);
  });

  it("does not set isError", () => {
    const result = jsonResponse({ ok: true });
    expect(result.isError).toBeUndefined();
  });

  it("handles null data", () => {
    const result = jsonResponse(null);
    expect(JSON.parse(result.content[0]!.text)).toBeNull();
  });

  it("handles array data", () => {
    const result = jsonResponse([1, 2, 3]);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed).toEqual([1, 2, 3]);
  });

  it("pretty-prints JSON with 2-space indent", () => {
    const result = jsonResponse({ a: 1 });
    expect(result.content[0]!.text).toContain("\n");
    expect(result.content[0]!.text).toContain("  ");
  });
});

describe("errorResponse", () => {
  it("sets isError flag to true", () => {
    const result = errorResponse("something failed");
    expect(result.isError).toBe(true);
  });

  it("includes message in content", () => {
    const result = errorResponse("detailed error message");
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toBe("detailed error message");
  });
});

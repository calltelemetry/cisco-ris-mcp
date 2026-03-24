import { describe, it, expect } from "vitest";
import { getTools } from "../src/tools/index.js";

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

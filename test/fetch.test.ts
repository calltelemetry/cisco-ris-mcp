import { describe, it, expect } from "vitest";
import { handleMcpFetchRequest } from "../src/fetch.js";

describe("Universal Fetch / Streamable HTTP Handler", () => {
  it("handles CORS OPTIONS preflight", async () => {
    const req = new Request("https://mcp.internal/mcp", { method: "OPTIONS" });
    const res = await handleMcpFetchRequest(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("handles GET /healthz and /health", async () => {
    const req = new Request("https://mcp.internal/healthz", { method: "GET" });
    const res = await handleMcpFetchRequest(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; tools_count: number };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("cisco-ris-mcp");
    expect(body.tools_count).toBe(10);
  });

  it("handles JSON-RPC initialize", async () => {
    const req = new Request("https://mcp.internal/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2026-07-28",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });

    const res = await handleMcpFetchRequest(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: { protocolVersion: string; serverInfo: { name: string } };
    };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result.protocolVersion).toBe("2026-07-28");
    expect(body.result.serverInfo.name).toBe("cisco-ris-mcp");
  });

  it("handles JSON-RPC notifications/initialized", async () => {
    const req = new Request("https://mcp.internal/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });

    const res = await handleMcpFetchRequest(req);
    expect(res.status).toBe(204);
  });

  it("handles JSON-RPC ping", async () => {
    const req = new Request("https://mcp.internal/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "ping-123",
        method: "ping",
      }),
    });

    const res = await handleMcpFetchRequest(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jsonrpc: string; id: string; result: Record<string, unknown> };
    expect(body.id).toBe("ping-123");
    expect(body.result).toEqual({});
  });

  it("handles JSON-RPC tools/list and returns all 10 tools", async () => {
    const req = new Request("https://mcp.internal/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      }),
    });

    const res = await handleMcpFetchRequest(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: { tools: Array<{ name: string; description: string }> };
    };
    expect(body.result.tools.length).toBe(10);
    const names = body.result.tools.map((t) => t.name);
    expect(names).toContain("device_status");
    expect(names).toContain("phone_summary");
    expect(names).toContain("counter_snapshot");
  });

  it("returns -32700 on malformed JSON", async () => {
    const req = new Request("https://mcp.internal/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const res = await handleMcpFetchRequest(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it("returns -32601 on unknown method", async () => {
    const req = new Request("https://mcp.internal/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "unknown/method",
      }),
    });

    const res = await handleMcpFetchRequest(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32601);
  });

  it("handles tool call with missing credentials gracefully", async () => {
    const req = new Request("https://mcp.internal/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "phone_summary",
          arguments: {},
        },
      }),
    });

    // We pass empty env to simulate unconfigured server
    const res = await handleMcpFetchRequest(req, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: { isError?: boolean; content: Array<{ type: string; text: string }> };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("CUCM host required");
  });
});

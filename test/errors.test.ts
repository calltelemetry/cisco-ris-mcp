import { describe, it, expect } from "vitest";
import { categorizeError, toJsonError } from "../src/types/errors.js";

describe("categorizeError", () => {
  it("categorizes 401 as auth_failed", () => {
    const result = categorizeError(new Error("HTTP 401 Unauthorized"));
    expect(result.category).toBe("auth_failed");
    expect(result.retryable).toBe(false);
    expect(result.error).toBe(true);
  });

  it("categorizes 403 as auth_failed", () => {
    const result = categorizeError(new Error("HTTP 403 Forbidden"));
    expect(result.category).toBe("auth_failed");
  });

  it("categorizes 'unauthorized' as auth_failed", () => {
    const result = categorizeError(new Error("unauthorized access denied"));
    expect(result.category).toBe("auth_failed");
  });

  it("categorizes ECONNREFUSED as unreachable", () => {
    const result = categorizeError(new Error("connect ECONNREFUSED 10.1.1.1:8443"));
    expect(result.category).toBe("unreachable");
    expect(result.retryable).toBe(true);
  });

  it("categorizes ENOTFOUND as unreachable", () => {
    const result = categorizeError(new Error("getaddrinfo ENOTFOUND badhost"));
    expect(result.category).toBe("unreachable");
  });

  it("categorizes timeout as timeout", () => {
    const result = categorizeError(new Error("Request timeout after 30000ms"));
    expect(result.category).toBe("timeout");
    expect(result.retryable).toBe(true);
  });

  it("categorizes abort as timeout", () => {
    const result = categorizeError(new Error("The operation was aborted (abort)"));
    expect(result.category).toBe("timeout");
  });

  it("categorizes ETIMEDOUT as timeout", () => {
    const result = categorizeError(new Error("connect ETIMEDOUT"));
    expect(result.category).toBe("timeout");
  });

  it("categorizes 503 as rate_limited", () => {
    const result = categorizeError(new Error("HTTP 503 Service Unavailable"));
    expect(result.category).toBe("rate_limited");
    expect(result.retryable).toBe(true);
  });

  it("categorizes 'exceeded allowed rate' as rate_limited", () => {
    const result = categorizeError(new Error("exceeded allowed rate of requests"));
    expect(result.category).toBe("rate_limited");
  });

  it("categorizes 404 as not_found", () => {
    const result = categorizeError(new Error("HTTP 404 Not Found"));
    expect(result.category).toBe("not_found");
    expect(result.retryable).toBe(false);
  });

  it("categorizes generic error as server_error", () => {
    const result = categorizeError(new Error("Something went wrong"));
    expect(result.category).toBe("server_error");
    expect(result.retryable).toBe(true);
  });

  it("handles non-Error input (string)", () => {
    const result = categorizeError("plain string error");
    expect(result.category).toBe("server_error");
    expect(result.message).toBe("plain string error");
  });

  it("handles non-Error input (number)", () => {
    const result = categorizeError(42);
    expect(result.message).toBe("42");
  });
});

describe("toJsonError", () => {
  it("returns valid JSON string", () => {
    const json = toJsonError(new Error("test error"));
    const parsed = JSON.parse(json);
    expect(parsed.error).toBe(true);
    expect(parsed.category).toBe("server_error");
    expect(parsed.message).toContain("test error");
    expect(typeof parsed.retryable).toBe("boolean");
  });

  it("returns correct category in JSON", () => {
    const json = toJsonError(new Error("HTTP 401"));
    const parsed = JSON.parse(json);
    expect(parsed.category).toBe("auth_failed");
  });
});

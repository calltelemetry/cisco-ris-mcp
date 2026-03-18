import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveCredentials } from "../src/lib/credential-resolver.js";

describe("resolveCredentials", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all CUCM env vars
    delete process.env.CUCM_HOST;
    delete process.env.CUCM_USERNAME;
    delete process.env.CUCM_PASSWORD;
    delete process.env.CUCM_PORT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns credentials from CUCM_* env vars", () => {
    process.env.CUCM_HOST = "cucm1.example.com";
    process.env.CUCM_USERNAME = "admin";
    process.env.CUCM_PASSWORD = "secret";

    const creds = resolveCredentials();
    expect(creds.host).toBe("cucm1.example.com");
    expect(creds.username).toBe("admin");
    expect(creds.password).toBe("secret");
    expect(creds.port).toBe(8443);
  });

  it("per-call overrides take precedence over env vars", () => {
    process.env.CUCM_HOST = "env-host";
    process.env.CUCM_USERNAME = "env-user";
    process.env.CUCM_PASSWORD = "env-pass";

    const creds = resolveCredentials({
      cucm_host: "override-host",
      cucm_username: "override-user",
      cucm_password: "override-pass",
      cucm_port: 9443,
    });
    expect(creds.host).toBe("override-host");
    expect(creds.username).toBe("override-user");
    expect(creds.password).toBe("override-pass");
    expect(creds.port).toBe(9443);
  });

  it("throws with helpful message when host is missing", () => {
    process.env.CUCM_USERNAME = "admin";
    process.env.CUCM_PASSWORD = "secret";

    expect(() => resolveCredentials()).toThrow(/CUCM host required/);
    expect(() => resolveCredentials()).toThrow(/CUCM_HOST/);
  });

  it("throws when username is missing", () => {
    process.env.CUCM_HOST = "host";
    process.env.CUCM_PASSWORD = "secret";

    expect(() => resolveCredentials()).toThrow(/CUCM username required/);
  });

  it("throws when password is missing", () => {
    process.env.CUCM_HOST = "host";
    process.env.CUCM_USERNAME = "admin";

    expect(() => resolveCredentials()).toThrow(/CUCM password required/);
  });

  it("default port is 8443", () => {
    process.env.CUCM_HOST = "host";
    process.env.CUCM_USERNAME = "admin";
    process.env.CUCM_PASSWORD = "secret";

    const creds = resolveCredentials();
    expect(creds.port).toBe(8443);
  });

  it("CUCM_PORT env overrides default port", () => {
    process.env.CUCM_HOST = "host";
    process.env.CUCM_USERNAME = "admin";
    process.env.CUCM_PASSWORD = "secret";
    process.env.CUCM_PORT = "9999";

    const creds = resolveCredentials();
    expect(creds.port).toBe(9999);
  });

});

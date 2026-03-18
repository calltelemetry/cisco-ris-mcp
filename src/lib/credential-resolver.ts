import type { CucmCredentials, ToolCredentialOverrides } from "../types/credentials.js";

/** CUCM HTTPS port — always 8443, not configurable */
export const CUCM_PORT = 8443;

/**
 * Resolve CUCM credentials from per-call overrides or standard env vars.
 *
 * Standard env vars (shared across all CallTelemetry MCP servers):
 *   CUCM_HOST, CUCM_USERNAME, CUCM_PASSWORD
 *
 * Set these once in ~/.zshrc and all MCP servers use them.
 * Port is always 8443 — not configurable.
 */
export function resolveCredentials(overrides?: ToolCredentialOverrides): CucmCredentials {
  const host = overrides?.cucm_host || process.env.CUCM_HOST;
  const username = overrides?.cucm_username || process.env.CUCM_USERNAME;
  const password = overrides?.cucm_password || process.env.CUCM_PASSWORD;

  if (!host) throw new Error("CUCM host required. Set CUCM_HOST or pass cucm_host parameter.");
  if (!username) throw new Error("CUCM username required. Set CUCM_USERNAME or pass cucm_username parameter.");
  if (!password) throw new Error("CUCM password required. Set CUCM_PASSWORD or pass cucm_password parameter.");

  return { host, username, password };
}

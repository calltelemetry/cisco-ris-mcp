import type { CucmCredentials, ToolCredentialOverrides } from "../types/credentials.js";

export function resolveCredentials(overrides?: ToolCredentialOverrides): CucmCredentials {
  const host = overrides?.cucm_host || process.env.CUCM_HOST;
  const username = overrides?.cucm_username || process.env.CUCM_USERNAME;
  const password = overrides?.cucm_password || process.env.CUCM_PASSWORD;
  const port = overrides?.cucm_port || Number(process.env.CUCM_PORT) || 8443;

  if (!host) throw new Error("CUCM host required. Set CUCM_HOST or pass cucm_host parameter.");
  if (!username) throw new Error("CUCM username required. Set CUCM_USERNAME or pass cucm_username parameter.");
  if (!password) throw new Error("CUCM password required. Set CUCM_PASSWORD or pass cucm_password parameter.");

  return { host, username, password, port };
}

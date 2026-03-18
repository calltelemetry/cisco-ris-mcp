import type { CucmCredentials, ToolCredentialOverrides } from "../types/credentials.js";

export function resolveCredentials(overrides?: ToolCredentialOverrides): CucmCredentials {
  const host = overrides?.cucm_host || process.env.CUCM_HOST || process.env.CUCM_DIME_HOST;
  const username = overrides?.cucm_username || process.env.CUCM_USERNAME || process.env.CUCM_DIME_USERNAME;
  const password = overrides?.cucm_password || process.env.CUCM_PASSWORD || process.env.CUCM_DIME_PASSWORD;
  const port = overrides?.cucm_port || Number(process.env.CUCM_PORT) || Number(process.env.CUCM_DIME_PORT) || 8443;

  if (!host) throw new Error("CUCM host required. Set CUCM_HOST (or CUCM_DIME_HOST) or pass cucm_host parameter.");
  if (!username) throw new Error("CUCM username required. Set CUCM_USERNAME (or CUCM_DIME_USERNAME) or pass cucm_username parameter.");
  if (!password) throw new Error("CUCM password required. Set CUCM_PASSWORD (or CUCM_DIME_PASSWORD) or pass cucm_password parameter.");

  return { host, username, password, port };
}

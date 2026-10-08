import type { CucmCredentials, ToolCredentialOverrides } from "../types/credentials.js";

export function resolveCredentials(
  overrides?: ToolCredentialOverrides,
  env?: Record<string, string | undefined>
): CucmCredentials {
  const getEnv = (key: string): string | undefined => {
    if (env && typeof env === "object" && env[key] !== undefined) {
      return env[key];
    }
    if (typeof process !== "undefined" && process?.env) {
      return process.env[key];
    }
    return undefined;
  };

  const host = overrides?.cucm_host || getEnv("CUCM_HOST");
  const username = overrides?.cucm_username || getEnv("CUCM_USERNAME");
  const password = overrides?.cucm_password || getEnv("CUCM_PASSWORD");
  const port = overrides?.cucm_port || Number(getEnv("CUCM_PORT")) || 8443;

  if (!host) throw new Error("CUCM host required. Set CUCM_HOST or pass cucm_host parameter.");
  if (!username) throw new Error("CUCM username required. Set CUCM_USERNAME or pass cucm_username parameter.");
  if (!password) throw new Error("CUCM password required. Set CUCM_PASSWORD or pass cucm_password parameter.");

  return { host, username, password, port };
}

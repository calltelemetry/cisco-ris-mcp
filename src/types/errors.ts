export type ErrorCategory =
  | "auth_failed"
  | "unreachable"
  | "timeout"
  | "not_found"
  | "bad_request"
  | "rate_limited"
  | "server_error";

export interface StructuredError {
  error: true;
  category: ErrorCategory;
  message: string;
  retryable: boolean;
}

export function categorizeError(err: unknown): StructuredError {
  const msg = err instanceof Error ? err.message : String(err);

  if (/401|403|auth|unauthorized|forbidden/i.test(msg)) {
    return { error: true, category: "auth_failed", message: `Authentication failed: ${msg}. Check CUCM_USERNAME/CUCM_PASSWORD.`, retryable: false };
  }
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|unreachable|dns/i.test(msg)) {
    return { error: true, category: "unreachable", message: `CUCM unreachable: ${msg}. Check CUCM_HOST.`, retryable: true };
  }
  if (/timeout|abort|ETIMEDOUT/i.test(msg)) {
    return { error: true, category: "timeout", message: `Request timed out: ${msg}. Try increasing timeoutMs.`, retryable: true };
  }
  if (/rate.?limit|exceeded allowed rate|503/i.test(msg)) {
    return { error: true, category: "rate_limited", message: `CUCM rate limited: ${msg}. Wait before retrying.`, retryable: true };
  }
  if (/not found|404|no such/i.test(msg)) {
    return { error: true, category: "not_found", message: msg, retryable: false };
  }
  return { error: true, category: "server_error", message: msg, retryable: true };
}

export function toJsonError(err: unknown): string {
  return JSON.stringify(categorizeError(err));
}

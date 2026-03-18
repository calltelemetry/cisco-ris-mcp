type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const configuredLevel = (process.env.RIS_MCP_LOG_LEVEL || "warn").toLowerCase() as LogLevel;
const threshold = LEVELS[configuredLevel] ?? LEVELS.warn;

export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold) return;
  const entry = { ts: new Date().toISOString(), level, msg: message, ...data };
  process.stderr.write(JSON.stringify(entry) + "\n");
}

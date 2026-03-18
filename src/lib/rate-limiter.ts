/**
 * Per-host semaphore: max concurrent SOAP requests + minimum inter-request interval.
 * Prevents hitting CUCM's ~15 req/min RIS rate limit.
 */

const hostState = new Map<string, { inflight: number; lastRequestMs: number; queue: Array<() => void> }>();

const MAX_CONCURRENT = 2;
const MIN_INTERVAL_MS = 4_000;

function getState(host: string) {
  let s = hostState.get(host);
  if (!s) {
    s = { inflight: 0, lastRequestMs: 0, queue: [] };
    hostState.set(host, s);
  }
  return s;
}

export async function withRateLimit<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const state = getState(host);

  // Wait for concurrency slot
  while (state.inflight >= MAX_CONCURRENT) {
    await new Promise<void>(resolve => state.queue.push(resolve));
  }

  // Enforce minimum interval
  const now = Date.now();
  const elapsed = now - state.lastRequestMs;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }

  state.inflight++;
  state.lastRequestMs = Date.now();

  try {
    return await fn();
  } finally {
    state.inflight--;
    const next = state.queue.shift();
    if (next) next();
  }
}

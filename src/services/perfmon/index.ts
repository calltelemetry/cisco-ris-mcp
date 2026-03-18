import { escapeXml, fetchServiceabilitySoap, toArray } from "../../lib/soap-client.js";
import { withRateLimit } from "../../lib/rate-limiter.js";
import { log } from "../../lib/logger.js";
import type { CucmCredentials } from "../../types/credentials.js";
import type { PerfmonCounterValue, PerfmonCounterInfo, MonitorJob, TimestampedSample } from "../../types/perfmon-types.js";

const PERFMON_PATH = "/perfmonservice2/services/PerfmonService";

// -- SOAP Envelope Builders --

function buildCollectCounterDataEnvelope(perfmonHost: string, object: string): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://schemas.cisco.com/ast/soap">' +
    "<soapenv:Header/><soapenv:Body>" +
    "<soap:perfmonCollectCounterData>" +
    `<soap:Host>${escapeXml(perfmonHost)}</soap:Host>` +
    `<soap:Object>${escapeXml(object)}</soap:Object>` +
    "</soap:perfmonCollectCounterData>" +
    "</soapenv:Body></soapenv:Envelope>"
  );
}

function buildListCounterEnvelope(perfmonHost: string): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://schemas.cisco.com/ast/soap">' +
    "<soapenv:Header/><soapenv:Body>" +
    `<soap:perfmonListCounter><soap:Host>${escapeXml(perfmonHost)}</soap:Host></soap:perfmonListCounter>` +
    "</soapenv:Body></soapenv:Envelope>"
  );
}

function buildListInstanceEnvelope(perfmonHost: string, object: string): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://schemas.cisco.com/ast/soap">' +
    "<soapenv:Header/><soapenv:Body>" +
    "<soap:perfmonListInstance>" +
    `<soap:Host>${escapeXml(perfmonHost)}</soap:Host>` +
    `<soap:Object>${escapeXml(object)}</soap:Object>` +
    "</soap:perfmonListInstance>" +
    "</soapenv:Body></soapenv:Envelope>"
  );
}

function buildOpenSessionEnvelope(): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://schemas.cisco.com/ast/soap">' +
    "<soapenv:Header/><soapenv:Body><soap:perfmonOpenSession/></soapenv:Body></soapenv:Envelope>"
  );
}

function buildAddCounterEnvelope(sessionHandle: string, counters: string[]): string {
  const counterItems = counters
    .map((c) => `<soap:Counter><soap:Name>${escapeXml(c)}</soap:Name></soap:Counter>`)
    .join("");
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://schemas.cisco.com/ast/soap">' +
    "<soapenv:Header/><soapenv:Body>" +
    "<soap:perfmonAddCounter>" +
    `<soap:SessionHandle>${escapeXml(sessionHandle)}</soap:SessionHandle>` +
    `<soap:ArrayOfCounter>${counterItems}</soap:ArrayOfCounter>` +
    "</soap:perfmonAddCounter>" +
    "</soapenv:Body></soapenv:Envelope>"
  );
}

function buildCollectSessionDataEnvelope(sessionHandle: string): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://schemas.cisco.com/ast/soap">' +
    "<soapenv:Header/><soapenv:Body>" +
    `<soap:perfmonCollectSessionData><soap:SessionHandle>${escapeXml(sessionHandle)}</soap:SessionHandle></soap:perfmonCollectSessionData>` +
    "</soapenv:Body></soapenv:Envelope>"
  );
}

function buildCloseSessionEnvelope(sessionHandle: string): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://schemas.cisco.com/ast/soap">' +
    "<soapenv:Header/><soapenv:Body>" +
    `<soap:perfmonCloseSession><soap:SessionHandle>${escapeXml(sessionHandle)}</soap:SessionHandle></soap:perfmonCloseSession>` +
    "</soapenv:Body></soapenv:Envelope>"
  );
}

// -- One-shot APIs --

export async function perfmonCollectCounterData(
  creds: CucmCredentials,
  perfmonHost: string,
  object: string,
  timeoutMs?: number,
): Promise<PerfmonCounterValue[]> {
  const envelope = buildCollectCounterDataEnvelope(perfmonHost, object);

  const body = await withRateLimit(creds.host, () =>
    fetchServiceabilitySoap(creds.host, creds.port, creds, PERFMON_PATH, "perfmonCollectCounterData", envelope, timeoutMs ?? 30_000)
  );

  const resp = body.perfmonCollectCounterDataResponse as Record<string, unknown> | undefined;
  const aoci = resp?.ArrayOfCounterInfo as Record<string, unknown> | undefined;
  const items = toArray(aoci?.item ?? resp?.perfmonCollectCounterDataReturn) as Record<string, unknown>[];

  return items.map((item) => ({
    name: String(item.Name ?? ""),
    value: Number(item.Value ?? 0),
    cStatus: Number(item.CStatus ?? 0),
  }));
}

export async function perfmonListCounter(
  creds: CucmCredentials,
  perfmonHost: string,
  timeoutMs?: number,
): Promise<PerfmonCounterInfo[]> {
  const envelope = buildListCounterEnvelope(perfmonHost);

  const body = await withRateLimit(creds.host, () =>
    fetchServiceabilitySoap(creds.host, creds.port, creds, PERFMON_PATH, "perfmonListCounter", envelope, timeoutMs ?? 30_000)
  );

  const resp = body.perfmonListCounterResponse as Record<string, unknown> | undefined;
  const aooi = resp?.ArrayOfObjectInfo as Record<string, unknown> | undefined;
  const items = toArray(aooi?.item ?? resp?.perfmonListCounterReturn) as Record<string, unknown>[];

  return items.map((item) => {
    const countersRaw = toArray(
      (item.ArrayOfCounter as Record<string, unknown>)?.item ??
        (item.ArrayOfCounter as Record<string, unknown>)?.Counter,
    ) as Record<string, unknown>[];
    return {
      objectName: String(item.Name ?? ""),
      multiInstance: item.MultiInstance === true || item.MultiInstance === "true",
      counters: countersRaw.map((c) => String(c.Name ?? c)),
    };
  });
}

export async function perfmonListInstance(
  creds: CucmCredentials,
  perfmonHost: string,
  object: string,
  timeoutMs?: number,
): Promise<string[]> {
  const envelope = buildListInstanceEnvelope(perfmonHost, object);

  const body = await withRateLimit(creds.host, () =>
    fetchServiceabilitySoap(creds.host, creds.port, creds, PERFMON_PATH, "perfmonListInstance", envelope, timeoutMs ?? 30_000)
  );

  const resp = body.perfmonListInstanceResponse as Record<string, unknown> | undefined;
  const aoii = resp?.ArrayOfInstanceInfo as Record<string, unknown> | undefined;
  const items = toArray(aoii?.item ?? resp?.perfmonListInstanceReturn) as Record<string, unknown>[];

  return items.map((item) => String(item.Name ?? item));
}

// -- Session APIs --

export async function perfmonOpenSession(creds: CucmCredentials, timeoutMs?: number): Promise<string> {
  const envelope = buildOpenSessionEnvelope();

  const body = await withRateLimit(creds.host, () =>
    fetchServiceabilitySoap(creds.host, creds.port, creds, PERFMON_PATH, "perfmonOpenSession", envelope, timeoutMs ?? 30_000)
  );

  const resp = body.perfmonOpenSessionResponse as Record<string, unknown> | undefined;
  const handle = resp?.perfmonOpenSessionReturn ?? resp?.SessionHandle;
  if (!handle) throw new Error("perfmonOpenSession returned no session handle");
  return String(handle);
}

export async function perfmonAddCounter(
  creds: CucmCredentials,
  sessionHandle: string,
  counters: string[],
  timeoutMs?: number,
): Promise<void> {
  const envelope = buildAddCounterEnvelope(sessionHandle, counters);
  await withRateLimit(creds.host, () =>
    fetchServiceabilitySoap(creds.host, creds.port, creds, PERFMON_PATH, "perfmonAddCounter", envelope, timeoutMs ?? 30_000)
  );
}

export async function perfmonCollectSessionData(
  creds: CucmCredentials,
  sessionHandle: string,
  timeoutMs?: number,
): Promise<PerfmonCounterValue[]> {
  const envelope = buildCollectSessionDataEnvelope(sessionHandle);

  const body = await withRateLimit(creds.host, () =>
    fetchServiceabilitySoap(creds.host, creds.port, creds, PERFMON_PATH, "perfmonCollectSessionData", envelope, timeoutMs ?? 30_000)
  );

  const resp = body.perfmonCollectSessionDataResponse as Record<string, unknown> | undefined;
  const aoci = resp?.ArrayOfCounterInfo as Record<string, unknown> | undefined;
  const items = toArray(aoci?.item ?? resp?.perfmonCollectSessionDataReturn) as Record<string, unknown>[];

  return items.map((item) => ({
    name: String(item.Name ?? ""),
    value: Number(item.Value ?? 0),
    cStatus: Number(item.CStatus ?? 0),
  }));
}

export async function perfmonCloseSession(
  creds: CucmCredentials,
  sessionHandle: string,
  timeoutMs?: number,
): Promise<void> {
  const envelope = buildCloseSessionEnvelope(sessionHandle);
  await withRateLimit(creds.host, () =>
    fetchServiceabilitySoap(creds.host, creds.port, creds, PERFMON_PATH, "perfmonCloseSession", envelope, timeoutMs ?? 30_000)
  );
}

// -- Background Monitor Manager --

const activeMonitors = new Map<string, { job: MonitorJob; timer: ReturnType<typeof setInterval>; creds: CucmCredentials }>();
/** Completed/stopped monitors kept for 30 minutes so results can still be read */
const completedMonitors = new Map<string, MonitorJob>();
const COMPLETED_TTL_MS = 30 * 60 * 1000;

export function getActiveMonitors(): Map<string, MonitorJob> {
  const result = new Map<string, MonitorJob>();
  for (const [id, entry] of activeMonitors) {
    result.set(id, entry.job);
  }
  return result;
}

export async function startMonitor(
  creds: CucmCredentials,
  perfmonHost: string,
  object: string,
  counters: string[],
  intervalMs: number,
  maxSamples: number,
): Promise<MonitorJob> {
  const monitorId = `mon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Open session
  const sessionHandle = await perfmonOpenSession(creds);
  log("info", "PerfMon session opened for monitor", { monitorId, sessionHandle, object });

  // Build counter paths
  const counterPaths = counters.map(c => `\\\\${perfmonHost}\\${object}\\${c}`);
  await perfmonAddCounter(creds, sessionHandle, counterPaths);

  const job: MonitorJob = {
    monitorId,
    host: creds.host,
    perfmonHost,
    object,
    counters,
    sessionHandle,
    intervalMs,
    maxSamples,
    samples: [],
    status: "running",
    startedAt: Date.now(),
  };

  // Start background polling
  const timer = setInterval(async () => {
    try {
      const values = await perfmonCollectSessionData(creds, sessionHandle);
      const sample: TimestampedSample = { timestamp: Date.now(), counters: values };
      job.samples.push(sample);
      log("debug", "Monitor sample collected", { monitorId, sampleCount: job.samples.length });

      if (job.samples.length >= maxSamples) {
        await stopMonitor(monitorId);
      }
    } catch (err) {
      log("error", "Monitor poll failed", { monitorId, error: String(err) });
      job.error = String(err);
      await stopMonitor(monitorId);
    }
  }, intervalMs);

  // Safety cap: 4 hours
  setTimeout(() => {
    if (activeMonitors.has(monitorId)) {
      stopMonitor(monitorId).catch(() => {});
    }
  }, 4 * 60 * 60 * 1000);

  activeMonitors.set(monitorId, { job, timer, creds });
  return job;
}

export async function stopMonitor(monitorId: string): Promise<MonitorJob | null> {
  const entry = activeMonitors.get(monitorId);
  if (!entry) return null;

  clearInterval(entry.timer);
  entry.job.status = entry.job.error ? "error" : "completed";
  entry.job.stoppedAt = Date.now();

  // Close PerfMon session
  try {
    await perfmonCloseSession(entry.creds, entry.job.sessionHandle);
    log("info", "PerfMon session closed", { monitorId, sessionHandle: entry.job.sessionHandle });
  } catch (err) {
    log("warn", "Failed to close PerfMon session", { monitorId, error: String(err) });
  }

  activeMonitors.delete(monitorId);
  completedMonitors.set(monitorId, entry.job);
  setTimeout(() => completedMonitors.delete(monitorId), COMPLETED_TTL_MS);
  return entry.job;
}

export function getMonitorJob(monitorId: string): MonitorJob | null {
  return activeMonitors.get(monitorId)?.job ?? completedMonitors.get(monitorId) ?? null;
}

/** Cleanup all active monitors -- called on process shutdown */
export async function cleanupAllMonitors(): Promise<void> {
  const ids = Array.from(activeMonitors.keys());
  for (const id of ids) {
    await stopMonitor(id).catch(() => {});
  }
}

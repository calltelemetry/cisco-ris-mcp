# @calltelemetry/cisco-ris-mcp

MCP server for Cisco CUCM Real-time Information Service (RIS) and PerfMon SOAP APIs.

[![npm](https://img.shields.io/npm/v/@calltelemetry/cisco-ris-mcp)](https://www.npmjs.com/package/@calltelemetry/cisco-ris-mcp)
[![CI](https://github.com/calltelemetry/cisco-ris-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/calltelemetry/cisco-ris-mcp/actions/workflows/ci.yml)

Built by [Call Telemetry](https://calltelemetry.com) — realtime tools for Cisco Collaboration.

An [MCP](https://modelcontextprotocol.io/) server that gives AI assistants direct access to Cisco CUCM device registration status, performance counters, and cluster health — via the RIS and PerfMon SOAP APIs.

**You ask about your cluster in plain language. The LLM queries RIS and PerfMon for you.**

- *"Are all phones registered?"*
- *"Show me call volume over the last 5 minutes"*
- *"Is the cluster healthy?"*

## Installation

No install required — npx downloads and runs automatically:

```bash
npx @calltelemetry/cisco-ris-mcp
```

## What It Does

- **Device registration** — Query real-time phone, gateway, and CTI device status with wildcard search, model/protocol filtering, and auto-pagination across cluster nodes
- **Performance counters** — Snapshot or continuously monitor PerfMon counters (calls active, registration counts, SIP stats, CPU) with built-in presets for common scenarios
- **Cluster health** — Single-call health check combining RIS device registration + PerfMon counters with configurable threshold alerts

## Tools

| Tool | Description |
|------|-------------|
| `device_status` | Query real-time device registration with wildcard search and auto-pagination |
| `phone_summary` | Dashboard-ready registration summary with aggregate counts by model, protocol, and node |
| `cti_status` | Query CTI port, route point, and application connection status |
| `registration_health` | Cluster-wide health check combining RIS + PerfMon with threshold alerts |
| `counter_snapshot` | One-shot PerfMon counter read with preset support |
| `counter_list` | Discover available PerfMon counter objects and their counters |
| `counter_instances` | List instances of a multi-instance PerfMon object |
| `counter_monitor_start` | Start background counter monitoring at a configurable interval |
| `counter_monitor_results` | Read accumulated samples with min/max/avg/delta/rate statistics |
| `counter_monitor_stop` | Stop a running monitor and return final statistics |

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CUCM_HOST` | Yes | — | CUCM publisher hostname or IP |
| `CUCM_USERNAME` | Yes | — | CUCM admin username |
| `CUCM_PASSWORD` | Yes | — | CUCM admin password |
| `CUCM_PORT` | No | `8443` | CUCM HTTPS port |
| `RIS_MCP_LOG_LEVEL` | No | `warn` | Log level: `debug`, `info`, `warn`, `error` |
| `RIS_MCP_TLS_MODE` | No | `permissive` | Set to `strict` to reject self-signed certs |

All credentials can also be passed per-tool-call via `cucm_host`, `cucm_username`, `cucm_password`, `cucm_port` parameters — useful for querying multiple clusters in a single session.

### Counter Presets

Presets select a curated set of counters for common monitoring scenarios:

| Preset | PerfMon Object | Counters |
|--------|----------------|----------|
| `registration` | Cisco CallManager | RegisteredHardwarePhones, RegisteredOtherStationDevices, UnregisteredPhoneCount |
| `call_processing` | Cisco CallManager | CallsActive, CallsAttempted, CallsCompleted |
| `sip` | Cisco SIP | All SIP stack counters (INVITE, BYE, REGISTER, etc.) |
| `media` | Cisco CallManager | VideoCallsActive, VideoCallsCompleted |
| `system` | Processor | All processor/CPU counters |

## Tool Examples

All examples below are from a live CUCM 15.0 cluster.

---

### `phone_summary` — Registration overview

Returns aggregate counts by model, protocol, and cluster node. Ideal for dashboards.

**Input:**

```json
{ "summaryOnly": true }
```

**Output:**

```json
{
  "totalDevices": 1,
  "registered": 1,
  "unregistered": 0,
  "registrationRate": 100,
  "byModel": {
    "SCCP75.9-4-2SR4-3S": { "registered": 1, "unregistered": 0 }
  },
  "byProtocol": {
    "SCCP": { "registered": 1, "unregistered": 0 }
  },
  "byNode": [
    { "name": "cucm15-pub", "registered": 1, "unregistered": 0, "total": 1 }
  ]
}
```

---

### `device_status` — Search specific devices

Query device registration by name pattern with full per-device detail.

**Input:**

```json
{ "search": "SEP*" }
```

**Output:**

```json
{
  "totalDevicesFound": 1,
  "cmNodes": [
    {
      "name": "cucm15-pub",
      "returnCode": "Ok",
      "devices": [
        {
          "name": "SEP0022905C7710",
          "ipAddress": "10.0.0.178",
          "description": "Auto 1000 7975 Phone3",
          "dirNumber": "1000-Registered",
          "status": "Registered",
          "statusReason": 0,
          "protocol": "SCCP",
          "activeLoadId": "SCCP75.9-4-2SR4-3S",
          "timeStamp": 1773835197
        }
      ]
    }
  ]
}
```

---

### `registration_health` — Cluster health check

Single call combining RIS registration data + PerfMon counters with threshold-based alerts.

**Input:**

```json
{}
```

**Output:**

```json
{
  "overall": {
    "registrationRate": 100,
    "totalDevices": 1,
    "registered": 1,
    "unregistered": 0
  },
  "nodes": [
    { "name": "cucm15-pub", "registrationRate": 100, "registered": 1, "unregistered": 0 }
  ],
  "counters": {
    "CallsActive": 0,
    "RegisteredHardwarePhones": 1,
    "CallManagerHeartBeat": 4958,
    "InitializationState": 100
  },
  "alerts": []
}
```

An empty `alerts` array means the cluster is healthy. When thresholds are breached (e.g., registration rate drops below 90%), alerts describe the condition.

---

### `counter_snapshot` — One-shot counter read

Read PerfMon counters using a preset or custom object/counter list.

**Input (registration preset):**

```json
{ "preset": "registration" }
```

**Output:**

```json
{
  "object": "Cisco CallManager",
  "host": "10.0.0.1",
  "counters": [
    { "name": "RegisteredHardwarePhones", "value": 1, "cStatus": 1 },
    { "name": "RegisteredOtherStationDevices", "value": 0, "cStatus": 1 },
    { "name": "UnregisteredPhoneCount", "value": 0, "cStatus": 1 }
  ]
}
```

**Input (call processing preset):**

```json
{ "preset": "call_processing" }
```

**Output:**

```json
{
  "object": "Cisco CallManager",
  "host": "10.0.0.1",
  "counters": [
    { "name": "CallsActive", "value": 0, "cStatus": 1 },
    { "name": "CallsAttempted", "value": 0, "cStatus": 1 },
    { "name": "CallsCompleted", "value": 0, "cStatus": 1 }
  ]
}
```

---

### `counter_list` — Discover available counters

List all PerfMon objects and their counters on the cluster.

**Input:**

```json
{}
```

**Output (truncated):**

```json
[
  {
    "objectName": "Cisco CAR DB",
    "multiInstance": true,
    "counters": ["CARDBSpaceUsed", "CARTempDBSpaceUsed", "FreeSharedMemory", "RootDBSpaceUsed", "UsedSharedMemory"]
  },
  {
    "objectName": "Cisco CallManager",
    "multiInstance": false,
    "counters": ["CallsActive", "CallsAttempted", "CallsCompleted", "RegisteredHardwarePhones", "...120 more"]
  },
  {
    "objectName": "Cisco SIP Stack",
    "multiInstance": false,
    "counters": ["InviteIns", "InviteOuts", "RegisterIns", "ByeIns", "...150 more"]
  }
]
```

---

### `counter_monitor_start` — Background monitoring

Start continuous counter collection at a configurable interval. Returns a `monitorId` for retrieving results.

**Input:**

```json
{
  "object": "Cisco CallManager",
  "counters": ["CallsActive", "CallsAttempted", "CallsCompleted"],
  "intervalMs": 10000,
  "maxSamples": 100
}
```

**Output:**

```json
{
  "monitorId": "mon-1710756000-abc123",
  "status": "running",
  "object": "Cisco CallManager",
  "counters": ["CallsActive", "CallsAttempted", "CallsCompleted"],
  "intervalMs": 10000,
  "maxSamples": 100,
  "message": "Monitor started. Use counter_monitor_results to read samples, counter_monitor_stop to end."
}
```

---

### `counter_monitor_results` — Read accumulated statistics

Retrieve samples from a running monitor with computed min/max/avg/delta/rate per counter.

**Input:**

```json
{ "monitorId": "mon-1710756000-abc123" }
```

**Output:**

```json
{
  "monitorId": "mon-1710756000-abc123",
  "status": "running",
  "samplesCollected": 3,
  "maxSamples": 100,
  "durationMs": 30000,
  "stats": [
    { "name": "CallsActive", "type": "gauge", "min": 0, "max": 2, "avg": 0.67, "delta": 0, "rate": 0, "latest": 0 },
    { "name": "CallsCompleted", "type": "counter", "min": 1234, "max": 1236, "avg": 1235, "delta": 2, "rate": 0.067, "latest": 1236 }
  ]
}
```

Statistics distinguish between **gauge** counters (point-in-time values like CallsActive) and **counter** types (monotonically increasing values like CallsCompleted) with delta and rate calculations.

---

### `counter_monitor_stop` — Stop and finalize

Stops a running monitor and returns final statistics.

**Input:**

```json
{ "monitorId": "mon-1710756000-abc123" }
```

---

## MCP Configuration

### Claude Code (one-liner)

```bash
claude mcp add cucm_ris \
  -e CUCM_HOST=cucm-pub.example.com \
  -e CUCM_USERNAME=admin \
  -e CUCM_PASSWORD=secret \
  -- npx @calltelemetry/cisco-ris-mcp
```

### mcp.json

```json
{
  "mcpServers": {
    "cucm-ris": {
      "command": "npx",
      "args": ["@calltelemetry/cisco-ris-mcp"],
      "env": {
        "CUCM_HOST": "cucm-pub.example.com",
        "CUCM_USERNAME": "admin",
        "CUCM_PASSWORD": "secret"
      }
    }
  }
}
```

## Architecture

- **SOAP client** — Wraps the RIS `selectCmDevice` and PerfMon `perfmonCollectCounterData` / `perfmonListCounter` SOAP endpoints
- **Rate limiter** — Prevents overloading CUCM with concurrent RIS/PerfMon requests
- **TTL cache** — Caches counter metadata and device queries to reduce SOAP round-trips
- **Background monitoring** — In-memory poll loop for `counter_monitor_*` tools with automatic sample collection
- **Structured errors** — All failures return typed error objects with CUCM-specific context

## Development

```bash
yarn install        # Install dependencies
yarn build          # Build with Vite
yarn dev            # Watch mode
yarn typecheck      # Type check
yarn lint           # Lint
yarn test           # Run tests
yarn validate       # typecheck + lint + test
```

## Related

| Server | Description |
|--------|-------------|
| **[cisco-axl-mcp](https://github.com/calltelemetry/cisco-axl-mcp)** | CUCM provisioning and admin via AXL SOAP API |
| **[cisco-cucm-mcp](https://github.com/calltelemetry/cisco-cucm-mcp)** | CUCM operational debugging — logs, traces, packet capture, service control |

## License

MIT

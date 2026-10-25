# @calltelemetry/cisco-ris-mcp

MCP server for Cisco CUCM RIS (Real-time Information Service) and PerfMon APIs.

[![npm](https://img.shields.io/npm/v/@calltelemetry/cisco-ris-mcp)](https://www.npmjs.com/package/@calltelemetry/cisco-ris-mcp)
[![CI](https://github.com/calltelemetry/cisco-ris-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/calltelemetry/cisco-ris-mcp/actions/workflows/ci.yml)

## Quick Start

```bash
npx @calltelemetry/cisco-ris-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `device_status` | Query real-time device registration status with wildcard search, filtering, and auto-pagination |
| `cti_status` | Query CTI port, route point, and application connection status |
| `counter_snapshot` | One-shot PerfMon counter collection with preset support |
| `counter_list` | Discover available PerfMon counter objects and counters |
| `counter_instances` | List instances of a PerfMon object |
| `counter_monitor_start` | Start background PerfMon monitoring (returns monitorId) |
| `counter_monitor_results` | Read accumulated samples and per-counter statistics |
| `counter_monitor_stop` | Stop a running monitor and return final statistics |
| `phone_summary` | Dashboard-ready phone registration summary with aggregate counts |
| `registration_health` | Cluster-wide health check combining RIS + PerfMon with threshold alerts |

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CUCM_HOST` | Yes | - | CUCM publisher hostname or IP |
| `CUCM_USERNAME` | Yes | - | CUCM admin username |
| `CUCM_PASSWORD` | Yes | - | CUCM admin password |
| `CUCM_PORT` | No | `8443` | CUCM HTTPS port |
| `RIS_MCP_LOG_LEVEL` | No | `warn` | Log level: debug, info, warn, error |
| `RIS_MCP_TLS_MODE` | No | `permissive` | Set to `strict` to reject self-signed certs |

All credentials can also be passed per-tool-call via `cucm_host`, `cucm_username`, `cucm_password`, `cucm_port` parameters.

### Counter Presets

| Preset | PerfMon Object | Counters |
|--------|---------------|----------|
| `call_processing` | Cisco CallManager | CallsActive, CallsAttempted, CallsCompleted |
| `registration` | Cisco CallManager | RegisteredHardwarePhones, RegisteredOtherStationDevices, UnregisteredPhoneCount |
| `sip` | Cisco SIP | (all counters) |
| `media` | Cisco CallManager | VideoCallsActive, VideoCallsCompleted |
| `system` | Processor | (all counters) |

### MCP Configuration

Add to your `mcp.json`:

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

Or with a local build:

```json
{
  "mcpServers": {
    "cucm-ris": {
      "command": "node",
      "args": ["/path/to/cisco-ris-mcp/build/index.js"],
      "env": {
        "CUCM_HOST": "cucm-pub.example.com",
        "CUCM_USERNAME": "admin",
        "CUCM_PASSWORD": "secret"
      }
    }
  }
}
```

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

## License

MIT

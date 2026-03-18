# [1.2.0](https://github.com/calltelemetry/cisco-ris-mcp/compare/v1.1.5...v1.2.0) (2026-03-18)


### Features

* parse all RIS device fields from CUCM SOAP response ([4f27034](https://github.com/calltelemetry/cisco-ris-mcp/commit/4f27034a252203f3cfe8c8c6f8fb9a759be6adc9))

## [1.1.5](https://github.com/calltelemetry/cisco-ris-mcp/compare/v1.1.4...v1.1.5) (2026-03-18)


### Bug Fixes

* graceful CTI empty state, expanded README use cases ([e62f146](https://github.com/calltelemetry/cisco-ris-mcp/commit/e62f146ec35b312a690979745c4c8cd267f90348))

## [1.1.4](https://github.com/calltelemetry/cisco-ris-mcp/compare/v1.1.3...v1.1.4) (2026-03-18)


### Bug Fixes

* retain completed monitors for 30min, update README with live test results ([870b029](https://github.com/calltelemetry/cisco-ris-mcp/commit/870b029f250b446172cc74099a30a8969c566841))

## [1.1.3](https://github.com/calltelemetry/cisco-ris-mcp/compare/v1.1.2...v1.1.3) (2026-03-18)


### Bug Fixes

* counter_monitor_results/stop no longer require credentials ([efb768b](https://github.com/calltelemetry/cisco-ris-mcp/commit/efb768b600e07254552e025b2911e05f2f2a51b4))

## [1.1.2](https://github.com/calltelemetry/cisco-ris-mcp/compare/v1.1.1...v1.1.2) (2026-03-18)


### Bug Fixes

* replace UnregisteredPhoneCount with PartiallyRegisteredPhone in registration preset ([7d0af91](https://github.com/calltelemetry/cisco-ris-mcp/commit/7d0af91b4c7f23bc665fc1ee2325ac63861653f1))

## [1.1.1](https://github.com/calltelemetry/cisco-ris-mcp/compare/v1.1.0...v1.1.1) (2026-03-18)


### Bug Fixes

* match counter names by suffix for preset filtering ([ae2257d](https://github.com/calltelemetry/cisco-ris-mcp/commit/ae2257d7a4c1dc76cf35fcefad92f9caade13f5e))

# [1.1.0](https://github.com/calltelemetry/cisco-ris-mcp/compare/v1.0.0...v1.1.0) (2026-03-18)


### Features

* fall back to CUCM_DIME_* env vars for credential resolution ([8daea1f](https://github.com/calltelemetry/cisco-ris-mcp/commit/8daea1fee03e78f1fba6eeeef5fb149047be4b74))

# 1.0.0 (2026-03-18)


### Bug Fixes

* add eslint.config.js, fix publish workflow, skip lint in CI for now ([047d5ad](https://github.com/calltelemetry/cisco-ris-mcp/commit/047d5ad81a5d52f54d664d468fc5856a49065ec2))
* enable corepack before setup-node to avoid yarn version conflict ([7f330e2](https://github.com/calltelemetry/cisco-ris-mcp/commit/7f330e25905431bc3fc4b0f76ecf3e00572e5114))
* remove registry-url from setup-node, let semantic-release manage npm auth ([dfca4fa](https://github.com/calltelemetry/cisco-ris-mcp/commit/dfca4faa7ef91c78251ff67dfbd4062fef7a9f39))
* run semantic-release via yarn to access devDependency plugins ([d704363](https://github.com/calltelemetry/cisco-ris-mcp/commit/d7043633d4b6d732c7ecd523e967eb45cf02ce7d))
* use node 22 for CI, enable corepack before install ([0add3ca](https://github.com/calltelemetry/cisco-ris-mcp/commit/0add3cae2c97eedea955ec7e923d87e55617c1ba))


### Features

* initial cisco-ris-mcp server ([cb27105](https://github.com/calltelemetry/cisco-ris-mcp/commit/cb271051e71c12175a490a65800209518bf61708))

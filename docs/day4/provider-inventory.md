# AgentHire D4.1 — Provider and Service Inventory

Mode: `READ_ONLY / NO_SIGNING / NO_NETWORK_INSPECTION`
Source catalog: `docs/evidence/provider-catalog.json` (snapshotAsOf `2026-11-19T09:45:48.912Z`)
Catalog SHA-256: `cf008b774450c568638034c32be7e5c2815c6f648fd95cc3ef6b4a55058a337d`
MVP task under assessment: `wallet-activity-summary@1.0` only.

This inventory uses only fields present in Day-3 evidence / `ProviderRecord@1.0`. Gaps are labeled `unknown` or `notSpecified`. Provider-level `x402Advertised` is **not** per-service proof.

## Summary

| Metric | Count |
| --- | ---: |
| Total providers | 3 |
| Total canonical services | 29 |
| Structurally valid HTTPS URLs | 29 |
| HTTPS scheme | 29 |
| Explicit GET | 0 |
| Explicit POST | 0 |
| OTHER / unknown method | 29 |
| Explicit wallet-activity-summary task claim | 0 |
| Explicit per-service x402 offer evidence | 0 |
| Provider-level x402Advertised=true | 2 |
| Documented / verified request schema | 0 |
| Unresolved path templates | 4 |
| Further investigation (planning ≠ rejected) | 29 |
| Excluded / statically rejected | 0 |

## Providers

### Agent Zero

| Field | Value |
| --- | --- |
| providerId | `eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/19353` |
| agentId | `19353` |
| registry chain | `8453` |
| registry address | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| metadata source URI | `https://onchainagentintel.io/agent.json` |
| metadata fetchStatus | `success` |
| metadataHash | `a277e4c072391bd1d0586df6b8355caf9c7ecf35c0f9649739665793ab699c63` |
| x402Advertised (provider scope) | `true` |
| advertisedNetworks | `notSpecified` (empty) |
| observedOffers | 0 |
| verification milestone | `metadataValidated` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` |

#### Services (20)

##### `a2a-8889450caf4353f8`

| Field | Value |
| --- | --- |
| name / description | "A2A (v0.3.0)" |
| endpointUrl | `https://onchainagentintel.io/.well-known/agent-card.json` |
| scheme | `https` |
| host | `onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `eligibleForReview` |

##### `agent-intelligence-30-day-flat-rate-subscription-169b72216e31b2fd`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/intel/subscribe` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `agent-intelligence-capability-market-map-a8bf5a47aeb415a6`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/intel/market` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `agent-intelligence-capability-search-aede4afd05a84260`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/intel/search` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `agent-intelligence-ecosystem-delta-ebb31570fd7dc1e3`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/intel/delta` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `agent-intelligence-full-payment-graph-05bc7dd5ce2c412f`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/intel/graph` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `agent-intelligence-peer-similarity-28d8a7d3b38d3ff4`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/intel/peers/{agent_id}` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; unresolved path template; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `agent-intelligence-profile-lookup-8073e6c25e7ad600`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/intel/agent/{agent_id}` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; unresolved path template; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `agent-intelligence-subscription-status-free-eb5eb958ffd4afdd`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/intel/subscription/{sub_id}` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; unresolved path template; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `agent-intelligence-trending-market-activity-24d42d0587434123`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/intel/trending` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `erc-8183-deliverable-evaluation-14203347e4d4eb0a`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/evaluate` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `mcp-da0da82a2f0e6441`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/mcp` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `public-agent-detail-free-58447f511c5d8ea2`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/public/agent/{chain}/{agent_id}` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; unresolved path template; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `public-coverage-stats-free-0957f0b9678cfe18`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/public/stats` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `public-leaderboards-free-7a5c46b7b6bca5fa`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/public/leaderboards` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `seller-check-free-6041182e4f6f34c6`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/public/seller-check/free` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `seller-check-paid-ca7e9cac6172fda4`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/seller-check` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `smart-contract-security-audit-fccca0c9d65e5fba`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/audit` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `web-5f0b06e006a73932`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://onchainagentintel.io` |
| scheme | `https` |
| host | `onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `x402-55e700fb0c80074e`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://api.onchainagentintel.io/v1/intel` |
| scheme | `https` |
| host | `api.onchainagentintel.io` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-813878971d70379c`, `ev-metadataFetch-d7a548e5a2c47c7b` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

### Agent402

| Field | Value |
| --- | --- |
| providerId | `eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/94639` |
| agentId | `94639` |
| registry chain | `8453` |
| registry address | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| metadata source URI | `https://agent402.tools/.well-known/agent-registration.json` |
| metadata fetchStatus | `success` |
| metadataHash | `2eb8bc1b58b23014d4d7c683979ba763ac6a4be3a31541d9a40f6dd7fd2cf3fa` |
| x402Advertised (provider scope) | `true` |
| advertisedNetworks | `notSpecified` (empty) |
| observedOffers | 0 |
| verification milestone | `metadataValidated` |
| evidenceIds | `ev-registryRead-b5e040c8d4132406`, `ev-metadataFetch-0c61f5a4c4474c99` |

#### Services (5)

##### `a2a-684fdeab4efe67f7`

| Field | Value |
| --- | --- |
| name / description | "A2A (v0.3.0)" |
| endpointUrl | `https://agent402.tools/.well-known/agent-card.json` |
| scheme | `https` |
| host | `agent402.tools` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-b5e040c8d4132406`, `ev-metadataFetch-0c61f5a4c4474c99` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `eligibleForReview` |

##### `mcp-cf6b9a27b4f9e8d7`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://agent402.tools/mcp` |
| scheme | `https` |
| host | `agent402.tools` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-b5e040c8d4132406`, `ev-metadataFetch-0c61f5a4c4474c99` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `openapi-c6e4e0d8beb343e8`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://agent402.tools/openapi.json` |
| scheme | `https` |
| host | `agent402.tools` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-b5e040c8d4132406`, `ev-metadataFetch-0c61f5a4c4474c99` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `eligibleForReview` |

##### `web-e94384a0e5f7cd9e`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://agent402.tools/` |
| scheme | `https` |
| host | `agent402.tools` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-b5e040c8d4132406`, `ev-metadataFetch-0c61f5a4c4474c99` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `x402-b002ca7b39879b45`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://agent402.tools/.well-known/x402` |
| scheme | `https` |
| host | `agent402.tools` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=true` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-b5e040c8d4132406`, `ev-metadataFetch-0c61f5a4c4474c99` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `eligibleForReview` |

### QuantJourney Research Agent Fabric

| Field | Value |
| --- | --- |
| providerId | `eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136` |
| agentId | `9136` |
| registry chain | `84532` |
| registry address | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| metadata source URI | `https://agents.quantjourney.cloud/.well-known/agent-registration.json` |
| metadata fetchStatus | `success` |
| metadataHash | `121502d61e2e4fe1d933351251931165cced4d19928bc6987902c9651915836a` |
| x402Advertised (provider scope) | `false` |
| advertisedNetworks | `notSpecified` (empty) |
| observedOffers | 0 |
| verification milestone | `metadataValidated` |
| evidenceIds | `ev-registryRead-baca02c69a6eef41`, `ev-metadataFetch-7b0f459453e4750d` |

#### Services (4)

##### `a2a-b0315e364f73a4a6`

| Field | Value |
| --- | --- |
| name / description | "A2A (v1.0)" |
| endpointUrl | `https://agents.quantjourney.cloud/.well-known/agent-card.json` |
| scheme | `https` |
| host | `agents.quantjourney.cloud` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=false` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-baca02c69a6eef41`, `ev-metadataFetch-7b0f459453e4750d` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `eligibleForReview` |

##### `mcp-c6a0526fbaadbbd6`

| Field | Value |
| --- | --- |
| name / description | "MCP (v2025-06-18)" |
| endpointUrl | `https://api.quantjourney.cloud/mcp` |
| scheme | `https` |
| host | `api.quantjourney.cloud` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=false` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-baca02c69a6eef41`, `ev-metadataFetch-7b0f459453e4750d` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `web-496fce6fe8cd40ca`

| Field | Value |
| --- | --- |
| name / description | `notSpecified` |
| endpointUrl | `https://agents.quantjourney.cloud/` |
| scheme | `https` |
| host | `agents.quantjourney.cloud` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=false` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-baca02c69a6eef41`, `ev-metadataFetch-7b0f459453e4750d` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `needsMoreInformation` |

##### `x402-4b0816487b68c62a`

| Field | Value |
| --- | --- |
| name / description | "x402 (v2)" |
| endpointUrl | `https://agents.quantjourney.cloud/.well-known/x402` |
| scheme | `https` |
| host | `agents.quantjourney.cloud` |
| method (catalog) | `OTHER` |
| capabilities / skills | `notSpecified` in ProviderRecord@1.0 |
| claimedTaskTypes | `[]` (none advertised) |
| taskRelevance (inventory) | `unknown` |
| x402 (per-service) | `unknown` — only provider-level `x402Advertised=false` |
| payment networks (per-service) | `notSpecified` |
| endpointStatus | `notChecked` |
| requestSchemaStatus | `notChecked` |
| evidenceIds | `ev-registryRead-baca02c69a6eef41`, `ev-metadataFetch-7b0f459453e4750d` (provider-level; no service-scoped probe evidence) |
| missing / ambiguous | method OTHER (not GET/POST); no claimed task types; request schema notChecked; no per-service x402 offer |
| planningStatus (D4.2) | `eligibleForReview` |

## Task relevance rules applied

- `explicitMatch`: claimed task id exactly `wallet-activity-summary` or `wallet-activity-summary@1.0`.
- `potentiallyRelated`: non-exact related tokens (e.g. wallet-analytics) — **not** treated as MVP support.
- `unrelated`: other explicit claimed task types.
- `unknown`: empty `claimedTaskTypes` (all 29 Day-3 services).

No network inspection was performed. No seller selection or fallback assignment.

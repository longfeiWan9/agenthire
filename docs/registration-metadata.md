# AgentHire D3.5 — Registration Metadata

Status: live fetch of exact approved HTTPS registration documents.
Mode remains **READ_ONLY / NO_SIGNING**.
Advertised services are recorded as claims only (`verificationStatus: notChecked`).
Service endpoints are **not** contacted.

## 1. Purpose

Securely resolve ERC-8004 registration metadata for the three D3.4 agents,
with connection-time SSRF protections, offline schema validation, and typed
`RegistrationMetadataEvidence` (`schemaVersion: "1.0"`).

## 2. CLI

```bash
pnpm read:metadata
```

Exit code is nonzero if **zero** documents validate successfully.
One document failure does not stop the others. Max concurrency: 2.

## 3. Security controls

| Control | Behavior |
| --- | --- |
| Allowlist | Exact URL match only (3 approved HTTPS documents) |
| TLS | `rejectUnauthorized: true` |
| Redirects | Refused (3xx → fetchFailed) |
| DNS / IP | Reject private, loopback, link-local, CGNAT, multicast, special-use |
| Pinning | Resolve → validate → dial pinned IP with SNI/`Host` (no DNS rebinding) |
| Timeout | 10s |
| Size | 256 KiB streaming limit |
| Concurrency | max 2 |
| Retry | one transient retry |
| Credentials | no cookies / Authorization / URL userinfo |
| URI fields | separate `onChainTokenURI` / `approvedFetchURI` / `displayURI` |

## 4. Live results

Captured: `2026-11-19T09:45:48.912Z`. Successful: **3/3**.

| Chain | Agent ID | Status | displayURI | sha256 prefix | Services (claims) | Error |
| --- | --- | --- | --- | --- | --- | --- |
| Base Mainnet | 19353 | success | `https://onchainagentintel.io/agent.json` | a277e4c07239… | 20 (A2A, web, mcp, x402, Agent Intelligence — Profile Lookup, Agent Intelligence — Capability Search) |  |
| Base Mainnet | 94639 | success | `https://agent402.tools/.well-known/agent-registration.json` | 2eb8bc1b58b2… | 5 (web, MCP, A2A, OpenAPI, x402) |  |
| Base Sepolia | 9136 | success | `https://agents.quantjourney.cloud/.well-known/agent-registration.json` | 121502d61e2e… | 4 (web, A2A, MCP, x402) |  |

Raw JSON: `docs/evidence/registration-metadata.json`.

## 5. Stop / next

Out of scope: arbitrary URLs, service endpoint verification, x402, wallets,
ProviderRecord@1.0 (D3.6), push.


# AgentHire D4.3a — Discovery Document Inspection

Mode: **READ_ONLY / NO_SIGNING / APPROVED_DISCOVERY_GET_ONLY**  
Run: `approved-live` · source: `live-https-allowlisted` · captured: `2026-11-20T08:02:50.795Z`  
Successful document parses: **2/4**.

Dry-run (`pnpm inspect:discovery`) enumerated the same four targets with **zero network I/O** before this single live batch.

---

## Authorized destinations

| ID | Provider | URL | Kind |
| --- | --- | --- | --- |
| DISC-001 | Agent Zero | `https://onchainagentintel.io/.well-known/agent-card.json` | agent-card |
| DISC-002 | Agent402 | `https://agent402.tools/.well-known/agent-card.json` | agent-card |
| DISC-003 | Agent402 | `https://agent402.tools/openapi.json` | openapi |
| DISC-004 | QuantJourney | `https://agents.quantjourney.cloud/.well-known/agent-card.json` | agent-card |

Never contacted: `.well-known/x402`, `/v1/intel`, Selfradiance, MCP/tools, discovered OpenAPI operations, facilitators/payments.

---

## Live results

| ID | Provider | Status | HTTP | Bytes | SHA-256 prefix | Summary | Error |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DISC-001 | Agent Zero | `networkError` | — | — | — | — | `read ECONNRESET` (`connection`) |
| DISC-002 | Agent402 | `success` | 200 | 1968 | `5e8977584d85` | 5 skills | |
| DISC-003 | Agent402 | `oversized` | — | — | — | — | Response exceeded 262144 byte limit |
| DISC-004 | QuantJourney | `success` | 200 | 20406 | `7e833fa17108` | 35 skills | |

Pinned connect IPs (success only): DISC-002 `104.21.37.50`; DISC-004 `104.26.14.81`.

Evidence JSON: `docs/day4/evidence/discovery-inspection.json`  
Evidence SHA-256: `c9a86e900a134aad6f477a924921277685a5fa3f77ce763ce8a99e1d8006c9c1`

---

## DocumentationCompatibility (not B4 upgrades)

### DISC-002 Agent402 agent-card

- Name: `Agent402` · protocolVersion `0.3.0` · version `2.1.0`
- Skill ids: `catalog-find`, `route-execute`, `llm-gateway`, `research-reports`, `x402-index`
- **explicitSkillMatch for `wallet-activity-summary@1.0`:** false
- relatedHints: none
- No `endpointStatus` / `requestSchema` / payment claims from this document

### DISC-003 Agent402 OpenAPI

- Body aborted by streaming **256 KiB** cap → `oversized`
- No path/method inventory from this live observation (document not retained)
- No OpenAPI operations authorized or executed

### DISC-004 QuantJourney agent-card

- Name: `QuantJourney Research Agent Fabric`
- 35 skills (company/earnings/SEC/portfolio/risk family); none equal `wallet-activity-summary@1.0`
- **explicitSkillMatch:** false · relatedHints: none
- DocumentationCompatibility only — no B4 milestone upgrade

### DISC-001 Agent Zero agent-card

- Transport failed closed (`ECONNRESET`); no document bytes; no invented compatibility

---

## Guardrails

- Exact four GET destinations only; immutable allowlist separate from D4.2 manifest (`approvedForNetworkExecution` remains false there).
- Reused D3.5 `secureHttpsExchange` / `secureHttpsGet`: TLS verify, DNS/public-IP pin, no redirects, ≤10s, ≤256 KiB, concurrency ≤2, **no retries**.
- `Accept: application/json`; no cookies / Authorization / request body.
- Documents treated as untrusted data; `$ref` / links not fetched.
- HTTP 402 would be recorded sanitized (no PAYMENT-SIGNATURE / x402 verification) — not observed in this batch.
- D4.3b execution remains **unapproved**.

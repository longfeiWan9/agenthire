# AgentHire D4.3b — Service Interface Assessment

Mode: `READ_ONLY / NO_SIGNING / NO_PAYMENT / NO_NEW_PROVIDER_REQUESTS`  
Sources (local only): `docs/evidence/provider-catalog.json`, `docs/day4/evidence/discovery-inspection.json`, `docs/day4/provider-inventory.md`, `docs/day4/endpoint-inspection-plan.md`  
MVP task: `wallet-activity-summary@1.0`  
Module: `src/providers/service-interface.ts`

No new provider HTTP/DNS. No invented methods, URLs, schemas, or payment offers. Catalog `OTHER` ≠ GET/POST/HEAD.

---

## Summary

| Provider | Catalog services | Discovery card | Explicit MVP task | Observed x402 offer | Interface readiness |
| --- | ---: | --- | --- | --- | --- |
| Agent402 | 5 | success (DISC-002) | **no** | **none** | docs partial; payment unverified |
| QuantJourney | 4 | success (DISC-004) | **no** | **none** | research skills only; payment unverified |
| Agent Zero | 20 | networkError (DISC-001) | **no** | **none** | **inconclusive** |

---

## Agent402 (`eip155:8453/…/94639`)

| Field | Evidence |
| --- | --- |
| providerId | `eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/94639` |
| registry chain | `8453` (identity only — **not** payment network) |
| x402Advertised | `true` (provider scope) |
| advertisedNetworks | unspecified (`[]`) |
| observedOffers | `0` |
| evidenceIds | `ev-registryRead-b5e040c8d4132406`, `ev-metadataFetch-0c61f5a4c4474c99`, DISC-002/003 |

### Catalog services

| serviceId | endpointUrl | method | req/res schema | auth | task | x402 | unknowns |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `a2a-684fdeab4efe67f7` | `https://agent402.tools/.well-known/agent-card.json` | **null** (catalog OTHER) | notChecked / notChecked | provider x402 claim only | none claimed | provider-scope ad | method; schema; no MVP skill |
| `mcp-cf6b9a27b4f9e8d7` | `https://agent402.tools/mcp` | null | notChecked | unknown | none | provider-scope ad | method; schema; non-discovery |
| `openapi-c6e4e0d8beb343e8` | `https://agent402.tools/openapi.json` | null | notChecked | unknown | none | provider-scope ad | DISC-003 **oversized** — no path inventory |
| `web-e94384a0e5f7cd9e` | `https://agent402.tools/` | null | notChecked | unknown | none | provider-scope ad | ambiguous web root |
| `x402-b002ca7b39879b45` | `https://agent402.tools/.well-known/x402` | null | notChecked | unknown | none | provider-scope ad | **never contacted**; no offer bytes |

### Discovery skills (DISC-002 agent-card) — not payment endpoints

| skill id | name | MVP exact match | notes |
| --- | --- | --- | --- |
| `catalog-find` | Find a tool for a task | no | discovery/routing |
| `route-execute` | Route and execute a paid call | no | execution skill; not B1/B2 |
| `llm-gateway` | Model calls priced per request | no | unrelated |
| `research-reports` | Finished research reports | no | generic research ≠ wallet-activity-summary |
| `x402-index` | The x402 seller index | no | **index skill ≠ payment endpoint** |

`explicitSkillMatch` for `wallet-activity-summary@1.0`: **false**.  
Agent-card response headers advertise `PAYMENT-REQUIRED` exposure capability — **not** an observed challenge.

---

## QuantJourney (`eip155:84532/…/9136`)

| Field | Evidence |
| --- | --- |
| providerId | `eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136` |
| registry chain | `84532` (Sepolia identity — **still ≠** verified payment offer) |
| x402Advertised | `false` |
| observedOffers | `0` |
| evidenceIds | `ev-registryRead-baca02c69a6eef41`, `ev-metadataFetch-7b0f459453e4750d`, DISC-004 |

### Catalog services

| serviceId | endpointUrl | method | schemas | x402 notes | unknowns |
| --- | --- | --- | --- | --- | --- |
| `a2a-b0315e364f73a4a6` | `…/.well-known/agent-card.json` | null | notChecked | none | 35 skills; no MVP id |
| `mcp-c6a0526fbaadbbd6` | `https://api.quantjourney.cloud/mcp` | null | notChecked | none | method/schema |
| `web-496fce6fe8cd40ca` | `https://agents.quantjourney.cloud/` | null | notChecked | none | web root |
| `x402-4b0816487b68c62a` | `…/.well-known/x402` | null | notChecked | description `x402 (v2)` only | **never contacted**; no HTTP 402 |

### Discovery skills (DISC-004)

35 research / portfolio / SEC / rates skills (e.g. `qj-company-snapshot-lite`, `qj-earnings-preview`, …).  
**None** equal `wallet-activity-summary@1.0`. Generic financial research ≠ B1/B2 match. relatedHints: none.

---

## Agent Zero (`eip155:8453/…/19353`) — inconclusive

| Field | Evidence |
| --- | --- |
| x402Advertised | `true` (provider scope) |
| DISC-001 | `networkError` / `ECONNRESET` — **no body** |
| Card skills / schemas | **unknown** (not invented) |
| Per-service methods | all catalog `OTHER` → method **null** |
| Observed offers | none |

Do not infer interfaces from marketing copy in registration description. Path-templated intel routes remain unresolved.

---

## Cross-cutting unknowns (all providers)

1. No explicit HTTP GET/POST/HEAD in catalog.  
2. `requestSchemaStatus` / response schemas: notChecked.  
3. No `claimedTaskTypes` for `wallet-activity-summary@1.0`.  
4. No per-service observed x402 offers; provider ads ≠ challenges.  
5. Registration chain ≠ payment network.  
6. OpenAPI ops (Agent402) not authorized and not parsed (oversized).  
7. No B4 upgrades (`endpointReachable` / `challengeVerified` / `paymentCompatible` / `paidVerified`) from this assessment.

---

## Proposed inspections

See `docs/day4/evidence/proposed-service-inspections.json` (≤3; all `approvedForNetworkExecution: false`).

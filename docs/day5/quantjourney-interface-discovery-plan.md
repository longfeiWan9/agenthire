# D5.3 — QuantJourney Interface-Discovery Plan

**Mode:** `STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_FETCH`  
**Capability:** `cap:79da211975c2` · skill `qj-sec-company-identity`

## Rule

Propose at most **2** exact URLs that are **source-declared** in local evidence for interface documents (OpenAPI or skill route).  
If none are source-declared → **empty proposals**.  
**Do not invent** OpenAPI or skill URLs. **Do not fetch.**

## Local evidence consulted (no I/O)

| Source | Finding |
| --- | --- |
| DISC-004 agent-card summary | `url: null`; description mentions OpenAPI generically |
| `docs/day5/evidence/selected-capability.json` | `httpMethod: null`, `endpointUrl: null`, `openapiInventory: null`, `interfaceDocumented: false` |
| Agent-card URL | Discovery-only — **not** a skill endpoint |

## Result

| Field | Value |
| --- | --- |
| `proposals` | `[]` (count **0**) |
| `maxProposals` | `2` |
| `fetchPerformed` | `false` |
| `approvedForNetworkExecution` | `false` |

## Why empty

QuantJourney states that generic A2A task delegation is disabled and that OpenAPI query routes should be used, but the captured agent-card does **not** declare an exact OpenAPI document URL. Skill method/URL remain unknown. Inventing `https://agents.quantjourney.cloud/openapi.json` (or any skill path) would violate evidence rules.

## Evidence artifact

`docs/day5/evidence/proposed-interface-document-inspection.json`

## Code

`src/hiring/interface-discovery-plan.ts` → `buildQuantJourneyInterfaceDiscoveryPlan()`

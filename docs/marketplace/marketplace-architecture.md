# Marketplace Architecture — Hybrid Capability Discovery

**Mode:** `STRICTLY_OFFLINE` · D4.5

## Modules

```text
src/marketplace/types.ts                  Domain types (AgentProfile, ServiceCapability, HireJob, CapabilityRecord)
src/marketplace/categories.ts             Curated category registry
src/marketplace/classify.ts               Offline category / keyword / protocol helpers
src/marketplace/catalog.ts                Merge builder + deterministic IDs
src/marketplace/search.ts                 Discoverability search (≠ readiness)
src/marketplace/integration-readiness.ts  ≤5 unapproved ExternalIntegrationCandidate
src/scripts/build-marketplace-catalog.ts  pnpm build:marketplace
```

## Evidence inputs (offline only)

| Path | Role |
| --- | --- |
| `docs/evidence/provider-catalog.json` | ERC-8004 services |
| `docs/evidence/provider-verification.json` | B3/B4 derived verification view |
| `docs/day4/evidence/discovery-inspection.json` | D4.3a agent-card skills |
| `docs/day4/evidence/agent402-full-resource-catalog.json` | Full 620 D4.4b x402 resources |

## Merge policy

1. Emit **separate** capability rows per source kind (`erc8004-service`, `agent-card-skill`, `x402-resource`, `agenthire-planned`).
2. **Deterministic IDs** from `providerKey + serviceKey` with `~N` collision suffixes.
3. **Conservative correlation keys** — exact URL / skill id / service id only. No silent name-only merges of capability rows (name may attach a skill to an existing AgentProfile, but rows stay distinct).
4. **Count separately:** agentProfiles · skills · resources · erc8004Services · planned · capabilities. **620 resources ≠ 620 agents.**
5. Verification is a **derived B3/B4 view** — never invent marketplace `verified`.

## Search ranking

exact task → explicit capability → descriptive → category  
Ties: `capabilityId` ascending. Search does not assert readiness.

## Outputs

```text
docs/marketplace/evidence/capability-catalog.json
docs/marketplace/evidence/category-summary.json
docs/marketplace/evidence/external-integration-candidates.json
```

Dual `pnpm build:marketplace` must be byte-identical (SHA-256 stable).

# AgentHire D4.3b — x402 Challenge Readiness

Mode: `READ_ONLY / NO_SIGNING / NO_PAYMENT / NO_NEW_PROVIDER_REQUESTS`  
Modules: `src/x402/challenge-types.ts`, `challenge-parser.ts`, `offer-policy.ts`  
Policy target (MVP §1.2):

| Field | Required |
| --- | --- |
| Protocol | x402 **v2** |
| Scheme | `exact` |
| Network | `eip155:84532` |
| Asset | Base Sepolia test USDC |
| Asset address | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Payment approval | Required before signing |
| Service task | `wallet-activity-summary@1.0` |

Synthetic fixtures in tests are labeled **`synthetic`**. No live Payment Required bytes were captured in D4.3a. This document does **not** invent live evidence.

---

## Evidence ladder (do not skip steps)

```
advertises x402
  → docs describe challenge
    → HTTP 402 observed
      → parsed / validated (protocol)
        → policy-satisfying offer (Sepolia exact + approved USDC)
          → authorized payment / settlement
            → valid task result
```

| Provider | Adv. | Docs describe | HTTP 402 observed | Parsed live | Policy offer | Authorized | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Agent402 | yes (provider) | partial (headers capability; `.well-known/x402` unprobed) | **no** | n/a | **no** | **no** | **no** |
| QuantJourney | no (`x402Advertised=false`); svc desc `x402 (v2)` | unprobed `.well-known/x402` | **no** | n/a | **no** | **no** | **no** |
| Agent Zero | yes (provider) | card fetch failed | **no** | n/a | **no** | **no** | **no** |

Mainnet ≠ Sepolia. ERC-8004 registration chain ≠ payment network.

---

## Seven readiness questions

### 1. Have we observed a live HTTP 402 Payment Required from these providers?

**No.** D4.3a discovery GETs returned 200 (Agent402/QuantJourney cards), `oversized` (Agent402 OpenAPI), or `networkError` (Agent Zero). `paymentRequiredObserved: false` on all four evidences. `.well-known/x402` was never contacted.

### 2. Do registration or agent-card docs establish `wallet-activity-summary@1.0`?

**No.** Catalog `claimedTaskTypes` are empty. Agent402 skills and QuantJourney’s 35 skills have `explicitSkillMatch: false`. Keyword/research similarity is not an exact B1/B2 match.

### 3. Can we parse unsigned x402 v2 challenges offline?

**Yes (synthetic).** `parseHttp402Challenge` / `parsePaymentRequiredObject` accept status 402 + `PAYMENT-REQUIRED` base64/base64url or JSON body, extract version/scheme/network/asset/amount/payTo/timeout, and fail closed on malformed/unsupported inputs. No payment SDK installed. Uncertainty: in-repo types are a **minimal** envelope aligned to common x402 v2 Payment Required shapes; exotic vendor extensions are preserved only as `extraKeys` / warnings — not invented as required fields.

### 4. Does protocol parse imply Sepolia policy pass?

**No.** Parser ≠ policy. `evaluateOfferPolicy` separately requires `exact`, `eip155:84532`, approved Sepolia USDC, well-formed amount/payTo, explicit `paymentApprovalGranted`, and task binding to `wallet-activity-summary@1.0`. Mainnet (`eip155:8453`) and non-approved assets fail. Well-formed synthetic Sepolia offers are `structurallyCompatible` but `policyPass: false` without approval.

### 5. Do provider-level x402 advertisements count as observed offers?

**No.** `evaluateProviderClaimWithoutChallenge` always fails parse/policy. Agent402 `x402Advertised=true` and QuantJourney service description `x402 (v2)` are documentation claims only. `x402-index` skill is a seller index — not a payment endpoint.

### 6. What unsigned inspections remain worth proposing (still unapproved)?

At most three evidence-backed proposals in `docs/day4/evidence/proposed-service-inspections.json`:

1. **PSI-001** GET `https://agent402.tools/.well-known/x402`  
2. **PSI-002** GET `https://agents.quantjourney.cloud/.well-known/x402`  
3. **PSI-003** GET `https://agent402.tools/openapi.json` (prior oversized — needs **separate** size-cap auth)

All have `approvedForNetworkExecution: false`. D4.3b does **not** execute them.

### 7. What is the recommended next step?

Prefer **authorized live GET of PSI-001 and/or PSI-002** (exact URL, unsigned, existing 256 KiB / no-redirect controls) to capture real Payment Required or x402 metadata for offline parse+policy — **or**, if product priority is the MVP task itself, acknowledge **insufficient external-provider task docs** and plan the **self-hosted fallback** path for `wallet-activity-summary@1.0` rather than forcing a mismatched seller. Do **not** raise OpenAPI size limits, retry Agent Zero, or enable signing without new authorization.

---

## Parser / policy surface

| Module | Role |
| --- | --- |
| `challenge-types.ts` | Approved constants + parse/policy result types |
| `challenge-parser.ts` | Pure HTTP 402 / PAYMENT-REQUIRED / JSON parse |
| `offer-policy.ts` | Sepolia exact USDC policy; approval gate; ad-without-challenge helper |

Tests: `tests/x402-challenge.test.ts` (synthetic fixtures only).

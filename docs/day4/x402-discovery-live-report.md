# AgentHire D4.3c — Live Unsigned x402 Discovery Inspection

Mode: **READ_ONLY / NO_SIGNING / NO_PAYMENT / TWO_APPROVED_GET_TARGETS_ONLY**  
Run: `approved-live` · source: `live-https-allowlisted` · captured: `2026-11-20T08:33:13.632Z`  
Successful document observations: **2/2**; paymentRequired: **0**.  
MVP task: `wallet-activity-summary@1.0` — never bound from discovery alone.

## Executive summary

One approved live batch contacted exactly **XDISC-001** and **XDISC-002** via D3.5 secure HTTPS (TLS verify, DNS/IP pin, 0 redirects, ≤10s, ≤256 KiB, concurrency ≤2, **0 retries**). Both returned **HTTP 200** JSON discovery-style documents. **No HTTP 402** and **no `PAYMENT-REQUIRED` header** were observed. Agent402 published a large legacy fan-out list (**620** claimed resources, sample truncated in evidence). QuantJourney returned an `x402Version: 2` document with an **empty** `resources` array and claim keys (`links`, `provider`, `status`, `runtimeAuthority`) only. Advertised resources and facilitator links were **not fetched**. Layers kept separate: transport ok → document recognition → x402 parse notAttempted → Sepolia policy notAttempted. No B4 catalog upgrades. No signing / payment.

## Spec revisions consulted (research ≠ permission)

- x402 specification v2: https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md
- HTTP transport v2: https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md
- Upstream repo HEAD at research time: `971e64f0a5945896e47ab9dec26af056f992cd1b`

## Authorized destinations (exactly two)

| ID | Provider | URL | Prior proposal |
| --- | --- | --- | --- |
| XDISC-001 | Agent402 | `https://agent402.tools/.well-known/x402` | PSI-001 |
| XDISC-002 | QuantJourney | `https://agents.quantjourney.cloud/.well-known/x402` | PSI-002 |

## HTTP table

| ID | Provider | Status | HTTP | Bytes | sha256 prefix | Pin | Document | x402 parse | Sepolia policy | Error |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| XDISC-001 | Agent402 | success | 200 | 59204 | `57182ef89b91`… | `104.21.37.50` | legacyResourceList (v1, 620 claims) | notAttempted | notAttempted | |
| XDISC-002 | QuantJourney | success | 200 | 533 | `ab549857c59b`… | `104.26.15.81` | legacyResourceList (x402Version 2, 0 claims) | notAttempted | notAttempted | |

## Discovery

| Field | XDISC-001 | XDISC-002 |
| --- | --- | --- |
| recognitionKind | `legacyResourceList` | `legacyResourceList` |
| version field | `version: 1` (no `x402Version`) | `x402Version: 2` |
| name | Agent402.Tools | n/a |
| advertisedResourceCount | 620 (25-sample stored; truncated) | 0 |
| top-level claim keys (selected) | `payment`, `settlementFacilitators`, `mcp`, `resources`, … | `links`, `provider`, `status`, `runtimeAuthority`, `resources` |
| resources fetched | **none** | **none** |

## Protocol

- Canonical v2 HTTP Payment Required location (`PAYMENT-REQUIRED` base64 header on HTTP 402) was **not present** on either response.
- `paymentRequiredObserved: false` on both evidences.
- Offline parser/policy modules were not advanced past `notAttempted` for these captures (no 402 envelope).
- Mainnet ≠ Sepolia remains enforced for any future captured offers.

## Task

- Explicit MVP skill `wallet-activity-summary@1.0` is **not** established by these discovery GETs.
- `mvpTaskBound: false` on both evidences.
- Agent402 resource URL strings (e.g. `/api/extract`) are untrusted claims — not task bindings and not authorized follow-ups.

## Security

- Exact two GET destinations; no retries; 0 redirects; ≤10s; ≤256 KiB; concurrency ≤2.
- TLS verify + SNI; public DNS/IP pin; no creds/cookies/body.
- Never contacted: Agent Zero `/v1/intel`, Agent402 `/openapi.json`, MCP, facilitators, RPC, D4.3a retries, advertised resource URLs.
- No historical catalog B4 flips (`endpointReachable` / `challengeVerified` / `paymentCompatible` / `paidVerified`).

## Unapproved next candidates

- PSI-003 OpenAPI size-cap raise remains **unauthorized**.
- Any of the 620 Agent402 advertised resource URLs remains **unapproved**.
- QuantJourney `links` / `runtimeAuthority` targets remain **unapproved**.
- Signing / facilitators / payment settlement remain **forbidden**.

## Viability

Discovery endpoints are reachable and return JSON manifests, but they do **not** yet demonstrate a live unsigned Payment Required offer under AgentHire Sepolia policy, nor MVP task binding. Safe observation complete; payment/task execution still blocked pending new authorization.

Evidence JSON: `docs/day4/evidence/x402-discovery-inspection.json`.

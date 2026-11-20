# AgentHire D4.4 — Offline External Resource-Catalog Analysis

Mode: **READ_ONLY / NO_SIGNING / NO_PAYMENT / STRICTLY_OFFLINE**
MVP task: `wallet-activity-summary@1.0`
Coverage: **sampleOnly** · reported 620 · recoverable 25

## A. Summary

Only a sanitized **25-entry sample** is recoverable locally of **620** reported Agent402/QuantJourney advertised resources. Missing entries were **not** invented. SHA-256 of the discovery body does not recover omitted resources.

Shortlist size: **0** (max 3). All candidates `approvedForNetworkExecution: false`. No B4 upgrades.

## B. Coverage

| Source | Provider | Reported | Recoverable | Truncated | Full body | contentSha256 |
| --- | --- | ---: | ---: | --- | --- | --- |
| XDISC-001 | Agent402 | 620 | 25 | true | false | `57182ef89b91…` |
| XDISC-002 | QuantJourney | 0 | 0 | false | true | `ab549857c59b…` |

| Metric | Value |
| --- | ---: |
| uniqueUrlCount | 25 |
| uniqueMethodUrlCount | 25 |
| uniqueIdCount | 25 |
| sampleLimitObserved | 25 |
| orderingPreserved | true |

Honesty notes:

- SHA-256 of a discovery response body does not make that body recoverable
- Advertised resources were not fetched; inspectionStatus is always notChecked
- Payment assessments are metadata claims only — never a live challenge
- No B4 catalog upgrades from this offline analysis
- Only a sanitized sample is recoverable (25 of 620 reported); missing entries were not invented

## C. Classification (recoverable only)

_Category and relevance counts below are **sample-labeled** — they do not describe the unrecovered remainder._

| Category | Count |
| --- | ---: |
| developerInfrastructure | 22 |
| content | 3 |

| TaskRelevance | Count |
| --- | ---: |
| explicitMatch | 0 |
| adaptableCandidate | 0 |
| potentiallyRelated | 0 |
| unrelated | 25 |
| unknown | 0 |

| Payment assessment | Count |
| --- | ---: |
| claimsPolicyMatch | 0 |
| claimsPolicyMismatch | 0 |
| insufficientInformation | 25 |

## D. Families

| Family | Count |
| --- | ---: |
| `/api/base64` | 1 |
| `/api/dns` | 1 |
| `/api/extract` | 1 |
| `/api/hash` | 1 |
| `/api/hex` | 1 |
| `/api/hmac` | 1 |
| `/api/jwt-decode` | 1 |
| `/api/memory` | 10 |
| `/api/meta` | 1 |
| `/api/password` | 1 |
| `/api/pdf` | 1 |
| `/api/render` | 1 |
| `/api/screenshot` | 1 |
| `/api/ulid` | 1 |
| `/api/url-code` | 1 |
| `/api/uuid` | 1 |

## E. Shortlist

Empty shortlist — recoverable sample lacks sufficiently evidenced wallet/tx/blockchain-data candidates for unsigned inspection review. Empty is valid.

## F. Payment claims

All payment assessments are **metadata-only** versus Sepolia policy (`v2` / `exact` / `eip155:84532` / USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` / 6). They are **not** live challenges and do not set `paymentCompatible`.

## G. Security / offline posture

1. No DNS, HTTP, RPC, facilitator, or browser access in this step.
2. Secrets in URLs redacted via `sanitizeEndpointForArtifact`.
3. Methods never defaulted to GET.
4. `inspectionStatus: notChecked` on every resource.
5. `approvedForNetworkExecution: false` on every shortlist candidate.
6. No B4 upgrades.

## H. Artifacts

- `docs/day4/evidence/resource-catalog-analysis.json`
- `docs/day4/evidence/resource-inspection-shortlist.json`
- `docs/day4/resource-catalog-analysis.md`

## I. Limitations

- Coverage **sampleOnly**: unrecovered advertised entries cannot be classified.
- Sample URL paths (utilities/memory/content) do not establish MVP task support.
- Document-level payment/facilitator claim keys without per-resource fields → `insufficientInformation`.

## J. Next authorization (not executed)

- Re-authorize storing a full offline resource dump (or raise sample cap) if catalog completeness is required.
- Any follow-up GET of an advertised resource URL requires a new exact allowlist approval.
- Signing / payment / facilitators remain forbidden.


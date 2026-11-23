# D5.1 — External Capability Comparison

**Mode:** `STRICTLY_OFFLINE`  
**Primary evidence:** `docs/marketplace/evidence/external-integration-candidates.json`, capability catalog, DISC-*/XDISC-*/CATALOG-001 artifacts.

Evidence ladder used throughout (do not skip levels):

1. Advertised capability  
2. Documented interface (method + URL + schemas)  
3. Observed endpoint reachability  
4. Verified task execution  
5. Verified payment compatibility  
6. Verified settlement  

All five D4.5 candidates stop at **(1)** with a skill description. None reach (2)–(6).

## Five D4.5 shortlist candidates

### 1. Security Screen — `cap:1e34c6a2a00f` (`extint-001`)

| Dimension | Finding |
| --- | --- |
| Identity | QuantJourney discovery profile `agent:external:1589ec8e8059` (`skill-provider:QuantJourney`) |
| Capability | Screen U.S. public companies / named index via allowlisted precomputed metrics; ETFs/funds excluded; no arbitrary SQL |
| Category | `data-analytics` |
| Endpoint | **unknown** |
| Method | **unknown** |
| Input | undocumented (description implies ticker/index + metric allowlist) |
| Output | undocumented structured screen results |
| Safety | read-only likely; non-destructive; no credential hint |
| Payment | skill `paymentAdvertised: null`; no HTTP 402 |
| Evidence | DISC-004 skill `qj-security-screen` |
| Adaptation | Need OpenAPI/query route + schemas (card: A2A delegation disabled) |
| Blockers | No method/URL/schema; no execution; no payment |

### 2. Find a tool for a task — `cap:3098a49338c7` (`extint-002`)

| Dimension | Finding |
| --- | --- |
| Identity | Agent402 ERC-8004 profile `…/94639` |
| Capability | Resolve plain-language task → callable endpoint + price + input schema; claims **Free** |
| Category | `data-analytics`, `developer-tools` |
| Endpoint | Agent-card base URL `https://agent402.tools/api` (card-level, not skill-route) |
| Method | **unknown** for this skill |
| Input / output | undocumented beyond description |
| Safety | discovery-oriented; adjacent skill `route-execute` is paid execution (not selected) |
| Payment | null on skill; provider advertises x402; no skill-level 402 |
| Evidence | DISC-002 skill `catalog-find` |
| Adaptation | A2A or OpenAPI (OpenAPI DISC-003 **oversized** — no inventory) |
| Blockers | Meta-routing may fan out to undocumented paid calls; no schema |

### 3. SEC Company Facts Compact — `cap:3a015aec3dc0` (`extint-003`)

| Dimension | Finding |
| --- | --- |
| Identity | QuantJourney discovery profile |
| Capability | Project selected current SEC XBRL facts into a small evidence envelope |
| Category | `research-intelligence`, `data-analytics` |
| Endpoint / method | **unknown** / **unknown** |
| Input / output | undocumented; description implies issuer + selected facts → compact envelope |
| Safety | public-data; read-only likely |
| Payment | null; XDISC-002 empty resource list |
| Evidence | DISC-004 `qj-sec-company-facts-compact` |
| Adaptation | OpenAPI bounded query routes required |
| Blockers | No route/schema; no execution/payment verification |

### 4. SEC Insider Filing Activity — `cap:160074e18690` (`extint-004`)

| Dimension | Finding |
| --- | --- |
| Identity | QuantJourney discovery profile |
| Capability | Recent official SEC Form 4 **filing metadata / accessions only** (explicitly not parsed buys/sells) |
| Category | `research-intelligence`, `content-documents` |
| Endpoint / method | unknown |
| Safety | non-destructive; D4.5 did **not** mark readOnlyLikely |
| Payment | unverified |
| Evidence | DISC-004 `qj-insider-activity` |
| Blockers | Same OpenAPI gap; weaker read-only classification in D4.5 |

### 5. SEC Filing Delta — `cap:4da2cf413278` (`extint-005`)

| Dimension | Finding |
| --- | --- |
| Identity | QuantJourney discovery profile |
| Capability | Compare selected SEC XBRL facts between latest two filings of one form type |
| Category | `research-intelligence` |
| Endpoint / method | unknown |
| Safety | read-only likely |
| Payment | unverified |
| Evidence | DISC-004 `qj-sec-filing-delta` |
| Blockers | Comparison semantics harder to verify; OpenAPI missing |

## Additional catalog candidates reviewed

| Capability | ID | Why considered | Outcome |
| --- | --- | --- | --- |
| SEC Company Identity | `cap:79da211975c2` | Narrow ticker/name → SEC CIK/exchange; public-data; high verifiability | **Selected primary** (planning) |
| Company Snapshot Lite | `cap:e5aeb6badac2` | Free bounded snapshot; highest numeric D5.1 score | Strong alternate; not primary (price freshness harder to verify) |
| GLEIF Entity Lookup | `cap:031dceb60db6` | Narrow LEI/entity resolve | Solid; shelf=`other`; behind Identity for demo category clarity |
| Agent402 `/api/base64` | `cap:349239bd1d0a` | Exact URL; developer utility | **Hard-excluded** — METHOD_UNSPECIFIED + empty description → no safe invocation plan |
| Agent402 `/api/json-validate` | `cap:fe75bb2e25f2` | Exact URL; validation utility | **Hard-excluded** — same |
| Agent402 CATALOG shortlist (`evm-rpc`, `onchain-sql`, `onchain-sql-schema`) | resource rows | Prior MVP-adjacent URLs | Method unspecified; SQL/RPC side-effect risk; not chosen for first hire demo |

## Ranking summary

See `docs/day5/evidence/integration-candidate-ranking.json` (weights 25/20/20/15/10/10).

Numeric leaders among non-excluded rows: Snapshot Lite (71) → Facts Compact (68) → GLEIF (64) → catalog-find (63) → Filing Delta / Identity (62).  
**Primary selection overrides pure score** toward Identity for deterministic public-identifier verification. Backup remains Facts Compact (D4.5 shortlist + high score).

## Payment compatibility (all candidates)

Controlled policy: x402 v2 · `exact` · `eip155:84532` · USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` · 6 decimals.

| Candidate family | x402 advertised | HTTP 402 observed | v2 offer verified | Policy match | Amount/payTo/facilitator |
| --- | --- | --- | --- | --- | --- |
| QuantJourney skills | discovery doc x402Version=2, **0** resources; skill payment null | **no** | **no** | **no** | unknown |
| Agent402 skills | provider-scope / legacy v1 resource list | **no** (discovery was HTTP 200) | **no** | **no** | unknown |
| Agent402 URL resources | `paymentAdvertised: true` in catalog | **no** (resources never fetched) | **no** | **no** | unknown |

Discoverable ≠ payable. No candidate is payment-verified.

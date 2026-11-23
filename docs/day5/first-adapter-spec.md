# D5.1 — First Capability Adapter Spec (D5.2 planning)

**Mode:** `STRICTLY_OFFLINE` · **Target capability:** `cap:79da211975c2` SEC Company Identity  
**Status:** Implementation specification only — **no adapter runtime in D5.1**.

---

## Capability identity

| Field | Value |
| --- | --- |
| Provider key | `skill-provider:QuantJourney` |
| Agent profile ID | `agent:external:1589ec8e8059` |
| Correlated ERC-8004 provider ID | `eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136` (heuristic) |
| Capability ID | `cap:79da211975c2` |
| Service key | `skill:qj-sec-company-identity` |
| Category | `research-intelligence` (also `data-analytics`) |
| Advertised function | Resolve a ticker or company name to official SEC identity and exchange fields |
| Required provenance | `external` · source `agent-card-skill` · evidence DISC-004 · fixtureKind `captured` |

---

## Input contract

| Field | Spec |
| --- | --- |
| Task type | `sec-company-identity@draft` (AgentHire-local draft id — **not** claimed by provider) |
| Input fields | `query` (string): ticker symbol **or** company name |
| Validation rules | non-empty; trim; reject control characters; reject URLs; reject SQL metacharacter payloads used as queries |
| Permitted input sizes | draft: `1..128` Unicode characters pending provider schema |
| Disallowed input values | empty; whitespace-only; `http(s)://…`; file paths; credentials; multi-issuer batch lists until schema allows |
| Sensitive-data restrictions | no PII beyond public company names; no wallet keys; no auth tokens |

Unknown provider field names must stay `unknown` until OpenAPI is retrieved — do not invent parameter keys beyond this draft envelope.

---

## Invocation contract

| Field | Value |
| --- | --- |
| Exact documented method | **unknown** |
| Exact documented URL | **unknown** |
| Request headers | **unknown** (card lists `securitySchemes` keys only in summary) |
| Request body / parameters | **unknown** |
| Expected response shape | **unknown** (description implies SEC identity + exchange fields) |
| Authentication requirements | **unknown** |
| Idempotency behavior | **unknown** (read-only public lookup presumed; not verified) |
| Card-level notes | QuantJourney: generic A2A task delegation **disabled**; use OpenAPI query routes |
| Provider agent-card URL (discovery only) | `https://agents.quantjourney.cloud/.well-known/agent-card.json` |

D5.2 must fail closed if method/URL remain unknown at execution time.

---

## Security

| Control | Requirement |
| --- | --- |
| URL allowlisting | Exact HTTPS allowlist entry for the **future** OpenAPI-documented query URL only; no globbing over `agents.quantjourney.cloud/*` |
| DNS/IP validation + TLS | Reuse D3.5 `secureHttps*` controls: TLS verify, public-IP pin, SNI |
| Redirect limits | **0** redirects |
| Timeout | ≤10s (align discovery transport) |
| Response-size limits | ≤256 KiB unless separately authorized |
| SSRF | Reject user-supplied URLs; only allowlisted host+path |
| Arbitrary destinations | Forbidden |
| Side effects | Treat as read-only intent; abort if provider docs later show write methods |
| Failure / retry | Fail closed; **no automatic retries** on network errors |
| Authorization | Separate human approval before any live GET/POST; D4.4b marker rules apply to any renewed catalog/OpenAPI fetch |
| Payment | No signing; no PAYMENT-SIGNATURE; challenges recorded sanitized only |

---

## Output verification

AgentHire can check **structural** usefulness without claiming semantic truth:

1. Response parses as JSON (if content-type JSON).  
2. Required draft fields present when schema becomes known (e.g. CIK-like identifier, exchange, matched name/ticker).  
3. CIK (when present) matches `^\d{1,10}$` or SEC zero-padded form once schema confirms.  
4. No embedded credentials or payment headers treated as success signals.

**Do not** claim that valid JSON proves the identity is correct. Semantic checks (cross-check vs EDGAR) are optional offline tooling, not proof of provider correctness.

---

## Offline fixtures (synthetic — not observed provider responses)

Label every fixture `fixtureKind: "synthetic"`.

| Fixture | Purpose |
| --- | --- |
| `success-aapl.json` | Synthetic success envelope with plausible public identity fields for AAPL |
| `invalid-input-empty.json` | Empty/whitespace query rejected by AgentHire validation **before** network |
| `invalid-input-url.json` | URL-shaped query rejected locally |
| `provider-error-4xx.json` | Synthetic provider client error body |
| `provider-error-5xx.json` | Synthetic provider server error |
| `incompatible-payment-402.json` | Synthetic HTTP 402 + non-Sepolia or wrong-asset offer for parser/policy tests |
| `compatible-payment-unapproved-402.json` | Synthetic Sepolia exact USDC offer that still fails without payment approval |

Never label these as captured QuantJourney responses.

---

## HireJob integration boundary (no runtime in D5.1)

```text
User request
    ↓
Capability selection  → cap:79da211975c2
    ↓
Task input validation → offline in D5.2
    ↓
Service adapter        → offline skeleton in D5.2; live call later
    ↓
Quote / payment policy → offline policy eval D5.3+; no signing
    ↓
Explicit human approval
    ↓
Authorized execution   → future milestone only
    ↓
Result verification    → structural checks offline-testable now
```

### Offline-capable in D5.2–D5.5

- Input validation + fixture-driven adapter unit tests  
- Ranking/selection flags preserved (`approvedForNetworkExecution: false`)  
- Payment challenge parse/policy against **synthetic** 402s  
- HireJob draft/quoted/authorized state machine **without** network side effects  

### Not authorized here

- OpenAPI fetch, skill invocation, wallet connect/sign, facilitator calls, settlement, B4 upgrades, marker reset

---

## Next documentation / inspection step (recommended)

Renewed human authorization for an exact-URL unsigned GET of QuantJourney OpenAPI (or the specific identity query route once named in docs), with size-cap policy decided up front — **after** security gates and dry-run. Until then, keep STRICTLY_OFFLINE.

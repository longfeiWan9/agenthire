# AgentHire D4.2 — Endpoint Safety Preflight & Inspection Plan

Mode: `READ_ONLY / NO_SIGNING / NO_NETWORK_INSPECTION`  
Policy module: `src/providers/inspection-policy.ts` (`policyVersion` `1.0`)  
Manifest proposal: `docs/day4/evidence/inspection-manifest.json`  
Manifest SHA-256: `482a76f354579f64243cae081fe51c9c99b7b301433b7c694fae5331ebc7f177`

This plan prepares **human-reviewed unsigned inspection** for a later D4.3 step.  
It does **not** authorize D4.3. Every manifest entry has `approvedForNetworkExecution: false`.

---

## 1. Planning statuses

| Status | Meaning |
| --- | --- |
| `eligibleForReview` | Static offline checks pass enough to **propose** a bounded unsigned probe for human review. **Not** network-approved. |
| `needsMoreInformation` | Method, path template, schema, or surface ambiguity blocks a safe proposal. |
| `rejected` | Static URL/safety policy fails (scheme, credentials, blocked literal IP, fragment, control chars). |

Static safety ≠ runtime safety. D4.3 must still perform DNS / public-IP bind / TLS verify / redirect refusal / connection limits.

---

## 2. Offline policy (deterministic)

Implemented in `assessStaticUrl` + `assessServiceForInspection`:

1. **HTTPS only** — non-`https:` → `rejected`.
2. **No embedded credentials** — userinfo → `rejected`; artifacts use `sanitizeEndpointForArtifact`.
3. **Literal IP hosts** — private / loopback / link-local / special-use IPv4 & IPv6 (incl. mapped) → `rejected`; public literal IP flagged (`literalPublicIpHost`) and not treated as hostname discovery.
4. **Fragments** → `rejected`.
5. **Control characters** → `rejected`.
6. **Path templates** (`{param}` / `%7B…%7D`) → `needsMoreInformation` until resolved to an exact route.
7. **Query strings** → require more information for eligibility (not auto-safe).
8. **Method**
   - Catalog `OTHER` is **not** GET.
   - Catalog `POST` is **not** auto-safe without documented request schema.
   - Only recognized static discovery paths may be proposed as **human-reviewed GET** while catalog method remains `OTHER`.
9. **Task relevance** — inventory only; `wallet analytics` ≠ `explicitMatch`.
10. **Provider `x402Advertised`** — labeled `x402ProviderScopeOnly`; never per-service payment proof.
11. **Secrets** — query keys like `api_key` / `token` / `signature` redacted in artifacts.

Discovery document paths eligible for proposed GET review (exact pathname):

- `/.well-known/agent-card.json`
- `/.well-known/x402`
- `/openapi.json`

---

## 3. Planning counts (from committed catalog)

| Status | Count |
| --- | ---: |
| Providers | 3 |
| Services assessed | 29 |
| `eligibleForReview` (shortlist) | 6 |
| `needsMoreInformation` | 23 |
| `rejected` | 0 |
| `approvedForNetworkExecution: true` | **0** |

### Shortlist (still unapproved)

| Provider | serviceId | Exact route scope | Proposed probe |
| --- | --- | --- | --- |
| Agent Zero | `a2a-8889450caf4353f8` | `https://onchainagentintel.io/.well-known/agent-card.json` | GET |
| Agent402 | `a2a-684fdeab4efe67f7` | `https://agent402.tools/.well-known/agent-card.json` | GET |
| Agent402 | `openapi-c6e4e0d8beb343e8` | `https://agent402.tools/openapi.json` | GET |
| Agent402 | `x402-b002ca7b39879b45` | `https://agent402.tools/.well-known/x402` | GET |
| QuantJourney | `a2a-b0315e364f73a4a6` | `https://agents.quantjourney.cloud/.well-known/agent-card.json` | GET |
| QuantJourney | `x402-4b0816487b68c62a` | `https://agents.quantjourney.cloud/.well-known/x402` | GET |

Shortlist ≠ all 29 URLs. Exact route scope only — no sibling path expansion.

---

## 4. Rejections and holds

### Statically rejected

None in the current Day-3 catalog (all 29 services are HTTPS hostname URLs without credentials/fragments/control chars).

### Needs more information (examples)

| Class | Why |
| --- | --- |
| Path templates (4 Agent Zero routes) | `{agent_id}`, `{sub_id}`, `{chain}` unresolved |
| MCP endpoints | Catalog `OTHER`; typically non-idempotent JSON-RPC — not treated as GET |
| Web roots / marketing hosts | Ambiguous surface; not discovery-document allowlist |
| Agent Zero `x402` → `/v1/intel` | Not a `.well-known/x402` document; method OTHER |
| Intel / audit / evaluate / seller-check APIs | Non-discovery; no schema; unrelated/unknown to MVP task |
| All services | `requestSchemaStatus: notChecked`; empty `claimedTaskTypes` |

### Historical research guardrails (not re-probed)

- **Agent402** — prior Mainnet x402 observations do not prove Sepolia payment or wallet-summary compatibility.
- **QuantJourney** — prior `503 x402_not_configured` is historical context only.
- **Selfradiance** — do not re-probe; intentionally stopped earlier.
- Do not invent HTTP responses or payment compatibility from advertisements.

---

## 5. D4.3 runtime limits (when separately authorized)

Future unsigned probes (not enabled here) must enforce at least:

| Control | Limit |
| --- | --- |
| Scheme | HTTPS only |
| Redirects | Refuse (no follow) |
| TLS | Verify certificates (`rejectUnauthorized: true`) |
| Address bind | Public IP only after DNS; pin at connect time |
| Timeout | ≤ 10s |
| Body | ≤ 256 KiB streaming cap |
| Concurrency | Low (≤ 2) |
| Credentials | None (no cookies / Authorization / client certs) |
| Retries | None by default for inspection proposals (fail closed) |
| Signing | Forbidden (`NO_SIGNING`) |
| Scope | Exact allowlisted route only |
| Approval flag | Require explicit `approvedForNetworkExecution: true` per entry after human review |

Reuse hardened helpers from `src/erc8004/secure-https.ts` where applicable; do not weaken them.

---

## 6. Facts still required before D4.3

1. Human selection of which shortlisted routes (if any) become network-approved.
2. Explicit per-entry `approvedForNetworkExecution: true` flip — never inferred.
3. Runtime DNS/IP/TLS/redirect/size checks on every approved probe.
4. Clarification of catalog `OTHER` methods for any non-discovery surface.
5. Resolution of path templates before those URLs can enter any allowlist.
6. Documented request/response schemas before any MVP task compatibility claim.
7. Independent x402 challenge evidence before any payment-compatibility claim (Base Sepolia policy only).

---

## 7. Determinism

- Assessments sorted by `providerId`, then `serviceId`.
- Manifest serialized with `stableStringify` (same helper as catalog).
- Dual `pnpm plan:inspections` runs produce byte-identical JSON (SHA-256 above).
- No `Date.now()` / random in the planning path.

---

## 8. Explicit non-goals (this step)

- No DNS or provider HTTP.
- No x402 challenge / settlement.
- No wallets / signing.
- No verification milestone upgrades to `endpointReachable` or beyond.
- No seller selection or AgentHire fallback substitution.

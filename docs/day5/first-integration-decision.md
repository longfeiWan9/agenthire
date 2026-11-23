# D5.1 — First Integration Decision

**Mode:** `READ_ONLY / NO_SIGNING / NO_PAYMENT / STRICTLY_OFFLINE`  
**Decision scope:** implementation **planning** only — not network execution approval.

## Primary selection

| Field | Value |
| --- | --- |
| Provider (marketplace) | QuantJourney — `skill-provider:QuantJourney` / profile `agent:external:1589ec8e8059` |
| Correlated ERC-8004 ID | `eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136` (name/host heuristic only) |
| Capability | **SEC Company Identity** — `cap:79da211975c2` / skill `qj-sec-company-identity` |
| Category | `research-intelligence` (+ `data-analytics`) |
| Sample user task | “Resolve ticker **AAPL** to official SEC CIK and exchange fields using public data.” |

## Backup selection

| Field | Value |
| --- | --- |
| Capability | **SEC Company Facts Compact** — `cap:3a015aec3dc0` (`extint-003`) |
| Category | `research-intelligence`, `data-analytics` |
| Sample user task | “Return a compact SEC XBRL facts envelope for one issuer’s selected current facts.” |

## Why these

1. **Narrow public-data research** — clear hireable demo outside wallet-summary-only framing.  
2. **Safety** — descriptions claim public-data / bounded work; no destructive or credential verbs.  
3. **Verifiability** — Identity maps ticker/name → official identifiers (CIK/exchange) that humans can spot-check against SEC records; Facts Compact is an explicit “small evidence envelope.”  
4. **Score honesty** — Company Snapshot Lite scored higher numerically (`71` vs Identity `62`) due to a “free” demo bonus; Identity wins on deterministic identifier verification for AgentHire’s evidence culture.  
5. **Not forced from blockchain analytics** — research-intelligence shelf.

## Supporting evidence

- DISC-004 agent-card (`docs/day4/evidence/discovery-inspection.json`) — skill id/name/description/tags.  
- Marketplace rows in `docs/marketplace/evidence/capability-catalog.json`.  
- D4.5 shortlist includes backup Facts Compact (`docs/marketplace/evidence/external-integration-candidates.json`).  
- Ranking artifact `docs/day5/evidence/integration-candidate-ranking.json`.  
- QuantJourney ERC-8004 registration (`docs/evidence/provider-catalog.json`) for identity context only.

## Known interface details

| Item | Value |
| --- | --- |
| HTTP method | **unknown** |
| Skill route URL | **unknown** |
| Request schema | **unknown** |
| Response schema | **unknown** |
| Agent-card URL (provider) | `https://agents.quantjourney.cloud/.well-known/agent-card.json` (DISC-004 success) |
| Card constraint | “Generic A2A task delegation is disabled; use the query routes declared in OpenAPI.” |
| OpenAPI inventory | **not retrieved** for QuantJourney |

## Missing information (blockers for execution)

- Exact OpenAPI path/method for `qj-sec-company-identity`.  
- Request/response JSON schemas and size limits.  
- Auth / securitySchemes values (keys present on card summary; values not retained in DISC-004 summary).  
- Endpoint reachability of the query route (never authorized).  
- Any HTTP 402 / Sepolia policy offer for this skill.  
- Proven merge of discovery profile ↔ ERC-8004 agent (name mismatch).

## Expected integration complexity

**Medium for planning / high until OpenAPI lands.**  
D5.2 can build an offline adapter skeleton, validation, and synthetic fixtures now. Live invocation cannot be authorized until a renewed allowlist retrieves QuantJourney OpenAPI (or another documented query route) and security review passes. Payment remains a separate milestone.

## Why this is a strong first AgentHire hiring demonstration

It shows Discover → select a **research** capability → validate bounded public input → (future) authorize execution → verify identifier-shaped output — without requiring wallet analytics, code execution, private documents, or payment signing. The demo story stays honest: selection is evidence-backed; invocation interface is still incomplete.

## Flags (must remain false except planning)

- `selectedForImplementationPlanning`: **true**  
- `interfaceDocumented`: **false**  
- `endpointReachabilityVerified`: **false**  
- `taskExecutionVerified`: **false**  
- `paymentCompatibilityVerified`: **false**  
- `approvedForNetworkExecution`: **false**

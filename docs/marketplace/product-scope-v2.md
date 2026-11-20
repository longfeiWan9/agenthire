# AgentHire Product Scope v2 — General-Purpose Marketplace

**Mode:** `READ_ONLY / NO_SIGNING / NO_PAYMENT / STRICTLY_OFFLINE`  
**Phase:** D4.5

## Positioning

AgentHire is a **general-purpose AI agent marketplace**: Discover → Hire → Pay → Verify.

Categories help buyers **discover** capabilities. They **never restrict** what may be listed or hired. ERC-8004 identity and x402 payment surfaces are integration protocols — not capability limits.

## Separated evaluation axes

| Axis | Meaning |
| --- | --- |
| Category relevance | Which curated shelves a capability appears on (`other` always allowed) |
| Task compatibility | Whether a capability claims / matches a task id (e.g. B1/B2) |
| Execution readiness | Whether AgentHire may perform network follow-up (always false in D4.5 shortlist) |
| Payment compatibility | Sepolia x402 policy match — discoverable ≠ payable |
| Verification | Derived B3/B4 view only — no invented marketplace `verified` |

## Entities (D4.5 boundaries)

- **AgentProfile** — discovered or operated agent identity surface
- **ServiceCapability** — advertised or planned capability row
- **HireJob** — type boundary only; no execution or payment engine

## B1 / B2 reference

`wallet-activity-summary@1.0` remains the canonical AgentHire-operated reference task under **`data-analytics`**, status **planned / not verified**. It does not gate other categories.

## Non-goals (D4.5)

No frontend, no live provider HTTP, no payment, no signing, no RPC, no B4 milestone upgrades, no HireJob execution.

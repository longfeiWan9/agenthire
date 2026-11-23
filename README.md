# AgentHire

**Discover. Trust. Hire. Pay. Verify.**

Open-source AI agent marketplace. Planned stack includes ERC-8004 identity/reputation, x402 v2 payments, and AI orchestration.

**Current status: Day 3 closeout** — fail-closed, read-only Base identity discovery through `metadataValidated`, offline into canonical `ProviderRecord@1.0` / `VerificationEvidence@1.0`. Mode remains **READ_ONLY / NO_SIGNING**.

Handoff detail: [`docs/read-only-spike.md`](docs/read-only-spike.md). Contracts: [`docs/specifications/MVP-contracts.md`](docs/specifications/MVP-contracts.md).

## What Day 3 implemented

| Area | Capability |
| --- | --- |
| Tooling | Strict TypeScript + pnpm workspace, Vitest, Corepack-pinned pnpm |
| ERC-8004 | Pinned Identity Registry ABI; `ownerOf` / `tokenURI` / `getAgentWallet` |
| RPC | Allowlisted HTTPS Base Mainnet / Sepolia PublicClient (`NO_SIGNING`) |
| Metadata | Exact-URL allowlist; secure HTTPS GET (no redirects, DNS/IP pin, size cap) |
| Catalog | Offline join → `ProviderRecord@1.0` + `VerificationEvidence@1.0` |
| Integrity | Cross-artifact checks; deterministic `pnpm build:catalog` from committed evidence |

Live RPC/HTTPS captures from D3.3–D3.5 are historical. Day 3 does **not** refresh them; catalog builds are offline on committed `docs/evidence/*.json`.

## Non-goals (still out of scope)

- No x402 install, payment, or settlement
- No service-endpoint probes or schema execution
- No wallets, private keys, or signing
- No hire/pay UX — `metadataValidated` ≠ hireable or payable
- Compatibility / payment checks remain `notChecked`; `observedOffers` stays empty

## Stack

- Node.js 26.x (see `.node-version`)
- pnpm **9.15.9** via Corepack (`packageManager` field — enable with `corepack enable`)
- TypeScript `5.9.3`, viem `2.58.0`, Vitest `5.1.0`, tsx `4.23.15`
- ESM (`"type": "module"`)

A host pnpm other than 9.15.9 may still honor the lockfile with `pnpm install --frozen-lockfile`; prefer Corepack so the pin matches CI.

## Prerequisites

- Node.js **26.x**
- Corepack (ships with Node) → `corepack enable` then use the `packageManager` pin

## Install

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Scripts

```bash
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest run (offline)
pnpm test:watch      # vitest
pnpm dev             # hello smoke (READ_ONLY / NO_SIGNING)
pnpm dev:ui          # Next.js marketplace UI (local-only; STRICTLY_OFFLINE)
pnpm build           # next build
pnpm start           # next start
pnpm check:rpc       # live Base RPC connectivity (optional refresh)
pnpm read:agents     # live registry identity snapshots (optional refresh)
pnpm read:metadata   # live allowlisted registration fetches (optional refresh)
pnpm build:catalog   # offline; deterministic catalog + verification from evidence
pnpm demo:hirejob:offline       # D5.2 offline HireJob fixtures
pnpm demo:hirejob:quote:offline # D5.3 quote + approval scenarios
```

## Offline marketplace UI (D5.6)

Local Next.js App Router explorer over committed marketplace evidence (690 capabilities). No provider network, signing, or payment. SEC Company Identity (`cap:79da211975c2`) offers an offline hire demo only.

```bash
pnpm dev:ui
# http://127.0.0.1:3000 — Discover → detail → Try offline demo
```

Docs: [`docs/day5/d5.6-marketplace-ui.md`](docs/day5/d5.6-marketplace-ui.md), [`docs/day5/d5.6-demo-runbook.md`](docs/day5/d5.6-demo-runbook.md).


Offline gate (also run in CI):

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build:catalog   # two consecutive runs must stay byte-identical
```

## Security defaults

- **NO_SIGNING** / **READ_ONLY**
- RPC host allowlist; metadata exact-URL allowlist; no Cookie/Authorization on fetches
- Catalog `services[]` keep **HTTPS** endpoints only; cleartext/`http:` claims go to diagnostics
- Do not commit `.env` secrets

## Next: Day 4

Day 4 is endpoint-probe / schema / payment-readiness work on a separate track. Re-verify advertised endpoints before any payment path. Do not treat the Day 3 catalog as selection input for hire or pay.

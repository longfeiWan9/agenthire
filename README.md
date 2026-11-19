# AgentHire

**Discover. Trust. Hire. Pay. Verify.**

Open-source AI agent marketplace. Planned stack includes ERC-8004 identity/reputation, x402 v2 payments, and AI orchestration. This repository is at **D3.1 — minimal bootstrap only**.

## D3.1 purpose

Establish a single-package TypeScript + pnpm workspace skeleton with strict typechecking, a read-only hello script, and Vitest. No marketplace, wallet, chain, or payment logic is implemented yet.

| Status | Capability |
| --- | --- |
| Implemented | Repo layout, strict TS, `pnpm` scripts, hello smoke, Vitest |
| Planned (not in D3.1) | ERC-8004, x402 v2, providers, agent orchestration, UI, wallets |

## Stack

- Node.js 26.x
- pnpm 9.x (`packageManager`: `pnpm@9.15.9`)
- TypeScript 5.9.x (pinned `5.9.3`)
- viem `2.58.0` (runtime; not exercised beyond install)
- Vitest `5.1.0` + tsx `4.23.15` (dev)
- ESM (`"type": "module"`)

Pins follow the historical smoke set (`viem@2.58.0`, `typescript@5.9.3`, `vitest@5.1.0`) after confirming those versions still exist on the registry and are not marked deprecated.

## Prerequisites

- Node.js **26.x** (see `.node-version`)
- pnpm **9.x** (Corepack or `npm i -g pnpm@9`)

## Install

```bash
pnpm install --frozen-lockfile
```

## Run

```bash
pnpm dev          # hello smoke (READ_ONLY / NO_SIGNING)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
pnpm test:watch   # vitest
```

## Security defaults

- **NO_SIGNING** / **READ_ONLY**
- No private keys, wallets, network calls, deploys, or x402 payments in D3.1
- Do not commit `.env` secrets

## Next: D3.2

D3.2 will begin real product scaffolding (config, ERC-8004 / x402 placeholders turning into code). Do not treat empty `src/erc8004`, `src/x402`, or `src/providers` directories as working features.

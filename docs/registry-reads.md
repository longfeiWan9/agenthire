# AgentHire D3.4 — Live ERC-8004 Registry Reads

Status: complete for D3.4. Mode remains **READ_ONLY / NO_SIGNING**.
Reads `ownerOf` / `tokenURI` / `getAgentWallet` only. Does **not** fetch tokenURI content, enumerate extra agents, install x402, or sign.

## 1. Purpose

Prove live Identity Registry reads for three known agents on Base Mainnet and Base Sepolia, using D3.3 `createReadOnlyClient` and the D3.2 pinned `identityRegistryAbi`, with same-block snapshots and typed `AgentIdentityEvidence` (`schemaVersion: "1.0"`).

## 2. CLI

```bash
pnpm read:agents
```

Runs `tsx src/scripts/read-agents.ts` for:

| Chain | Chain ID | Agent ID |
| --- | --- | --- |
| Base Mainnet | `8453` | `19353` |
| Base Mainnet | `8453` | `94639` |
| Base Sepolia | `84532` | `9136` |

Exit code is nonzero if **zero** successful live reads. One agent failure does not stop the others. Writes live evidence to `docs/evidence/registry-reads.json` (`source: "live-rpc"`).

## 3. Snapshot rules

1. Verify `eth_chainId` matches the configured network.
2. Pin one `blockNumber` per chain (`getBlockNumber`), then pass that explicit `blockNumber` to every `readContract`.
3. Never use silent `latest` while recording a different block in evidence.
4. Zero-address `getAgentWallet` → `agentWallet: null` with `agentWalletRaw` preserved as the zero address.
5. Nonexistent tokens → `status: "notFound"`; timeouts → `inconclusive`.
6. Secrets in errors / URI strings are redacted; tokenURI **content is not fetched**.

## 4. Live results (2026-11-19)

Command: `pnpm read:agents` (defaults). Overall: **PASS** (`successfulLiveReads: 3`).

| Chain | Agent ID | Status | Block | Owner | tokenURI (on-chain string) | agentWallet |
| --- | --- | --- | --- | --- | --- | --- |
| Base Mainnet | 19353 | success | 59445246 | `0xe9D45C3F847a7d2aE4efD7D6Da491f8a7E19b9F0` | `https://onchainagentintel.io/agent.json` | `0xB9148CD4157AD89691f86b762E9e1A166b788D45` |
| Base Mainnet | 94639 | success | 59445246 | `0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0` | `https://agent402.tools/.well-known/agent-registration.json` | `0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0` |
| Base Sepolia | 9136 | success | 60787849 | `0x8CbB17568e6d2157c8A1AEC03747908C2eF8D131` | `https://agents.quantjourney.cloud/.well-known/agent-registration.json` | `0x8CbB17568e6d2157c8A1AEC03747908C2eF8D131` |

Both Mainnet agents share snapshot block `59445246` / hash `0xe0a8c36781cd…`. Sepolia uses `60787849` / `0x619d9fb88221…`. `observedAt`: `2026-11-19T09:10:23.986Z`.

Raw JSON: `docs/evidence/registry-reads.json` (live-rpc only; no fixtures mixed in).

## 5. Modules

| Path | Role |
| --- | --- |
| `src/erc8004/registry.ts` | `readAgentIdentity` / batch + evidence builders |
| `src/scripts/read-agents.ts` | CLI + evidence file writer |
| `tests/registry.test.ts` | Offline mocks |
| `docs/evidence/registry-reads.json` | Live capture |
| Reused | `src/config/rpc.ts`, `src/config/chains.ts`, `src/erc8004/abi.ts` |

## 6. Validation

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK |
| `pnpm typecheck` | OK |
| `pnpm test` | **45 passed** (4 files) |
| `pnpm read:agents` | PASS (3/3 success) |
| `pnpm audit --registry https://registry.npmjs.org` | No known vulnerabilities |

## 7. Stop / next

Out of scope here: metadata HTTP/IPFS fetch, x402, wallets/signing/tx/deploy, UI/AI, extra agent enumeration.

Handoff: consumers can trust these three live identity snapshots and extend with metadata resolution only when a later milestone authorizes it.

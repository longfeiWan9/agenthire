# AgentHire D3.3 — Read-only Base RPC Connectivity

Status: complete for D3.3. Mode remains **READ_ONLY / NO_SIGNING**.
No wallet client, no private keys, no writes, no `ownerOf` / `tokenURI` / `getAgentWallet` calls, no agent enumeration, no x402.

## 1. Purpose

Prove that AgentHire can reach Base Mainnet (`8453`) and Base Sepolia (`84532`) through a fail-closed HTTPS PublicClient, verify `eth_chainId` against config (never trust config alone), observe a latest block (JSON-safe bigint strings), and confirm nonempty Identity Registry bytecode at the D3.2 addresses.

## 2. CLI

```bash
pnpm check:rpc
```

Runs `tsx src/scripts/check-rpc.ts` against both networks. Prints a human report plus JSON `RpcConnectivityEvidence` (`schemaVersion: "1.0"`). Exit code is nonzero if any required check is `failed` or `inconclusive`.

Optional env overrides (must still pass the HTTPS allowlist):

| Variable | Default |
| --- | --- |
| `BASE_MAINNET_RPC_URL` | `https://mainnet.base.org` |
| `BASE_SEPOLIA_RPC_URL` | `https://sepolia.base.org` |

Allowed hosts only: `mainnet.base.org`, `sepolia.base.org`. Credentials, localhost/private IPs, non-HTTPS, and arbitrary hosts are rejected (fail closed). Evidence/logs emit sanitized **origins** only.

## 3. Versions

| Item | Value |
| --- | --- |
| Working tree | `/Users/longfeiwang/Desktop/agentHire` |
| Parent (D3.2) | `3f4eac335e67aa1ebb16372e9e7658ef9d41229d` |
| Node.js (this machine) | `v26.12.1` |
| pnpm (this machine) | `9.12.2` |
| `viem` | `2.58.0` |
| Evidence schema | `1.0` |
| Transport timeout / retry | `12000ms` / `2` retries / `400ms` delay |

## 4. Endpoints and registry targets

| Network | Chain ID | CAIP-2 | Default RPC origin | Identity Registry |
| --- | --- | --- | --- | --- |
| Base Mainnet | `8453` | `eip155:8453` | `https://mainnet.base.org` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Base Sepolia | `84532` | `eip155:84532` | `https://sepolia.base.org` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |

## 5. Live evidence (2026-11-19)

Command: `pnpm check:rpc` (defaults; no env overrides). Overall: **PASS**.

| Network | Status | chainId | Latest block # | Block hash (prefix) | Block timestamp (unix) | observedAt (UTC) | Registry code |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Base Mainnet | verified | 8453 = 8453 | `59439612` | `0xe7ba52577dd8…` | `1795078298` | `2026-11-19T08:51:36.653Z` | nonempty (`130` bytes, prefix `0x60806040527f3608`) |
| Base Sepolia | verified | 84532 = 84532 | `60782155` | `0xa9960cf03034…` | `1795078299` | `2026-11-19T08:51:38.584Z` | nonempty (`130` bytes, prefix `0x60806040527f3608`) |

Bytecode length `130` is consistent with EIP-1967 proxy stubs at the official CREATE2 vanity addresses (nonempty ≠ implementation size).

## 6. Test results

Offline unit tests only (mocked readers; `fetch` spy asserts no live I/O in the evidence suite).

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK |
| `pnpm typecheck` | OK |
| `pnpm test` | **31 passed** (3 files: D3.1 hello + D3.2 ABI/chain + D3.3 RPC) |
| `pnpm check:rpc` | PASS (both chains verified) |
| `pnpm audit --registry https://registry.npmjs.org` | No known vulnerabilities |

`tests/rpc.test.ts` covers: chain match, mismatch, missing code, timeout → inconclusive, connection failure, malformed block, bigint serialization, unsafe override rejection, no credentials in output, one-network-fail-other-succeed.

## 7. Modules

| Path | Role |
| --- | --- |
| `src/config/rpc.ts` | `createReadOnlyClient`, URL allowlist, evidence builders, connectivity sequence |
| `src/scripts/check-rpc.ts` | Human CLI report + nonzero exit on fail/inconclusive |
| `tests/rpc.test.ts` | Offline mocks |
| `src/config/chains.ts` | Reused D3.2 network + registry addresses (unchanged) |

## 8. D3.4 handoff

Ready for read-only registry reads (`ownerOf` / `tokenURI` / `getAgentWallet`) on top of this transport:

1. Import `createReadOnlyClient` / `asReadOnlyRpcReader` from `src/config/rpc.ts`.
2. Import `identityRegistryAbi` from `src/erc8004/abi.ts` and network configs from `src/config/chains.ts`.
3. Call `readContract` only; treat missing tokens / zero wallets as soft failures.
4. Keep **READ_ONLY / NO_SIGNING**; do not install x402 unless authorized.
5. Prefer log-based discovery (`Registered` / `Transfer`) once enumeration is in scope.

Stop here for D3.3.

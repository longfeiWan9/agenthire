# AgentHire D3.2 — Dependency & ERC-8004 ABI Baseline

Status: complete for D3.2. Mode remains **READ_ONLY / NO_SIGNING**. No RPC client, no x402 install, no signing.

## 1. Repository and environment

| Item | Verified value |
| --- | --- |
| Working tree | `/Users/longfeiwang/Desktop/agentHire` |
| Branch | `main` |
| Parent commit (D3.1) | `c555739f2ccfec3dfd5cc823dc1390440e97391d` |
| Node.js (this machine) | `v26.12.1` |
| pnpm (this machine) | `9.12.2` |
| packageManager field | `pnpm@9.15.9` |
| Module system | ESM (`"type": "module"`, `NodeNext`) |

**Preflight (before D3.2 edits):** `pnpm install --frozen-lockfile` OK; `pnpm typecheck` OK; `pnpm test` → 3/3 passed (D3.1 hello suite). Working tree was clean.

## 2. Dependency version matrix

| Package | Role | Pinned version | Notes |
| --- | --- | --- | --- |
| `viem` | Ethereum types / chains | `2.58.0` | Unchanged from D3.1 |
| `typescript` | Typecheck | `5.9.3` | Unchanged |
| `vitest` | Unit tests | `5.1.0` | Unchanged |
| `tsx` | Dev runner | `4.23.15` | Unchanged |
| `@types/node` | Node types | `26.6.6` | Unchanged |
| `@x402/core` / `@x402/evm` / `@x402/fetch` | Payments (deferred) | **not installed** | See §7 |

No production dependency versions were changed for D3.2. New code only consumes already-pinned `viem`.

## 3. Official ERC-8004 ABI source

| Field | Value |
| --- | --- |
| Specification | https://eips.ethereum.org/EIPS/eip-8004 |
| Upstream repo | https://github.com/erc-8004/erc-8004-contracts |
| **Pinned commit** | `b9e466c250744a7e06b13dff9d3c2844ed64f825` |
| Upstream ABI path | `abis/IdentityRegistry.json` |
| Retrieval | GitHub Contents API (`Accept: application/vnd.github.raw`), 2026-11-19 |
| Git blob SHA | `ea5ccdf359405a24b9540bb67e22f3583fe67267` (matches tree entry) |

**Verification label:** official-source (commit + path confirmed via GitHub git tree at the pinned SHA).

## 4. Local ABI artifact and checksum

| Field | Value |
| --- | --- |
| Local path | `src/erc8004/artifacts/identity-registry.abi.json` |
| Byte length | `19561` |
| **SHA-256** | `cdb8e30f41a56ed53421126dab87551ff2a178b8463646f69f75bc5dc9620564` |
| Typed export | `identityRegistryAbi` in `src/erc8004/abi.ts` |
| Provenance constant | `IDENTITY_REGISTRY_ABI_PROVENANCE` |

The local file is the full upstream JSON (not a truncated fragment). Offline tests re-hash the artifact and assert the recorded digest.

**Verification label:** offline-test + official-source.

## 5. Confirmed read-only functions and events

Confirmed on the pinned ABI artifact (offline inspection / unit tests). Live on-chain execution is **not** verified in D3.2.

| Method | Signature | Mutability | Status |
| --- | --- | --- | --- |
| `ownerOf` | `(uint256 tokenId) → address` | `view` | Present |
| `tokenURI` | `(uint256 tokenId) → string` | `view` | Present |
| `getAgentWallet` | `(uint256 agentId) → address` | `view` | Present |

`getAgentWallet` is supported by this ABI. Upstream docs note the reserved `agentWallet` metadata key may be unset / zero after transfer until re-verified — treat zero-address observations as “no verified wallet,” and **do not** assume it is the x402 payment recipient.

**Discovery-relevant events** (ABI-present; useful for D3.3+ log indexing):

- `Registered(uint256 indexed agentId, string agentURI, address indexed owner)`
- `URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)`
- `Transfer(address indexed from, address indexed to, uint256 indexed tokenId)`
- `MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)`
- Also: `Approval`, `ApprovalForAll`, `BatchMetadataUpdate`, `MetadataUpdate`, `OwnershipTransferred`, `Initialized`, `Upgraded`, `EIP712DomainChanged`

**Verification label:** offline-test for ABI membership; **live-RPC-required** for ownership / URI / wallet values.

## 6. Base network and registry configuration

Module: `src/config/chains.ts` (viem `base` / `baseSepolia`).

| Network | Chain ID | CAIP-2 | Identity Registry | Purposes |
| --- | --- | --- | --- | --- |
| Base Mainnet | `8453` | `eip155:8453` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | wallet activity (RO), ERC-8004 discovery |
| Base Sepolia | `84532` | `eip155:84532` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | ERC-8004 discovery, future x402 |

Addresses match official docs at the pinned contracts commit:

- `README.md` — Base Mainnet / Base Sepolia IdentityRegistry listings
- `scripts/addresses.ts` — `MAINNET_ADDRESSES.identityRegistry` / `TESTNET_ADDRESSES.identityRegistry`

No private RPC URLs or credentials are stored.

**Verification label:** official-source for addresses; offline-test for chain IDs / non-swap; **live-RPC-required** for bytecode / contract presence.

## 7. x402 version comparison (install deferred)

Checked npm registry metadata only — packages were **not** installed.

| Package | Prior smoke | Newer reviewed | Latest available (2026-11-19) |
| --- | --- | --- | --- |
| `@x402/core` | `2.28.0` | `2.31.0` | `2.31.0` |
| `@x402/evm` | `2.28.0` | `2.31.0` | `2.31.0` |
| `@x402/fetch` | `2.28.0` | `2.31.0` | `2.31.0` |

Notable dependency shift:

| Version | `@x402/core` deps | `@x402/evm` deps |
| --- | --- | --- |
| `2.28.0` | `zod@^3.24.2` | `zod@^3.24.2`, `viem@^2.48.11`, `@x402/core@~2.28.0` |
| `2.31.0` | `zod@^4.6.6` | `zod@^4.6.6`, `viem@^2.48.11`, `@x402/core@~2.31.0` |

**Decision for later integration:** prefer testing the **`2.31.0`** set (current latest) with a deliberate Zod v4 audit, because `2.28.0` is already behind and Zod major differs. Do **not** install during D3.2. AgentHire’s current `viem@2.58.0` satisfies `@x402/evm`’s `viem@^2.48.11` range on paper; confirm at install time.

## 8. Typecheck, test, and audit results

Commands run after D3.2 implementation:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK (lockfile unchanged) |
| `pnpm typecheck` | OK |
| `pnpm test` | **13 passed** (2 files: 3 D3.1 hello + 10 ABI/chain) |
| `pnpm audit` (default registry `npmmirror`) | Endpoint missing (`ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS`) |
| `pnpm audit --registry https://registry.npmjs.org` | **No known vulnerabilities found** |

Prior advisories (`GHSA-mrhx-c7xc-m3w5` Zod, `GHSA-fc5q-39xc-vjpf` picomatch) are **not present** in the current minimal dependency graph. They may reappear when x402 / Next.js are added.

## 9. Known issues and unresolved assumptions

1. **No live RPC yet** — bytecode, `ownerOf` / `tokenURI` / `getAgentWallet` call success, and agent population are unverified on-chain.
2. **`getAgentWallet` vs payments** — ABI support ≠ payment recipient. x402 recipient comes from payment flow metadata, not this field by default.
3. **Audit mirror** — default pnpm registry (`https://registry.npmmirror.com`) lacks the audit API; use `registry.npmjs.org` for audits until the environment registry changes.
4. **Node/pnpm patch skew** — local runtime is Node `26.12.1` / pnpm `9.12.2` while package metadata targets `>=26` / `pnpm@9.15.9`. Not a D3.2 blocker.
5. **No GitHub remote** — repository remains local-only (per D3.1 handoff); D3.2 does not push.

## 10. D3.3 handoff

Ready for D3.3 read-only RPC integration:

1. Import `identityRegistryAbi` and `IDENTITY_REGISTRY_ABI_PROVENANCE` from `src/erc8004/abi.ts`.
2. Import `baseMainnetNetwork` / `baseSepoliaNetwork` (or `agentHireNetworksByChainId`) from `src/config/chains.ts`.
3. Create a **public** viem client with an explicit RPC URL from env (no secrets in repo).
4. Implement read helpers for `ownerOf`, `tokenURI`, `getAgentWallet` only; treat missing tokens / zero wallet as soft failures.
5. Keep **READ_ONLY / NO_SIGNING**; do not install x402 yet unless a later step authorizes it.
6. Prefer log-based discovery via `Registered` / `Transfer` once transport exists.

Stop here for D3.2.

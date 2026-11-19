# AgentHire Day 3 — Read-Only Spike

**Status:** D3.7 consolidation complete  
**Mode:** `READ_ONLY / NO_SIGNING`  
**Working tree:** `/Users/longfeiwang/Desktop/agentHire`  
**Parent (D3.6):** `c255f2a95e7224c677b87e77d04b17d195da9779`

This document consolidates D3.1–D3.6 evidence. Historical live observations are **not** refreshed in D3.7. Catalog builds are offline on committed evidence files.

---

## 4.1 Executive summary

Day 3 established a fail-closed, read-only foundation for ERC-8004 identity discovery on Base Mainnet and Base Sepolia, plus offline normalization into `ProviderRecord@1.0` / `VerificationEvidence@1.0`.

| Class | What Day 3 actually delivered |
| --- | --- |
| **Implemented features** | TS/pnpm repo; pinned Identity Registry ABI; read-only viem RPC clients; registry `ownerOf`/`tokenURI`/`getAgentWallet`; allowlisted HTTPS metadata resolver; offline provider catalog + verification builder; cross-artifact integrity checks |
| **Live observations (historical)** | D3.3 RPC connectivity; D3.4 three-agent registry snapshots; D3.5 three approved metadata fetches — captured once, not re-run in D3.7 |
| **Offline tests** | Unit/mocks for ABI, chains, RPC, registry, metadata SSRF/HTTPS, provider normalization, catalog determinism/integrity |
| **Unverified claims** | Advertised services, endpoints, x402 support, task types — preserved as claims with `notChecked` |
| **Future work** | Endpoint probes, task schema checks, live x402 challenges, payment policy, settlement, wallet-activity-summary execution, AgentHire fallback provider |

Day-3 upper-bound milestone: **`metadataValidated`**. That does **not** mean a provider can serve `wallet-activity-summary@1.0` or accept approved payments.

---

## 4.2 Architecture

```text
Base Mainnet (8453) / Base Sepolia (84532)
        │
        ▼
ERC-8004 Identity Registry (pinned ABI + configured addresses)
        │  read-only viem PublicClient (D3.3)
        ▼
Identity evidence  (ownerOf / tokenURI / getAgentWallet)  → docs/evidence/registry-reads.json
        │
        ▼
Approved tokenURI (exact allowlist match)
        │  secure HTTPS GET (D3.5; no redirects; DNS/IP pin)
        ▼
Registration metadata evidence  → docs/evidence/registration-metadata.json
        │
        ▼
Offline catalog builder (D3.6/D3.7) — no RPC / no HTTP
        │
        ├─► ProviderRecord@1.0          → docs/evidence/provider-catalog.json
        └─► VerificationEvidence@1.0    → docs/evidence/provider-verification.json
```

The catalog builder joins **captured** evidence only. `snapshotAsOf` is derived from input `capturedAt`/`observedAt` maxima, never wall-clock build time.

---

## 4.3 Environment and dependencies

| Item | Value |
| --- | --- |
| Node.js (this machine) | `v26.12.1` |
| pnpm (this machine) | `9.12.2` |
| `packageManager` field | `pnpm@9.15.9` (**mismatch** with local pnpm; lockfile still honored via frozen install) |
| TypeScript | `5.9.3` |
| viem | `2.58.0` |
| Vitest | `5.1.0` |
| tsx | `4.23.15` |
| @types/node | `26.6.6` |
| Module system | ESM (`"type": "module"`, NodeNext) |
| D3.6 parent commit | `c255f2a95e7224c677b87e77d04b17d195da9779` |
| ABI upstream | `erc-8004/erc-8004-contracts` @ `b9e466c250744a7e06b13dff9d3c2844ed64f825` |
| Local ABI path | `src/erc8004/artifacts/identity-registry.abi.json` |
| ABI SHA-256 (recomputed) | `cdb8e30f41a56ed53421126dab87551ff2a178b8463646f69f75bc5dc9620564` |
| npm audit (npmjs registry) | No known vulnerabilities (Day 3 minimal graph) |

**Not installed:** x402 packages, Next.js/React/wagmi, wallets, Foundry/Solidity toolchains.

---

## 4.4 Blockchain networks

| Network | Chain ID | CAIP-2 | Identity Registry | Default RPC origin |
| --- | --- | --- | --- | --- |
| Base Mainnet | `8453` | `eip155:8453` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `https://mainnet.base.org` |
| Base Sepolia | `84532` | `eip155:84532` | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | `https://sepolia.base.org` |

### Historical D3.3 connectivity (not refreshed)

| Network | Status | Latest block # | Block hash (prefix) | Block timestamp | observedAt |
| --- | --- | --- | --- | --- | --- |
| Base Mainnet | verified | `59439612` | `0xe7ba52577dd8…` | `1795078298` | `2026-11-19T08:51:36.653Z` |
| Base Sepolia | verified | `60782155` | `0xa9960cf03034…` | `1795078299` | `2026-11-19T08:51:38.584Z` |

Registry bytecode nonempty (`130` bytes) at both official CREATE2 vanity addresses.

### Historical D3.4 identity snapshot blocks (not refreshed)

| Network | Block number | Block hash |
| --- | --- | --- |
| Base Mainnet | `59445246` | `0xe0a8c36781cd8812dcfce171a63c3d151b01cdf1279fe5331c9376b40a9490dd` |
| Base Sepolia | `60787849` | `0x619d9fb8822176605c2bc390c2c1920343ad02fbf2e245c5a392935862d1d28a` |

---

## 4.5 ERC-8004 agent results

Source: `docs/evidence/registry-reads.json` (`capturedAt`: `2026-11-19T09:10:23.986Z`, `source: live-rpc`). Historical ≠ fresh live.

| providerId | Chain | Agent ID | Owner | agentWallet | tokenURI | Block | Methods | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/19353` | 8453 | 19353 | `0xe9D45C3F847a7d2aE4efD7D6Da491f8a7E19b9F0` | `0xB9148CD4157AD89691f86b762E9e1A166b788D45` | `https://onchainagentintel.io/agent.json` | 59445246 | ownerOf / tokenURI / getAgentWallet | success |
| `eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/94639` | 8453 | 94639 | `0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0` | `0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0` | `https://agent402.tools/.well-known/agent-registration.json` | 59445246 | same | success |
| `eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136` | 84532 | 9136 | `0x8CbB17568e6d2157c8A1AEC03747908C2eF8D131` | `0x8CbB17568e6d2157c8A1AEC03747908C2eF8D131` | `https://agents.quantjourney.cloud/.well-known/agent-registration.json` | 60787849 | same | success |

**Limitations:** three targeted agents only; no log-based enumeration; agentWallet ≠ payment recipient; registry identity does not prove metadata reachability or service operation.

---

## 4.6 Registration metadata results

Source: `docs/evidence/registration-metadata.json` (`capturedAt`: `2026-11-19T09:45:48.912Z`, `source: live-https-allowlisted`). Metadata was fetched **~35 minutes after** the registry snapshot — URIs may have changed on-chain since then; Day 3 treats the pair as joined historical evidence, not a same-block atomic view.

| Agent | Approved URL | HTTP | Bytes | SHA-256 | Name | Services | x402 claim | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 19353 | `https://onchainagentintel.io/agent.json` | 200 | 47643 | `a277e4c0…699c63` | Agent Zero | 20 | true | success |
| 94639 | `https://agent402.tools/.well-known/agent-registration.json` | 200 | 885 | `2eb8bc1b…2cf3fa` | Agent402 | 5 | true | success |
| 9136 | `https://agents.quantjourney.cloud/.well-known/agent-registration.json` | 200 | 983 | `121502d6…15836a` | QuantJourney Research Agent Fabric | 4 | false | success |

**Security controls used for fetches:** exact URL allowlist; TLS `rejectUnauthorized: true`; zero redirects; DNS resolve → public-IP filter → connection-time IP pin with SNI/`Host`; 10s timeout; 256 KiB body limit; concurrency 2; no cookies/Authorization. Service endpoints were **never** contacted.

---

## 4.7 Provider catalog

Offline rebuild from D3.4 + D3.5 evidence (`pnpm build:catalog`).

| Field | Value |
| --- | --- |
| `snapshotAsOf` | `2026-11-19T09:45:48.912Z` (max input evidence time) |
| Provider count | 3 |
| Evidence count | 6 (`registryRead` ×3 + `metadataFetch` ×3) |
| Verification count | 3 (provider-level) |
| Max milestone | `metadataValidated` (all three) |
| Incomplete service claims | none in committed diagnostics |
| `observedOffers` | empty for all |
| Compatibility fields | all `notChecked` |

| providerId | Name | Services | x402Advertised | fetchStatus | Milestone |
| --- | --- | --- | --- | --- | --- |
| `…/19353` | Agent Zero | 20 | true | success | metadataValidated |
| `…/94639` | Agent402 | 5 | true | success | metadataValidated |
| `…/9136` | QuantJourney Research Agent Fabric | 4 | false | success | metadataValidated |

Normalized services use `method: OTHER`, empty `claimedTaskTypes`, and `endpointStatus`/`requestSchemaStatus: notChecked`. **`metadataValidated` ≠ verified service availability.**

---

## 4.8 Security boundaries

- Default mode: **READ_ONLY / NO_SIGNING**
- RPC: HTTPS allowlist (`mainnet.base.org`, `sepolia.base.org`); chainId verified against response; sanitized origins in evidence
- Metadata HTTPS: exact allowlist; TLS verify on; no redirects; DNS/IP SSRF filters; connection pinning
- No endpoint reachability probes; no wallets; no signing; no transactions; no deployments
- No x402 payment attempts; no inferred payment compatibility from identity chain or agentWallet
- Catalog build: offline only
- Deferred local Git TLS quirk (if any) is **separate** from metadata HTTPS policy and was not used to weaken fetches

---

## 4.9 Reproduction guide

Offline Day-3 closeout commands (run these):

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build:catalog   # offline; deterministic from committed evidence
pnpm audit --registry https://registry.npmjs.org
```

`pnpm build:catalog` reads `docs/evidence/registry-reads.json` + `registration-metadata.json` only. It does **not** call RPC or HTTPS. Two consecutive runs must produce byte-identical catalog/verification JSON (same SHA-256).

### Optional future live revalidation (do **not** run in D3.7)

| Command | Purpose |
| --- | --- |
| `pnpm check:rpc` | Refresh Base Mainnet/Sepolia connectivity evidence |
| `pnpm read:agents` | Refresh registry identity snapshots |
| `pnpm read:metadata` | Refresh allowlisted registration documents |

Live revalidation requires network egress and produces new timestamps/hashes; it is out of D3.7 scope.

---

## 4.10 Known limitations

1. Only three hand-picked agents — no broad registry indexing.
2. Registration metadata is self-reported and untrusted.
3. No task-schema compatibility for `wallet-activity-summary@1.0`.
4. No live x402 HTTP 402 offers; `observedOffers` empty.
5. No settlement or paid-delivery evidence.
6. Registry and metadata captures are not same-block atomic; historical staleness applies.
7. `pnpm audit` covers the minimal Day 3 graph only — not future x402/frontend deps.
8. Deferred Git TLS configuration (if present on a machine) is unrelated to metadata fetch TLS.
9. Implementation gaps for Day 4+: endpoint probes, challenge verification, payment policy, fallback provider, wallet-activity execution.
10. Local `packageManager` field (`9.15.9`) vs machine pnpm (`9.12.2`) mismatch — frozen lockfile still required.

---

## 4.11 Day 4 handoff

**Reusable as-is**

- Pinned ABI + chain config + read-only RPC transport
- Secure allowlisted metadata resolver
- Canonical provider IDs and `ProviderRecord@1.0` / verification evidence types
- Offline catalog builder + integrity checks
- Committed historical evidence as fixtures for regression

**Must be independently verified before any real payment**

- Fresh registry identity and registration metadata (or explicit acceptance of staleness risk)
- Endpoint reachability for the intended service
- Request/response schema compatibility for `wallet-activity-summary@1.0`
- Live x402 v2 challenge: `exact`, Base Sepolia (`eip155:84532`), approved test USDC, amount, payTo
- Explicit human/delegated authorization; independent settlement; delivered response validation
- Credentials/signatures never logged in evidence

Stop at Day 3. No payment execution is authorized by this spike.

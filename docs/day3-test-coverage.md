# AgentHire Day 3 — Test Coverage

**Mode:** offline unit/mocks only (D3.7)  
**Suite result:** **83 passed** / 0 failed / 6 files  
**Follow-up A** adds focused high-risk provider/catalog tests and a zero-address wallet fix.

## Coverage matrix

| Area | Risk | Coverage | Primary tests | Gaps / notes |
| --- | --- | --- | --- | --- |
| Hello / READ_ONLY banner | Low | Covered | `tests/hello.test.ts` (3) | — |
| ABI load + required views | High | Covered | `tests/erc8004-abi.test.ts` | Live ABI execution not in unit tests (by design) |
| ABI SHA-256 provenance | High | Covered | `erc8004-abi` provenance | Relies on committed artifact bytes |
| Chain IDs / registry addresses | High | Covered | `erc8004-abi` Base network | Wrong-address on-chain would need live read |
| RPC URL allowlist / SSRF | High | Covered | `tests/rpc.test.ts` | Live RPC intentionally excluded from unit suite |
| ChainId match / mismatch | High | Covered | `rpc.test.ts` | — |
| Registry bytecode empty | Medium | Covered | `rpc.test.ts` | — |
| Timeout / connection fail | Medium | Covered | `rpc.test.ts` | — |
| Evidence credential scrubbing (RPC) | High | Covered | `rpc.test.ts` | — |
| Zero-address agentWallet (registry) | High | Covered | `tests/registry.test.ts` | — |
| Same-block registry snapshot | High | Covered | `registry.test.ts` | — |
| notFound / partial batch continue | Medium | Covered | `registry.test.ts` | — |
| Metadata exact allowlist | High | Covered | `tests/metadata.test.ts` | Only three URLs approved |
| DNS/IP SSRF filters | High | Covered | `metadata.test.ts` | — |
| Connection-time IP pin | High | Covered | `metadata.test.ts` (mocked) | — |
| Redirect refusal / TLS fail / size limit | High | Covered | `metadata.test.ts` | — |
| Registration JSON schema validation | High | Covered | `metadata.test.ts` | Full EIP-8004 edge corpus not exhaustive |
| Provider ID / checksum / decimal agentId | High | Covered | `tests/providers.test.ts` | — |
| Zero-address wallet in catalog normalize | High | **Added D3.7** | `providers.test.ts` identity field normalization | Smallest fix in `normalize.ts` |
| Incomplete/duplicate/non-http services | High | **Added/extended D3.7** | service + incomplete claims | Keyword→task inference still absent (correct) |
| x402Advertised mapping / empty offers | High | Covered | payment mapping | No live 402 |
| Join by full identity + provenance | High | Covered | join tests | — |
| Evidence kinds / milestone bound | High | Covered | verification + integrity | Higher milestones blocked |
| `snapshotAsOf` derivation | High | **Added D3.7** | derive + fail-closed | Replaces fake wall-clock `generatedAt` |
| Catalog byte determinism | High | Covered | two-build identical JSON | — |
| Cross-artifact integrity | High | **Added D3.7** | drift + committed rebuild | Integrity also enforced in builder |
| Committed evidence offline rebuild | High | **Added D3.7** | loads `docs/evidence/*.json` | Does not refresh live data |

## Counts by file

| File | Tests |
| --- | --- |
| `tests/hello.test.ts` | 3 |
| `tests/erc8004-abi.test.ts` | 10 |
| `tests/rpc.test.ts` | 18 |
| `tests/registry.test.ts` | 14 |
| `tests/metadata.test.ts` | 23 |
| `tests/providers.test.ts` | 15 |
| **Total** | **83** |

D3.6 baseline was **76** providers/offline tests across the suite; D3.7 adds **+7** focused provider/catalog tests (identity rejection, snapshot derivation/fail-closed, integrity drift, committed rebuild, zero-address normalize, incomplete services).

## Smallest fixes shipped with Follow-up A/B

1. **Zero-address `agentWallet` → `null`** in `src/providers/normalize.ts` (MVP §7.1); do not substitute owner.
2. **`generatedAt` → `snapshotAsOf`** derived from evidence timestamps (Follow-up B).
3. **`checkCrossArtifactIntegrity`** runs during catalog build; fail closed on drift.

## Explicitly out of unit-test scope (Day 3)

- Live `pnpm check:rpc` / `read:agents` / `read:metadata` (optional future revalidation)
- Endpoint reachability, x402 challenge, payment policy, settlement
- Wallet-activity-summary request/response acceptance fixtures (B6 inventory remains proposed, not executed)

## How to re-run

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

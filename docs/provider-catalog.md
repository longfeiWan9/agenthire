# AgentHire D3.6 — Provider Catalog

Offline normalization of D3.4 registry reads + D3.5 registration metadata
into canonical `ProviderRecord@1.0` / `VerificationEvidence@1.0`.
Mode: **READ_ONLY / NO_SIGNING**. No RPC/HTTP during catalog build.

## Catalog

Generated: `2026-11-19T10:00:00.000Z`

| providerId | chain | agentId | name | services | x402Advertised | fetchStatus | milestone |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/19353` | 8453 | 19353 | Agent Zero | 20 | true | success | metadataValidated |
| `eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/94639` | 8453 | 94639 | Agent402 | 5 | true | success | metadataValidated |
| `eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136` | 84532 | 9136 | QuantJourney Research Agent Fabric | 4 | false | success | metadataValidated |

## Artifacts

| File | SHA-256 |
| --- | --- |
| `docs/evidence/provider-catalog.json` | `aa521b24cfb1ed4e16a78dd06376811173e15095a4e99545dd1ef8ffc6cc419b` |
| `docs/evidence/provider-verification.json` | `e4e845a35a0d86698fbfa2983886bd051355e3e675474c2ee1bb2a07a9a750f9` |

## Notes

- Services are claims only (`endpointStatus` / `requestSchemaStatus`: `notChecked`).
- `observedOffers` is empty; payment compatibility remains `notChecked`.
- Day 3 upper bound milestone: `metadataValidated`.
- `operatorEvidenceIds` empty; origin is `external` for all three providers.


# AgentHire D3.6/D3.7 — Provider Catalog

Offline normalization of D3.4 registry reads + D3.5 registration metadata
into canonical `ProviderRecord@1.0` / `VerificationEvidence@1.0`.
Mode: **READ_ONLY / NO_SIGNING**. No RPC/HTTP during catalog build.

## Catalog

snapshotAsOf (derived from input evidence): `2026-11-19T09:45:48.912Z`

| providerId | chain | agentId | name | services | x402Advertised | fetchStatus | milestone |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/19353` | 8453 | 19353 | Agent Zero | 20 | true | success | metadataValidated |
| `eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/94639` | 8453 | 94639 | Agent402 | 5 | true | success | metadataValidated |
| `eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136` | 84532 | 9136 | QuantJourney Research Agent Fabric | 4 | false | success | metadataValidated |

## Artifacts

| File | SHA-256 |
| --- | --- |
| `docs/evidence/provider-catalog.json` | `cf008b774450c568638034c32be7e5c2815c6f648fd95cc3ef6b4a55058a337d` |
| `docs/evidence/provider-verification.json` | `2ab11012a4cd33491ef9d164ab1490ad0ea3e582137b49f3f76d2e56ec69df7d` |

## Notes

- `snapshotAsOf` is the max input `capturedAt`/`observedAt`, not wall-clock build time.
- Services are claims only (`endpointStatus` / `requestSchemaStatus`: `notChecked`).
- `observedOffers` is empty; payment compatibility remains `notChecked`.
- Day 3 upper bound milestone: `metadataValidated`.
- `operatorEvidenceIds` empty; origin is `external` for all three providers.


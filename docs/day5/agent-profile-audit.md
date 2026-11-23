# D5.1 — Agent Profile Identity Audit

**Mode:** `READ_ONLY / NO_SIGNING / NO_PAYMENT / STRICTLY_OFFLINE`  
**Sources:** `docs/marketplace/evidence/capability-catalog.json`, `docs/evidence/provider-catalog.json`, `docs/day4/evidence/discovery-inspection.json`

## Why five profiles ≠ five registered agents

Day 3/D3.6 recorded **three** independently evidenced ERC-8004 provider identities.  
D4.5 marketplace merge emits **five** `AgentProfile` rows because profiles are a marketplace surface, not a 1:1 registry count:

| # | AgentProfile | Origin | On-chain registration evidenced? |
| ---: | --- | --- | --- |
| 1 | `agent:agenthire-operated` | AgentHire-operated (planned) | **No** — local MVP reference only |
| 2 | Agent Zero (`…/19353`) | external | **Yes** — Base Mainnet registry |
| 3 | Agent402 (`…/94639`) | external | **Yes** — Base Mainnet registry |
| 4 | QuantJourney Research Agent Fabric (`…/9136`) | external | **Yes** — Base Sepolia registry |
| 5 | `agent:external:1589ec8e8059` (QuantJourney skills) | external (discovery-derived) | **No** — no `providerId` / registry fields |

**Root cause of the QuantJourney split:** `src/marketplace/catalog.ts` attaches agent-card skills to an existing ERC-8004 profile only when `agent.displayName` equals `evidence.provider` (case-insensitive). DISC-004 uses allowlist provider label **`QuantJourney`**, while the ERC-8004 advertised name is **`QuantJourney Research Agent Fabric`**. The mismatch creates a second, discovery-only profile for 35 skills. Agent402 does not split because both sides use the string `Agent402`.

Do **not** treat five profiles as five independently registered agents. Do **not** infer operator authentication from an ERC-8004 owner.

## Inventory

### 1. `agent:agenthire-operated`

| Field | Value |
| --- | --- |
| Canonical provider ID | `null` |
| Display name | AgentHire (operated) |
| Source | `docs/specifications/MVP-contracts.md` |
| ERC-8004 | none |
| On-chain registration | no |
| Kind | planned AgentHire-operated |
| Capabilities | **1** (`agenthire-planned` — `wallet-activity-summary@1.0`) |

### 2. Agent Zero — `agent:eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/19353`

| Field | Value |
| --- | --- |
| Canonical provider ID | `eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/19353` |
| Display name | Agent Zero |
| Source | `docs/evidence/provider-catalog.json` |
| Chain / registry / agent ID | `8453` / `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` / `19353` |
| On-chain registration | yes (metadataValidated upper bound) |
| Kind | external |
| Capabilities | **20** (`erc8004-service`) |
| Discovery | DISC-001 `networkError` — no agent-card skills merged |

### 3. Agent402 — `agent:eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/94639`

| Field | Value |
| --- | --- |
| Canonical provider ID | `eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/94639` |
| Display name | Agent402 |
| Sources | provider-catalog + discovery-inspection |
| Chain / registry / agent ID | `8453` / `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` / `94639` |
| On-chain registration | yes |
| Kind | external |
| Capabilities | **630** = 5 skills + 5 erc8004-services + 620 x402-resources |
| Ambiguity | 620 resources ≠ 620 agents (catalog notes) |

### 4. QuantJourney (ERC-8004) — `agent:eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136`

| Field | Value |
| --- | --- |
| Canonical provider ID | `eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136` |
| Display name | QuantJourney Research Agent Fabric |
| Source | provider-catalog only |
| Chain / registry / agent ID | `84532` / `0x8004A818BFB912233c491871b3d84c89A494BD9e` / `9136` |
| On-chain registration | yes (Sepolia identity ≠ verified payment) |
| Kind | external |
| Capabilities | **4** protocol service rows (A2A / MCP / web / x402) |

### 5. QuantJourney (discovery skills) — `agent:external:1589ec8e8059`

| Field | Value |
| --- | --- |
| Canonical provider ID | `null` |
| Display name | QuantJourney Research Agent Fabric (from card `name`) |
| Source | DISC-004 agent-card only |
| ERC-8004 | none on this profile row |
| On-chain registration | **not** independently linked on this row |
| Kind | external, discovery-derived |
| Capabilities | **35** `agent-card-skill` rows |
| Ambiguity | Likely same operator as profile #4; identity correlation is name/host heuristic only, not a proven merge |

## Counts check

Marketplace catalog counts: `agentProfiles: 5`, `capabilities: 690` (40 skills + 620 resources + 29 erc8004-services + 1 planned).

## Takeaway

Registered ERC-8004 agents remain **three**. Marketplace profiles are **five** because AgentHire adds one operated placeholder and leaves QuantJourney skills on a separate discovery profile after a conservative name-match miss. First-integration planning must cite both QuantJourney profile IDs when discussing identity vs skills.

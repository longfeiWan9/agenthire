# Capability Taxonomy — Curated Categories + Other

**Mode:** `STRICTLY_OFFLINE` · D4.5

## Curated categories

| ID | Name | Intent |
| --- | --- | --- |
| `research-intelligence` | Research & Intelligence | Research, diligence, filings, intel search |
| `data-analytics` | Data & Analytics | Analytics, on-chain/market data, wallet summary |
| `content-documents` | Content & Documents | PDF/HTML/render/document transforms |
| `developer-tools` | Developer Tools | OpenAPI/MCP/A2A/utilities/tooling |
| `other` | Other | Fallback — always listable |

## Rules

1. **Multi-category OK** — a capability may appear on several shelves.
2. **Preserve original labels** — upstream skill ids, tags, service ids, resource categories are retained on each row.
3. **Never discard unknown** methods/capabilities — unclassified → `other`.
4. **Hostname TLDs do not classify** — `.tools` in `agent402.tools` must not force `developer-tools`.
5. **B1/B2** maps to `data-analytics` as a planned AgentHire-operated row.

## Source → category mapping (conservative)

| Upstream | Marketplace mapping |
| --- | --- |
| Resource `research` | `research-intelligence` |
| Resource `walletAnalytics` / `blockchainData` / `marketData` / `defi` | `data-analytics` |
| Resource `content` | `content-documents` |
| Resource `developerInfrastructure` / `aiInference` / `agentDiscovery` / `payments` | `developer-tools` |
| Resource `other` / `unknown` | `other` (until path keywords add curated hits) |
| Agent-card skill tags / descriptions | Keyword rules above |
| ERC-8004 service descriptions | Keyword rules above |

Classification is offline and deterministic (`src/marketplace/classify.ts`).

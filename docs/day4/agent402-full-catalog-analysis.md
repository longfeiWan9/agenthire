# AgentHire D4.4b — Full Agent402 Resource-Catalog Analysis

Mode: **READ_ONLY / NO_SIGNING / NO_PAYMENT / ONE_APPROVED_DISCOVERY_GET_ONLY**
Request: `CATALOG-001` · MVP task: `wallet-activity-summary@1.0`
Coverage: **complete** · advertised 620 · retained 620
Prior D4.3c SHA match: **false**

## A. Summary

CATALOG-001 recovered **620** safely normalized Agent402 advertised resources (coverage **complete**). Raw body SHA-256 `b6fb9c90a96a…` vs D4.3c `57182ef89b91…` → match=false.

Shortlist size: **3** (max 3). All candidates `approvedForNetworkExecution: false`. No B4 upgrades. Resources were **not** fetched.

## B. Recovery summary (§6)

| Field | Value |
| --- | --- |
| sourceUrl | `https://agent402.tools/.well-known/x402` |
| httpStatus | 200 |
| observedAt | 2026-11-20T09:05:44.412Z |
| rawResponseBytes | 59203 |
| rawResponseSha256 | `b6fb9c90a96ac7f72eb1f5e17c03712f19660ebf120e0d61ed14e473e271c48d` |
| advertisedResourceCount | 620 |
| parsedResourceCount | 620 |
| normalizedResourceCount | 620 |
| safelyRetainedResourceCount | 620 |
| omittedResourceCount | 0 |
| parseFailureCount | 0 |
| coverage | complete |
| matchesPreviousResponseHash | false |
| attemptMarkerPath | `docs/day4/evidence/catalog-001-live-attempt.marker` |
| rawBodyCommitted | false |

## C. Classification

| Category | Count |
| --- | ---: |
| blockchainData | 14 |
| defi | 5 |
| marketData | 10 |
| research | 13 |
| aiInference | 4 |
| developerInfrastructure | 45 |
| payments | 8 |
| content | 34 |
| other | 490 |

| TaskRelevance | Count |
| --- | ---: |
| explicitMatch | 0 |
| adaptableCandidate | 0 |
| potentiallyRelated | 15 |
| unrelated | 605 |
| unknown | 0 |

| Payment assessment | Count |
| --- | ---: |
| claimsPolicyMatch | 0 |
| claimsPolicyMismatch | 0 |
| insufficientInformation | 620 |

## D. Families

| Family | Count |
| --- | ---: |
| `/api/a2a-card-fetch` | 1 |
| `/api/a2a-card-validate` | 1 |
| `/api/action-gate` | 1 |
| `/api/add-time` | 1 |
| `/api/address-label` | 1 |
| `/api/age` | 1 |
| `/api/amortization` | 1 |
| `/api/annuity` | 1 |
| `/api/answer` | 1 |
| `/api/aqi-calc` | 1 |
| `/api/archive-snapshot` | 1 |
| `/api/asn-info` | 1 |
| `/api/asset-transfers` | 1 |
| `/api/attest` | 1 |
| `/api/audio-convert` | 1 |
| `/api/audio-normalize` | 1 |
| `/api/b20-activation-check` | 1 |
| `/api/b20-feature-id` | 1 |
| `/api/b20-memos` | 1 |
| `/api/b20-new-tokens` | 1 |
| `/api/b20-token-info` | 1 |
| `/api/b20-verify` | 1 |
| `/api/barcode-decode` | 1 |
| `/api/barcode-lookup` | 1 |
| `/api/base-convert` | 1 |
| `/api/base32` | 1 |
| `/api/base58` | 1 |
| `/api/base64` | 1 |
| `/api/bestsellers` | 1 |
| `/api/black-scholes` | 1 |
| `/api/block-info` | 1 |
| `/api/block-number` | 1 |
| `/api/block-receipts` | 1 |
| `/api/bond-price` | 1 |
| `/api/bond-ytm` | 1 |
| `/api/break-even` | 1 |
| `/api/brotli-compress` | 1 |
| `/api/brotli-decompress` | 1 |
| `/api/business-days` | 1 |
| `/api/cagr` | 1 |
| `/api/calc` | 1 |
| `/api/calldata-decode` | 1 |
| `/api/captcha-generate` | 1 |
| `/api/captcha-verify` | 1 |
| `/api/card-validate` | 1 |
| `/api/case` | 1 |
| `/api/cert-transparency` | 1 |
| `/api/chain` | 5 |
| `/api/chain-board` | 1 |
| `/api/chain-info` | 1 |
| `/api/checksum` | 1 |
| `/api/cidr` | 1 |
| `/api/code-run` | 1 |
| `/api/code-run-pro` | 1 |
| `/api/coin-categories` | 1 |
| `/api/coin-history` | 1 |
| `/api/coin-market-chart-range` | 1 |
| `/api/coin-ohlc` | 1 |
| `/api/coin-price-by-contract` | 1 |
| `/api/coin-profile` | 1 |
| `/api/coin-search` | 1 |
| `/api/coins-list` | 1 |
| `/api/college-lookup` | 1 |
| `/api/color` | 1 |
| `/api/company-financials` | 1 |
| `/api/compound-interest` | 1 |
| `/api/compress-compare` | 1 |
| `/api/contract-abi` | 1 |
| `/api/contract-code` | 1 |
| `/api/contract-source` | 1 |
| `/api/correlation` | 1 |
| `/api/count` | 1 |
| `/api/country-info` | 1 |
| `/api/cpi-yoy` | 1 |
| `/api/crc32` | 1 |
| `/api/cron-next` | 1 |
| `/api/crypto-global` | 1 |
| `/api/crypto-history` | 1 |
| `/api/crypto-indicators` | 1 |
| `/api/crypto-market` | 1 |
| `/api/crypto-market-pulse` | 1 |
| `/api/crypto-news` | 1 |
| `/api/crypto-options-chain` | 1 |
| `/api/crypto-price` | 1 |
| `/api/crypto-trending` | 1 |
| `/api/csv-lint` | 1 |
| `/api/csv-to-json` | 1 |
| `/api/csv-to-md` | 1 |
| `/api/cve-lookup` | 1 |
| `/api/date-diff` | 1 |
| `/api/date-format` | 1 |
| `/api/day-of-year` | 1 |
| `/api/decide` | 2 |
| `/api/dedupe-lines` | 1 |
| `/api/defi-screener` | 1 |
| `/api/degree-days-calc` | 1 |
| `/api/demand-radar` | 1 |
| `/api/device-510k` | 1 |
| `/api/device-adverse-events` | 1 |
| `/api/device-recalls` | 1 |
| `/api/dex-pair` | 1 |
| `/api/dex-pool` | 1 |
| `/api/dex-pool-health` | 1 |
| `/api/dex-quote` | 1 |
| `/api/dex-volume-board` | 1 |
| `/api/dkim-lookup` | 1 |
| `/api/dmarc-check` | 1 |
| `/api/dns` | 1 |
| `/api/dns-lookup` | 1 |
| `/api/dns-propagation` | 1 |
| `/api/docx-create` | 1 |
| `/api/drug-adverse-events` | 1 |
| `/api/drug-label` | 1 |
| `/api/drug-ndc` | 1 |
| `/api/drug-recalls` | 1 |
| `/api/dub` | 1 |
| `/api/duration` | 1 |
| `/api/earthquakes` | 1 |
| `/api/eas-attestations` | 1 |
| `/api/easter-date` | 1 |
| `/api/edgar-13f-dataset-head` | 1 |
| `/api/edgar-13f-datasets` | 1 |
| `/api/edgar-13f-holdings` | 1 |
| `/api/edgar-company-concept` | 1 |
| `/api/edgar-company-facts` | 1 |
| `/api/edgar-company-lookup` | 1 |
| `/api/edgar-filings` | 1 |
| `/api/edgar-insider-trades` | 1 |
| `/api/edgar-recent-ipos` | 1 |
| `/api/edgar-search` | 1 |
| `/api/edgar-xbrl-frame` | 1 |
| `/api/effective-annual-rate` | 1 |
| `/api/email-deliverability` | 1 |
| `/api/email-guard` | 1 |
| `/api/email-validate` | 1 |
| `/api/embed` | 1 |
| `/api/embed-large` | 1 |
| `/api/ens-bulk-resolve` | 1 |
| `/api/ens-resolve` | 1 |
| `/api/epoch-convert` | 1 |
| `/api/erc721-owner` | 1 |
| `/api/eth-call` | 1 |
| `/api/event-logs` | 1 |
| `/api/evm-rpc` | 1 |
| `/api/exchange-rates` | 1 |
| `/api/exchange-spread` | 1 |
| `/api/exchange-tickers` | 1 |
| `/api/exchanges` | 1 |
| `/api/extract` | 1 |
| `/api/extract-entities` | 1 |
| `/api/farcaster-by-address` | 1 |
| `/api/farcaster-profile` | 1 |
| `/api/favicon-grab` | 1 |
| `/api/fc-cast` | 1 |
| `/api/fc-cast-metrics` | 1 |
| `/api/fc-cast-replies` | 1 |
| `/api/fc-cast-search` | 1 |
| `/api/fc-channel` | 1 |
| `/api/fc-channel-feed` | 1 |
| `/api/fc-trending` | 1 |
| `/api/fc-user-casts` | 1 |
| `/api/fc-user-search` | 1 |
| `/api/fec-candidates` | 1 |
| `/api/fed-funds` | 1 |
| `/api/federal-awards` | 1 |
| `/api/feed-parse` | 1 |
| `/api/feedback` | 2 |
| `/api/fema-disasters` | 1 |
| `/api/fetch-json` | 1 |
| `/api/finance` | 1 |
| `/api/food-recalls` | 1 |
| `/api/forecast-eval` | 1 |
| `/api/forecast-holt` | 1 |
| `/api/forecast-holt-winters` | 1 |
| `/api/forecast-naive` | 1 |
| `/api/forecast-ses` | 1 |
| `/api/fred-release-calendar` | 1 |
| `/api/fred-release-observations` | 1 |
| `/api/fred-search` | 1 |
| `/api/fred-series` | 1 |
| `/api/fred-series-info` | 1 |
| `/api/funding-screener` | 1 |
| `/api/fx-dashboard` | 1 |
| `/api/fx-historical` | 1 |
| `/api/fx-rate` | 1 |
| `/api/fx-timeseries` | 1 |
| `/api/gas-estimate` | 1 |
| `/api/gas-snapshot` | 1 |
| `/api/gcd-lcm` | 1 |
| `/api/geo-distance` | 1 |
| `/api/geo-lookup` | 1 |
| `/api/github-repo` | 1 |
| `/api/global-defi` | 1 |
| `/api/gov-data` | 1 |
| `/api/gravatar-check` | 1 |
| `/api/gunzip` | 1 |
| `/api/gzip` | 1 |
| `/api/hash` | 1 |
| `/api/heat-index-calc` | 1 |
| `/api/hex` | 1 |
| `/api/hidden-text-scan` | 1 |
| `/api/hmac` | 1 |
| `/api/html-entities` | 1 |
| `/api/html-frames` | 1 |
| `/api/html-links` | 1 |
| `/api/html-meta` | 1 |
| `/api/html-select` | 1 |
| `/api/html-strip` | 1 |
| `/api/html-table` | 1 |
| `/api/html-to-markdown` | 1 |
| `/api/http-check` | 1 |
| `/api/http-headers` | 1 |
| `/api/iban-validate` | 1 |
| `/api/ics-parse` | 1 |
| `/api/image-convert` | 1 |
| `/api/image-crop` | 1 |
| `/api/image-dominant-color` | 1 |
| `/api/image-exif` | 1 |
| `/api/image-gen` | 1 |
| `/api/image-gen-hd` | 1 |
| `/api/image-gen-premium` | 1 |
| `/api/image-ocr` | 1 |
| `/api/image-resize` | 1 |
| `/api/image-thumbnail` | 1 |
| `/api/images-to-pdf` | 1 |
| `/api/ip-info` | 1 |
| `/api/irr` | 1 |
| `/api/isbn-validate` | 1 |
| `/api/iso-week` | 1 |
| `/api/json-diff` | 1 |
| `/api/json-flatten` | 1 |
| `/api/json-format` | 1 |
| `/api/json-merge` | 1 |
| `/api/json-pointer` | 1 |
| `/api/json-query` | 1 |
| `/api/json-schema-infer` | 1 |
| `/api/json-to-csv` | 1 |
| `/api/json-to-yaml` | 1 |
| `/api/json-validate` | 1 |
| `/api/jsonl` | 1 |
| `/api/jwt-decode` | 1 |
| `/api/jwt-sign` | 1 |
| `/api/jwt-verify` | 1 |
| `/api/kalshi-event` | 1 |
| `/api/kalshi-live-data` | 1 |
| `/api/kalshi-markets` | 1 |
| `/api/kalshi-weather-index` | 1 |
| `/api/keywords` | 1 |
| `/api/l2-gas-comparison` | 1 |
| `/api/leap-year` | 1 |
| `/api/lei-lookup` | 1 |
| `/api/lending-rates` | 1 |
| `/api/levenshtein` | 1 |
| `/api/linear-regression` | 1 |
| `/api/llm` | 1 |
| `/api/llm-context` | 1 |
| `/api/llm-premium` | 1 |
| `/api/llm-pro` | 1 |
| `/api/loan-payment` | 1 |
| `/api/loop-gate` | 1 |
| `/api/lorem` | 1 |
| `/api/markdown-to-html` | 1 |
| `/api/mcp-package-check` | 1 |
| `/api/media-info` | 1 |
| `/api/memory` | 10 |
| `/api/meta` | 1 |
| `/api/mev-block-payment` | 1 |
| `/api/mev-builder-share` | 1 |
| `/api/mev-recent-blocks` | 1 |
| `/api/mime` | 1 |
| `/api/moderate` | 1 |
| `/api/morse` | 1 |
| `/api/moving-average` | 1 |
| `/api/multi-search` | 1 |
| `/api/my-usage` | 1 |
| `/api/nft-collection` | 1 |
| `/api/nft-floor` | 1 |
| `/api/nft-holdings` | 1 |
| `/api/nft-metadata` | 1 |
| `/api/npv` | 1 |
| `/api/number-format` | 1 |
| `/api/onchain-sql` | 1 |
| `/api/onchain-sql-schema` | 1 |
| `/api/onramp-link` | 1 |
| `/api/openapi-diff` | 1 |
| `/api/openapi-extract` | 1 |
| `/api/openapi-lint` | 1 |
| `/api/openapi-mock-response` | 1 |
| `/api/openapi-redact` | 1 |
| `/api/openapi-required-params` | 1 |
| `/api/openapi-resolve-refs` | 1 |
| `/api/openapi-search` | 1 |
| `/api/openapi-security-summary` | 1 |
| `/api/openapi-to-curl` | 1 |
| `/api/openapi-validate-payload` | 1 |
| `/api/options-summary` | 1 |
| `/api/options-ticker` | 1 |
| `/api/outliers` | 1 |
| `/api/page-change` | 1 |
| `/api/page-speed` | 1 |
| `/api/password` | 1 |
| `/api/password-strength` | 1 |
| `/api/pdf` | 1 |
| `/api/pdf-extract-pages` | 1 |
| `/api/pdf-info` | 1 |
| `/api/pdf-merge` | 1 |
| `/api/pdf-rotate` | 1 |
| `/api/pdf-summarize` | 1 |
| `/api/pdf-to-markdown` | 1 |
| `/api/percentage` | 1 |
| `/api/perp-basis` | 1 |
| `/api/perp-dex-limits` | 1 |
| `/api/perp-dex-markets` | 1 |
| `/api/perp-dexs` | 1 |
| `/api/perp-funding` | 1 |
| `/api/perp-funding-screener` | 1 |
| `/api/perp-klines` | 1 |
| `/api/perp-markets` | 1 |
| `/api/perp-open-interest` | 1 |
| `/api/perp-orderbook` | 1 |
| `/api/place-lookup` | 1 |
| `/api/pptx-create` | 1 |
| `/api/price-coingecko` | 1 |
| `/api/public-holidays` | 1 |
| `/api/qr` | 1 |
| `/api/querystring` | 1 |
| `/api/random` | 1 |
| `/api/readability` | 1 |
| `/api/readability-score` | 1 |
| `/api/receipts` | 1 |
| `/api/redact` | 1 |
| `/api/regex` | 1 |
| `/api/relative-time` | 1 |
| `/api/render` | 1 |
| `/api/robots-check` | 1 |
| `/api/roman` | 1 |
| `/api/rot13` | 1 |
| `/api/route` | 4 |
| `/api/rsi` | 1 |
| `/api/rwa-asset` | 1 |
| `/api/rwa-issuer` | 1 |
| `/api/rwa-issuers` | 1 |
| `/api/rwa-list` | 1 |
| `/api/rwa-markets` | 1 |
| `/api/sahm-rule` | 1 |
| `/api/sanctions` | 2 |
| `/api/screenshot` | 1 |
| `/api/search` | 1 |
| `/api/search-images` | 1 |
| `/api/search-lite` | 1 |
| `/api/search-news` | 1 |
| `/api/search-suggest` | 1 |
| `/api/search-videos` | 1 |
| `/api/selector-lookup` | 1 |
| `/api/seller-dossier` | 1 |
| `/api/seller-payability` | 1 |
| `/api/semver` | 1 |
| `/api/sharpe-ratio` | 1 |
| `/api/site-crawl` | 1 |
| `/api/site-map` | 1 |
| `/api/sitemap` | 1 |
| `/api/skill` | 81 |
| `/api/slugify` | 1 |
| `/api/sol-price` | 1 |
| `/api/sol-swap-quote` | 1 |
| `/api/sol-token-holders` | 1 |
| `/api/sol-token-lookup` | 1 |
| `/api/sol-token-pairs` | 1 |
| `/api/sol-token-report` | 1 |
| `/api/sol-token-safety` | 1 |
| `/api/sol-token-search` | 1 |
| `/api/sol-trending` | 1 |
| `/api/solidity-scan` | 1 |
| `/api/sort-lines` | 1 |
| `/api/spf-check` | 1 |
| `/api/sql-cert-verify` | 1 |
| `/api/sql-guard` | 1 |
| `/api/srt-convert` | 1 |
| `/api/stablecoin-depeg-watch` | 1 |
| `/api/stablecoin-peg` | 1 |
| `/api/stats` | 1 |
| `/api/stats-summary` | 1 |
| `/api/sun-times` | 1 |
| `/api/tech-stack` | 1 |
| `/api/testnet-fund` | 1 |
| `/api/text-chunk` | 1 |
| `/api/text-diff` | 1 |
| `/api/text-stats` | 1 |
| `/api/time` | 1 |
| `/api/time-convert` | 1 |
| `/api/timezone-convert` | 1 |
| `/api/tls-cert` | 1 |
| `/api/token-allowance` | 1 |
| `/api/token-balances` | 1 |
| `/api/token-count` | 1 |
| `/api/token-metadata` | 1 |
| `/api/token-price` | 1 |
| `/api/token-price-history` | 1 |
| `/api/token-safety` | 1 |
| `/api/totp` | 1 |
| `/api/transcribe` | 1 |
| `/api/transcribe-pro` | 1 |
| `/api/transfer-authorization` | 1 |
| `/api/treasury-avg-rates` | 1 |
| `/api/treasury-debt` | 1 |
| `/api/treasury-yield-curve` | 1 |
| `/api/treasury-yield-history` | 1 |
| `/api/truncate` | 1 |
| `/api/tts` | 1 |
| `/api/tts-hd` | 1 |
| `/api/tts-lite` | 1 |
| `/api/tx-receipt` | 1 |
| `/api/tx-simulate` | 1 |
| `/api/tx-status` | 1 |
| `/api/ulid` | 1 |
| `/api/unemployment-rate` | 1 |
| `/api/unit-convert` | 1 |
| `/api/unshorten-url` | 1 |
| `/api/url-code` | 1 |
| `/api/url-parse` | 1 |
| `/api/usdc-balance` | 1 |
| `/api/user-agent` | 1 |
| `/api/uuid` | 1 |
| `/api/uuid-validate` | 1 |
| `/api/vehicle-recalls` | 1 |
| `/api/vin-decode` | 1 |
| `/api/wallet-balance` | 1 |
| `/api/wallet-balances` | 1 |
| `/api/wallet-transactions` | 1 |
| `/api/weather-air-quality` | 1 |
| `/api/weather-alerts` | 1 |
| `/api/weather-current` | 1 |
| `/api/weather-daily` | 1 |
| `/api/weather-forecast` | 1 |
| `/api/weather-history` | 1 |
| `/api/weather-hourly` | 1 |
| `/api/weather-market-board` | 1 |
| `/api/weather-market-brackets` | 1 |
| `/api/weather-probability` | 1 |
| `/api/weather-thresholds` | 1 |
| `/api/weather-window` | 1 |
| `/api/webhook-verify` | 1 |
| `/api/whois` | 1 |
| `/api/wikidata-entity` | 1 |
| `/api/wmo-weather-code` | 1 |
| `/api/world-bank-indicator` | 1 |
| `/api/world-bank-search` | 1 |
| `/api/x-search-recent` | 1 |
| `/api/x-tweet` | 1 |
| `/api/x-user` | 1 |
| `/api/x-user-tweets` | 1 |
| `/api/x-users-lookup` | 1 |
| `/api/x402` | 1 |
| `/api/x402-audit` | 1 |
| `/api/x402-market-pulse` | 1 |
| `/api/x402-quote` | 1 |
| `/api/x402-trending` | 1 |
| `/api/x402-verify` | 1 |
| `/api/xlsx-create` | 1 |
| `/api/xml-to-json` | 1 |
| `/api/yaml-to-json` | 1 |
| `/api/yield-curve-spread` | 1 |
| `/v1/audio` | 2 |
| `/v1/auto` | 4 |
| `/v1/chat` | 1 |
| `/v1/decisions` | 1 |
| `/v1/domain-audit` | 2 |
| `/v1/dossier` | 2 |
| `/v1/embeddings` | 1 |
| `/v1/filing-report` | 1 |
| `/v1/fund` | 2 |
| `/v1/gemini` | 1 |
| `/v1/grounded` | 1 |
| `/v1/images` | 4 |
| `/v1/insider-report` | 1 |
| `/v1/ipo-report` | 1 |
| `/v1/judge` | 4 |
| `/v1/linkedin-article` | 1 |
| `/v1/messages` | 1 |
| `/v1/metered` | 4 |
| `/v1/nano` | 4 |
| `/v1/premium` | 4 |
| `/v1/pro` | 5 |
| `/v1/recall-report` | 1 |
| `/v1/rerank` | 1 |
| `/v1/research` | 4 |
| `/v1/responses` | 1 |
| `/v1/ticker-pack` | 1 |
| `/v1/token-brief` | 1 |
| `/v1/token-risk` | 2 |
| `/v1/videos` | 1 |

## E. Methods

| Method | Count |
| --- | ---: |
| `METHOD_UNSPECIFIED` | 620 |

## F. Shortlist

| ID | Priority | Score | Relevance | Method | URL |
| --- | --- | ---: | --- | --- | --- |
| `CATALOG-001:284:METHOD_UNSPECIFIED:https://agent402.tools/api/evm-rpc` | medium | 48 | potentiallyRelated | null | `https://agent402.tools/api/evm-rpc` |
| `CATALOG-001:416:METHOD_UNSPECIFIED:https://agent402.tools/api/onchain-sql` | medium | 48 | potentiallyRelated | null | `https://agent402.tools/api/onchain-sql` |
| `CATALOG-001:417:METHOD_UNSPECIFIED:https://agent402.tools/api/onchain-sql-schema` | medium | 48 | potentiallyRelated | null | `https://agent402.tools/api/onchain-sql-schema` |

## G. Payment claims

All payment assessments are **metadata-only** versus Sepolia policy (`v2` / `exact` / `eip155:84532` / USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` / 6). They are **not** live challenges and do not set `paymentCompatible`.

## H. Security posture

1. Exactly one approved GET (CATALOG-001); no hostname-wide approval.
2. Single-use attempt marker written before I/O; no auto-reset.
3. D3.5 secure HTTPS: TLS verify+SNI, public IP pin, 0 redirects/retries, ≤10s, ≤256 KiB, concurrency 1.
4. Raw body hashed then deleted; not committed.
5. Secrets redacted; methods never defaulted to GET; `inspectionStatus: notChecked`.
6. `approvedForNetworkExecution: false`; no B4 upgrades; no resource URL fetches.

## I. Artifacts

- `docs/day4/evidence/agent402-full-resource-catalog.json`
- `docs/day4/evidence/agent402-full-catalog-analysis.json`
- `docs/day4/evidence/full-catalog-resource-shortlist.json`
- `docs/day4/agent402-full-catalog-analysis.md`

## J. Honesty / limitations

- Coverage **complete**; omitted=0; parseFailures=0.
- D4.3c evidence was **not** overwritten; prior SHA compared only.
- Advertised resources were not fetched; discovery GET only.

## K. Next authorization (not executed)

- Any GET of an advertised resource URL requires a new exact allowlist.
- Signing / facilitators / payment remain forbidden.
- Marker path remains single-use; no silent re-approval.


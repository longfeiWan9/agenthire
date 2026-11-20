/**
 * Offline capability classification into curated marketplace categories.
 *
 * Multi-category OK. Preserve original labels. Never discard unknown
 * method/capability — fall back to `other`. STRICTLY_OFFLINE.
 */

import type { ResourceCategory } from "../providers/resource-analysis.ts";
import { sortCategoryIds } from "./categories.ts";
import type { MarketplaceCategoryId } from "./types.ts";

export type ClassifyInput = {
  readonly name?: string | null;
  readonly description?: string | null;
  readonly labels?: readonly string[] | null;
  readonly tags?: readonly string[] | null;
  readonly url?: string | null;
  readonly method?: string | null;
  readonly claimedTaskIds?: readonly string[] | null;
  readonly priorResourceCategories?: readonly ResourceCategory[] | null;
};

const RESOURCE_CATEGORY_MAP: Readonly<
  Record<ResourceCategory, readonly MarketplaceCategoryId[]>
> = {
  walletAnalytics: ["data-analytics"],
  blockchainData: ["data-analytics"],
  defi: ["data-analytics"],
  marketData: ["data-analytics"],
  research: ["research-intelligence"],
  aiInference: ["developer-tools"],
  agentDiscovery: ["developer-tools"],
  developerInfrastructure: ["developer-tools"],
  payments: ["developer-tools"],
  content: ["content-documents"],
  other: ["other"],
  unknown: ["other"],
};

const RULES: readonly {
  readonly category: MarketplaceCategoryId;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    category: "research-intelligence",
    patterns: [
      /\bresearch\b/i,
      /\bdiligence\b/i,
      /\bfilings?\b/i,
      /\bintel(ligence)?\b/i,
      /\bearnings\b/i,
      /\bsec\b/i,
      /\bedgar\b/i,
      /\bcongress\b/i,
      /\bmarket[-_ ]?map\b/i,
      /\bsignals?\b/i,
    ],
  },
  {
    category: "data-analytics",
    patterns: [
      /\bwallet[-_ ]?(activity|analytics|summary)\b/i,
      /\banalytics?\b/i,
      /\bon[-_]?chain\b/i,
      /\bblockchain\b/i,
      /\bevm\b/i,
      /\bsql\b/i,
      /\bmetrics?\b/i,
      /\bprice(s)?\b/i,
      /\bticker\b/i,
      /\bmarket[-_ ]?data\b/i,
      /\bportfolio\b/i,
      /\bsnapshot\b/i,
      /\bfundamentals?\b/i,
    ],
  },
  {
    category: "content-documents",
    patterns: [
      /\bpdf\b/i,
      /\bscreenshot\b/i,
      /\brender\b/i,
      /\bdocument(s)?\b/i,
      /\bhtml\b/i,
      /\bcontent\b/i,
      /\breport(s)?\b/i,
      /\bimage\b/i,
    ],
  },
  {
    category: "developer-tools",
    patterns: [
      /\bopenapi\b/i,
      /\bmcp\b/i,
      /\ba2a\b/i,
      /\bhash\b/i,
      /\buuid\b/i,
      /\bjwt\b/i,
      /\bllm\b/i,
      /\binference\b/i,
      /\bgateway\b/i,
      /\bx402\b/i,
      /\bextract\b/i,
      /\bdeveloper\b/i,
      /\btool(s|ing)?\b/i,
      /\bcatalog[-_ ]?find\b/i,
      /\broute[-_ ]?execute\b/i,
    ],
  },
];

/**
 * Prefer path/query text over hostname so TLDs like `.tools` do not
 * spuriously match the developer-tools keyword rule.
 */
function urlCorpus(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.pathname} ${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Replace embedded http(s) URLs with path/query only so host TLDs
 * (e.g. `.tools`) never drive category keywords.
 */
function scrubLabel(label: string): string {
  return label
    .replace(/https?:\/\/[^\s]+/gi, (match) => urlCorpus(match))
    .toLowerCase();
}

function corpusOf(input: ClassifyInput): string {
  return [
    input.name ?? "",
    input.description ?? "",
    urlCorpus(input.url),
    input.method ?? "",
    ...(input.labels ?? []).map(scrubLabel),
    ...(input.tags ?? []),
    ...(input.claimedTaskIds ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * Classify into one or more marketplace categories.
 * Always returns at least `other` when nothing matches.
 * Original labels are the caller's responsibility to preserve separately.
 */
export function classifyMarketplaceCategories(
  input: ClassifyInput,
): MarketplaceCategoryId[] {
  const hits = new Set<MarketplaceCategoryId>();

  for (const prior of input.priorResourceCategories ?? []) {
    for (const mapped of RESOURCE_CATEGORY_MAP[prior] ?? ["other"]) {
      hits.add(mapped);
    }
  }

  const corpus = corpusOf(input);
  if (corpus.trim()) {
    for (const rule of RULES) {
      if (rule.patterns.some((re) => re.test(corpus))) {
        hits.add(rule.category);
      }
    }
  }

  // Planned B1/B2 wallet-summary always under data-analytics.
  const tasks = (input.claimedTaskIds ?? []).map((t) => t.toLowerCase());
  if (
    tasks.some(
      (t) =>
        t === "wallet-activity-summary@1.0" ||
        t === "wallet-activity-summary",
    )
  ) {
    hits.add("data-analytics");
  }

  if (hits.size === 0) {
    return ["other"];
  }

  // If we only hit `other` via prior unknown mapping plus real hits, drop lone other.
  if (hits.size > 1 && hits.has("other")) {
    const withoutOther = [...hits].filter((c) => c !== "other");
    if (withoutOther.length > 0) {
      return sortCategoryIds(withoutOther);
    }
  }

  return sortCategoryIds([...hits]);
}

/** Extract keyword tokens for search (deterministic, lowercase). */
export function extractKeywords(input: ClassifyInput): string[] {
  const raw = corpusOf(input);
  const tokens = raw
    .split(/[^a-z0-9@._+-]+/i)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2 && t.length <= 64);
  return [...new Set(tokens)].sort();
}

export function protocolHintsFromText(
  ...parts: Array<string | null | undefined>
): import("./types.ts").ProtocolHint[] {
  const corpus = parts.filter(Boolean).join(" ").toLowerCase();
  const hints = new Set<import("./types.ts").ProtocolHint>();
  if (/\bx402\b/.test(corpus)) hints.add("x402");
  if (/\bmcp\b/.test(corpus)) hints.add("mcp");
  if (/\ba2a\b/.test(corpus) || /agent-card/.test(corpus)) hints.add("a2a");
  if (/\bopenapi\b/.test(corpus)) hints.add("openapi");
  if (/\berc-?8004\b/.test(corpus) || /eip155:/.test(corpus)) {
    hints.add("erc8004");
  }
  if (/\bwallet-activity-summary/.test(corpus)) hints.add("agenthire-task");
  if (/^https?:\/\//.test(corpus) && hints.size === 0) hints.add("web");
  if (hints.size === 0) hints.add("unknown");
  return [...hints].sort();
}

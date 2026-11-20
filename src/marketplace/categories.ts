/**
 * Curated marketplace category registry (D4.5).
 *
 * Categories help discovery; they never restrict listing.
 * Unknown / unmatched labels fall back to `other` without discarding originals.
 */

import type { MarketplaceCategoryId } from "./types.ts";

export type CategoryDefinition = {
  readonly id: MarketplaceCategoryId;
  readonly name: string;
  readonly description: string;
};

export const MARKETPLACE_CATEGORIES: readonly CategoryDefinition[] = [
  {
    id: "research-intelligence",
    name: "Research & Intelligence",
    description:
      "Research reports, diligence, filings, intelligence search, and market maps.",
  },
  {
    id: "data-analytics",
    name: "Data & Analytics",
    description:
      "Structured data, analytics, blockchain/on-chain data, market metrics, and wallet summaries.",
  },
  {
    id: "content-documents",
    name: "Content & Documents",
    description:
      "Document generation, PDF/HTML rendering, screenshots, and content transforms.",
  },
  {
    id: "developer-tools",
    name: "Developer Tools",
    description:
      "Developer infrastructure, utilities, OpenAPI/MCP/A2A surfaces, hashing, and tooling.",
  },
  {
    id: "other",
    name: "Other",
    description:
      "Fallback for capabilities that do not clearly match a curated category. Always listable.",
  },
] as const;

export const MARKETPLACE_CATEGORY_IDS: readonly MarketplaceCategoryId[] =
  MARKETPLACE_CATEGORIES.map((c) => c.id);

const BY_ID: ReadonlyMap<MarketplaceCategoryId, CategoryDefinition> = new Map(
  MARKETPLACE_CATEGORIES.map((c) => [c.id, c]),
);

export function getCategoryDefinition(
  id: MarketplaceCategoryId,
): CategoryDefinition {
  const hit = BY_ID.get(id);
  if (!hit) {
    return BY_ID.get("other")!;
  }
  return hit;
}

export function isMarketplaceCategoryId(
  value: string,
): value is MarketplaceCategoryId {
  return (MARKETPLACE_CATEGORY_IDS as readonly string[]).includes(value);
}

/** Stable sort: curated order, `other` last among equals already encoded. */
export function sortCategoryIds(
  ids: readonly MarketplaceCategoryId[],
): MarketplaceCategoryId[] {
  const order = new Map(
    MARKETPLACE_CATEGORY_IDS.map((id, index) => [id, index]),
  );
  return [...new Set(ids)].sort(
    (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99),
  );
}

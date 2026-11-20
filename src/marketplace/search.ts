/**
 * Offline marketplace capability search (D4.5).
 *
 * Filter by category / provider / name / keywords / task id / protocol /
 * verification milestone. Always able to list `other`.
 *
 * Ranking: exact task → explicit capability → descriptive → category.
 * Ties broken by capabilityId ascending. Search ≠ readiness.
 */

import type {
  CapabilityRecord,
  MarketplaceCatalogDocument,
  MarketplaceCategoryId,
  SearchHit,
  SearchHitReason,
  SearchQuery,
  SearchResult,
} from "./types.ts";

function asCategoryList(
  category: SearchQuery["category"],
): MarketplaceCategoryId[] | null {
  if (category == null) return null;
  return Array.isArray(category) ? [...category] : [category];
}

function matchesFilters(
  record: CapabilityRecord,
  query: SearchQuery,
): boolean {
  const includeOther = query.includeOther !== false;
  const categories = asCategoryList(query.category);

  if (categories && categories.length > 0) {
    const hit = categories.some((c) => record.categories.includes(c));
    if (!hit) return false;
  } else if (!includeOther && record.categories.length === 1 && record.categories[0] === "other") {
    return false;
  }

  if (query.provider) {
    const needle = query.provider.toLowerCase();
    const hay = [
      record.providerKey,
      record.agentDisplayName ?? "",
      record.agentProfileId,
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  if (query.name) {
    const needle = query.name.toLowerCase();
    const hay = `${record.displayName} ${record.serviceKey}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  if (query.keywords && query.keywords.length > 0) {
    const kw = new Set(record.keywords.map((k) => k.toLowerCase()));
    const labels = new Set(
      record.originalLabels.map((l) => l.toLowerCase()),
    );
    const ok = query.keywords.every((k) => {
      const n = k.toLowerCase();
      return (
        kw.has(n) ||
        labels.has(n) ||
        record.displayName.toLowerCase().includes(n) ||
        (record.description ?? "").toLowerCase().includes(n)
      );
    });
    if (!ok) return false;
  }

  if (query.taskId) {
    const needle = query.taskId.toLowerCase();
    const hit = record.claimedTaskIds.some((t) => t.toLowerCase() === needle);
    if (!hit) {
      // Also allow descriptive containment for filter (ranking still prefers exact).
      const corpus = `${record.displayName} ${record.description ?? ""} ${record.originalLabels.join(" ")}`.toLowerCase();
      if (!corpus.includes(needle)) return false;
    }
  }

  if (query.protocol) {
    if (!record.protocols.includes(query.protocol)) return false;
  }

  if (query.verificationMilestone) {
    if (record.verification.derivedMilestone !== query.verificationMilestone) {
      return false;
    }
  }

  return true;
}

function scoreRecord(
  record: CapabilityRecord,
  query: SearchQuery,
): { readonly score: number; readonly reasons: SearchHitReason[] } {
  const reasons: SearchHitReason[] = [];
  let score = 0;

  if (query.taskId) {
    const needle = query.taskId.toLowerCase();
    if (record.claimedTaskIds.some((t) => t.toLowerCase() === needle)) {
      score += 1000;
      reasons.push("exact-task");
    }
  }

  if (query.name) {
    const needle = query.name.toLowerCase();
    if (record.displayName.toLowerCase() === needle) {
      score += 400;
      reasons.push("explicit-capability");
    } else if (record.serviceKey.toLowerCase() === needle) {
      score += 350;
      reasons.push("explicit-capability");
    } else if (record.displayName.toLowerCase().includes(needle)) {
      score += 120;
      reasons.push("descriptive");
    }
  }

  if (query.keywords && query.keywords.length > 0) {
    let descriptiveHits = 0;
    for (const k of query.keywords) {
      const n = k.toLowerCase();
      if (record.keywords.includes(n) || record.originalLabels.some((l) => l.toLowerCase() === n)) {
        descriptiveHits += 1;
      }
    }
    if (descriptiveHits > 0) {
      score += 40 * descriptiveHits;
      if (!reasons.includes("descriptive")) reasons.push("descriptive");
    }
  }

  const categories = asCategoryList(query.category);
  if (categories && categories.length > 0) {
    const overlap = categories.filter((c) => record.categories.includes(c)).length;
    if (overlap > 0) {
      score += 20 * overlap;
      reasons.push("category");
    }
  } else if (record.categories.includes("other")) {
    // Still listable; tiny base score so other remains searchable.
    score += 1;
    reasons.push("category");
  }

  if (reasons.length === 0) {
    reasons.push("descriptive");
    score += 1;
  }

  return { score, reasons };
}

/**
 * Search the marketplace catalog.
 * Results always may include `other` unless `includeOther: false`.
 * Tie-break: capabilityId ascending.
 */
export function searchCapabilities(
  catalog: MarketplaceCatalogDocument,
  query: SearchQuery = {},
): SearchResult {
  const hits: SearchHit[] = [];

  for (const record of catalog.capabilities) {
    if (!matchesFilters(record, query)) continue;
    const { score, reasons } = scoreRecord(record, query);
    hits.push({
      capabilityId: record.capabilityId,
      rankScore: score,
      reasons,
      record,
    });
  }

  hits.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return a.capabilityId < b.capabilityId
      ? -1
      : a.capabilityId > b.capabilityId
        ? 1
        : 0;
  });

  return {
    query,
    total: hits.length,
    hits,
    tieBreak: "capabilityId-asc",
    note: "Search ranks discoverability only; it is not integration readiness.",
  };
}

/** List all capabilities in a category, including empty → []. */
export function listByCategory(
  catalog: MarketplaceCatalogDocument,
  categoryId: MarketplaceCategoryId,
): readonly CapabilityRecord[] {
  return catalog.capabilities.filter((c) => c.categories.includes(categoryId));
}

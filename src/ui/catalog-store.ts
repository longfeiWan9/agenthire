/**
 * Server-side offline catalog loader (D5.6).
 * Reads committed marketplace evidence from disk — no provider network.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listByCategory, searchCapabilities } from "../marketplace/search.ts";
import {
  isMarketplaceCategoryId,
  MARKETPLACE_CATEGORIES,
  getCategoryDefinition,
} from "../marketplace/categories.ts";
import type {
  CapabilityRecord,
  CategorySummaryDocument,
  MarketplaceCatalogDocument,
  MarketplaceCategoryId,
  SearchQuery,
  SearchResult,
} from "../marketplace/types.ts";
import { SEC_IDENTITY_CAPABILITY_ID } from "../adapters/quantjourney-sec-identity.ts";

export const CATALOG_EVIDENCE_PATH =
  "docs/marketplace/evidence/capability-catalog.json" as const;
export const CATEGORY_SUMMARY_PATH =
  "docs/marketplace/evidence/category-summary.json" as const;

const PAGE_SIZE_DEFAULT = 24;

let cachedCatalog: MarketplaceCatalogDocument | null = null;
let cachedSummary: CategorySummaryDocument | null = null;

export function resetCatalogCacheForTests(): void {
  cachedCatalog = null;
  cachedSummary = null;
}

export function resolveRepoRoot(cwd: string = process.cwd()): string {
  return cwd;
}

export function loadMarketplaceCatalog(
  repoRoot: string = resolveRepoRoot(),
): MarketplaceCatalogDocument {
  if (cachedCatalog) return cachedCatalog;
  const raw = readFileSync(join(repoRoot, CATALOG_EVIDENCE_PATH), "utf8");
  cachedCatalog = JSON.parse(raw) as MarketplaceCatalogDocument;
  return cachedCatalog;
}

export function loadCategorySummary(
  repoRoot: string = resolveRepoRoot(),
): CategorySummaryDocument {
  if (cachedSummary) return cachedSummary;
  const raw = readFileSync(join(repoRoot, CATEGORY_SUMMARY_PATH), "utf8");
  cachedSummary = JSON.parse(raw) as CategorySummaryDocument;
  return cachedSummary;
}

/** Safe capability ID: reject path separators / traversal. */
export function isSafeCapabilityId(value: string): boolean {
  if (!value || value.length > 200) return false;
  if (value.includes("/") || value.includes("\\") || value.includes("..")) {
    return false;
  }
  return /^[A-Za-z0-9:._@~+-]+$/.test(value);
}

export function getCapabilityById(
  capabilityId: string,
  repoRoot: string = resolveRepoRoot(),
): CapabilityRecord | null {
  if (!isSafeCapabilityId(capabilityId)) return null;
  const catalog = loadMarketplaceCatalog(repoRoot);
  return catalog.capabilities.find((c) => c.capabilityId === capabilityId) ?? null;
}

export function getAgentForCapability(
  record: CapabilityRecord,
  repoRoot: string = resolveRepoRoot(),
) {
  const catalog = loadMarketplaceCatalog(repoRoot);
  return (
    catalog.agents.find((a) => a.agentProfileId === record.agentProfileId) ??
    null
  );
}

export type PaginatedSearch = {
  readonly result: SearchResult;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly pageHits: SearchResult["hits"];
};

export function searchCatalogPage(
  query: SearchQuery,
  page = 1,
  pageSize = PAGE_SIZE_DEFAULT,
  repoRoot: string = resolveRepoRoot(),
): PaginatedSearch {
  const catalog = loadMarketplaceCatalog(repoRoot);
  const result = searchCapabilities(catalog, query);
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.floor(pageSize)
      : PAGE_SIZE_DEFAULT;
  const totalPages = Math.max(1, Math.ceil(result.total / safeSize));
  const clamped = Math.min(safePage, totalPages);
  const start = (clamped - 1) * safeSize;
  const pageHits = result.hits.slice(start, start + safeSize);
  return {
    result,
    page: clamped,
    pageSize: safeSize,
    totalPages,
    pageHits,
  };
}

export function listCategoryPage(
  categoryId: MarketplaceCategoryId,
  page = 1,
  pageSize = PAGE_SIZE_DEFAULT,
  repoRoot: string = resolveRepoRoot(),
): PaginatedSearch {
  return searchCatalogPage({ category: categoryId }, page, pageSize, repoRoot);
}

export function parseCategoryParam(
  value: string | undefined | null,
): MarketplaceCategoryId | null {
  if (!value) return null;
  if (!isMarketplaceCategoryId(value)) return null;
  return value;
}

export function parseSearchParams(input: {
  readonly q?: string | null;
  readonly category?: string | null;
  readonly page?: string | null;
}): {
  readonly query: SearchQuery;
  readonly page: number;
  readonly q: string;
} {
  const q = (input.q ?? "").trim();
  const category = parseCategoryParam(input.category);
  const pageRaw = Number.parseInt(input.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const query: SearchQuery = {
    ...(category ? { category } : {}),
    ...(q
      ? { name: q, keywords: q.split(/\s+/).filter(Boolean) }
      : {}),
  };
  return { query, page, q };
}

export function catalogFacts(repoRoot: string = resolveRepoRoot()) {
  const catalog = loadMarketplaceCatalog(repoRoot);
  const summary = loadCategorySummary(repoRoot);
  return {
    capabilityCount: catalog.counts.capabilities,
    agentProfileCount: catalog.counts.agentProfiles,
    erc8004IdentityCount: catalog.agents.filter(
      (a) => a.registryAddress != null && a.agentId != null,
    ).length,
    categories: MARKETPLACE_CATEGORIES,
    summary,
    secCapabilityId: SEC_IDENTITY_CAPABILITY_ID,
    snapshotAsOf: catalog.snapshotAsOf,
  };
}

export function listCapabilitiesInCategory(
  categoryId: MarketplaceCategoryId,
  repoRoot: string = resolveRepoRoot(),
): readonly CapabilityRecord[] {
  return listByCategory(loadMarketplaceCatalog(repoRoot), categoryId);
}

export {
  getCategoryDefinition,
  MARKETPLACE_CATEGORIES,
  isMarketplaceCategoryId,
};

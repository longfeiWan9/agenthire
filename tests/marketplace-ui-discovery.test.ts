/**
 * D5.6 marketplace UI discovery tests — STRICTLY_OFFLINE.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { SEC_IDENTITY_CAPABILITY_ID } from "../src/adapters/quantjourney-sec-identity.ts";
import {
  catalogFacts,
  getCapabilityById,
  isSafeCapabilityId,
  listCategoryPage,
  parseSearchParams,
  resetCatalogCacheForTests,
  searchCatalogPage,
} from "../src/ui/catalog-store.ts";

describe("D5.6 UI discovery", () => {
  beforeEach(() => {
    resetCatalogCacheForTests();
  });

  it("loads real catalog facts (690 / 5 / 3 ERC-8004)", () => {
    const facts = catalogFacts();
    expect(facts.capabilityCount).toBe(690);
    expect(facts.agentProfileCount).toBe(5);
    expect(facts.erc8004IdentityCount).toBe(3);
    expect(facts.categories).toHaveLength(5);
  });

  it("searches by name/keywords against real catalog", () => {
    const paged = searchCatalogPage({ name: "SEC", keywords: ["SEC"] }, 1, 24);
    expect(paged.result.total).toBeGreaterThan(0);
    expect(
      paged.pageHits.some((h) => h.capabilityId === SEC_IDENTITY_CAPABILITY_ID),
    ).toBe(true);
  });

  it("filters by category including other", () => {
    const other = listCategoryPage("other", 1, 24);
    expect(other.result.total).toBeGreaterThan(0);
    expect(other.pageHits.every((h) => h.record.categories.includes("other"))).toBe(
      true,
    );
  });

  it("paginates deterministically", () => {
    const page1 = searchCatalogPage({}, 1, 10);
    const page2 = searchCatalogPage({}, 2, 10);
    expect(page1.pageHits).toHaveLength(10);
    expect(page2.pageHits).toHaveLength(10);
    expect(page1.pageHits[0]!.capabilityId).not.toBe(
      page2.pageHits[0]!.capabilityId,
    );
    expect(page1.totalPages).toBe(Math.ceil(690 / 10));
  });

  it("returns empty results for nonsense query", () => {
    const paged = searchCatalogPage(
      { name: "zzznomatchagentHireXYZ", keywords: ["zzznomatchagentHireXYZ"] },
      1,
      24,
    );
    expect(paged.result.total).toBe(0);
    expect(paged.pageHits).toHaveLength(0);
  });

  it("handles special characters without throwing", () => {
    const paged = searchCatalogPage(
      { name: `<>&"'%/\\`, keywords: [`<>&"'%]`] },
      1,
      24,
    );
    expect(paged.result.total).toBeGreaterThanOrEqual(0);
  });

  it("unknown capability id returns null; unsafe ids rejected", () => {
    expect(getCapabilityById("cap:does-not-exist-zzzz")).toBeNull();
    expect(isSafeCapabilityId("../etc/passwd")).toBe(false);
    expect(isSafeCapabilityId("cap:79da211975c2")).toBe(true);
    expect(getCapabilityById("../../docs/day5/evidence/openapi-001-live-attempt.marker")).toBeNull();
  });

  it("parseSearchParams maps q/category/page", () => {
    const parsed = parseSearchParams({
      q: " identity ",
      category: "research-intelligence",
      page: "2",
    });
    expect(parsed.q).toBe("identity");
    expect(parsed.page).toBe(2);
    expect(parsed.query.category).toBe("research-intelligence");
  });
});

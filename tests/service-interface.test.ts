import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stableStringify } from "../src/providers/catalog.ts";
import {
  assessProviderServices,
  buildProposedServiceInspections,
  type DiscoveryEvidenceLike,
} from "../src/providers/service-interface.ts";
import type { ProviderCatalogDocument } from "../src/providers/types.ts";
import { runPlanServiceInspections } from "../src/scripts/plan-service-inspections.ts";

const repoRoot = join(import.meta.dirname, "..");

function loadCatalog(): ProviderCatalogDocument {
  return JSON.parse(
    readFileSync(join(repoRoot, "docs/evidence/provider-catalog.json"), "utf8"),
  ) as ProviderCatalogDocument;
}

function loadDiscovery(): DiscoveryEvidenceLike {
  return JSON.parse(
    readFileSync(
      join(repoRoot, "docs/day4/evidence/discovery-inspection.json"),
      "utf8",
    ),
  ) as DiscoveryEvidenceLike;
}

describe("service-interface assessment (offline)", () => {
  it("assesses catalog services without inventing HTTP methods", () => {
    const assessments = assessProviderServices({
      catalog: loadCatalog(),
      discovery: loadDiscovery(),
    });
    expect(assessments.length).toBeGreaterThan(29);

    const catalogRows = assessments.filter(
      (a) => !a.serviceId.startsWith("skill:"),
    );
    expect(catalogRows).toHaveLength(29);

    for (const row of catalogRows) {
      if (row.catalogMethod === "OTHER") {
        expect(row.method).toBeNull();
      }
      expect(row.explicitMvpTaskMatch).toBe(false);
    }
  });

  it("records Agent402 / QuantJourney skills without treating them as MVP task", () => {
    const assessments = assessProviderServices({
      catalog: loadCatalog(),
      discovery: loadDiscovery(),
    });
    const skills = assessments.filter((a) => a.serviceId.startsWith("skill:"));
    expect(skills.some((s) => s.skillId === "catalog-find")).toBe(true);
    expect(skills.some((s) => s.skillId === "x402-index")).toBe(true);
    expect(
      skills.every((s) => s.explicitMvpTaskMatch === false),
    ).toBe(true);
    const index = skills.find((s) => s.skillId === "x402-index");
    expect(index?.unknowns).toContain("x402IndexSkillIsNotPaymentEndpoint");
    expect(index?.endpointUrl).toBe("unknown");
    expect(index?.method).toBeNull();
  });

  it("does not upgrade B4 payment/task from documentation alone", () => {
    const assessments = assessProviderServices({
      catalog: loadCatalog(),
      discovery: loadDiscovery(),
    });
    for (const row of assessments) {
      expect(row.requestSchema === "documented").toBe(false);
      expect(row.explicitMvpTaskMatch).toBe(false);
    }
  });

  it("keyword similarity is not exact task match", () => {
    const catalog = loadCatalog();
    const mutated: ProviderCatalogDocument = {
      ...catalog,
      providers: catalog.providers.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              services: p.services.map((s, sidx) =>
                sidx === 0
                  ? { ...s, claimedTaskTypes: ["wallet-analytics"] }
                  : s,
              ),
            }
          : p,
      ),
    };
    const assessments = assessProviderServices({ catalog: mutated });
    const row = assessments.find(
      (a) =>
        a.providerId === mutated.providers[0]?.providerId &&
        a.serviceId === mutated.providers[0]?.services[0]?.serviceId,
    );
    expect(row?.taskRelevance).toBe("potentiallyRelated");
    expect(row?.explicitMvpTaskMatch).toBe(false);
  });

  it("builds ≤3 unapproved proposals with exact catalog URLs only", () => {
    const doc = buildProposedServiceInspections({
      catalog: loadCatalog(),
      discovery: loadDiscovery(),
    });
    expect(doc.proposalCount).toBeLessThanOrEqual(3);
    expect(doc.proposalCount).toBeGreaterThanOrEqual(2);
    expect(doc.maxProposals).toBe(3);

    for (const p of doc.proposals) {
      expect(p.approvedForNetworkExecution).toBe(false);
      expect(p.bodyTemplate).toBeNull();
      expect(p.exactUrl.startsWith("https://")).toBe(true);
      expect(
        ["GET", "HEAD", "POST", null].includes(p.method as never),
      ).toBe(true);
    }

    const urls = doc.proposals.map((p) => p.exactUrl);
    expect(urls).toContain("https://agent402.tools/.well-known/x402");
    expect(urls).toContain(
      "https://agents.quantjourney.cloud/.well-known/x402",
    );
  });

  it("proposals are deterministic across dual build", () => {
    const catalog = loadCatalog();
    const discovery = loadDiscovery();
    const a = stableStringify(
      buildProposedServiceInspections({ catalog, discovery }),
    );
    const b = stableStringify(
      buildProposedServiceInspections({ catalog, discovery }),
    );
    expect(a).toBe(b);
  });

  it("does not mutate historical discovery evidence file contents", () => {
    const before = readFileSync(
      join(repoRoot, "docs/day4/evidence/discovery-inspection.json"),
      "utf8",
    );
    buildProposedServiceInspections({
      catalog: loadCatalog(),
      discovery: loadDiscovery(),
    });
    const after = readFileSync(
      join(repoRoot, "docs/day4/evidence/discovery-inspection.json"),
      "utf8",
    );
    expect(after).toBe(before);
  });

  it("CLI planner writes proposed-service-inspections.json deterministically", async () => {
    const first = await runPlanServiceInspections({ repoRoot });
    const second = await runPlanServiceInspections({ repoRoot });
    expect(first.documentSha256).toBe(second.documentSha256);
    expect(first.proposalCount).toBeLessThanOrEqual(3);
    expect(first.ok).toBe(true);

    const written = JSON.parse(
      readFileSync(
        join(repoRoot, "docs/day4/evidence/proposed-service-inspections.json"),
        "utf8",
      ),
    ) as { proposals: { approvedForNetworkExecution: boolean }[] };
    expect(
      written.proposals.every((p) => p.approvedForNetworkExecution === false),
    ).toBe(true);
  });

  it("unknown method stays null — missing schema flagged", () => {
    const assessments = assessProviderServices({
      catalog: loadCatalog(),
      discovery: loadDiscovery(),
    });
    const x402Svc = assessments.find(
      (a) => a.endpointUrl === "https://agent402.tools/.well-known/x402",
    );
    expect(x402Svc?.method).toBeNull();
    expect(x402Svc?.unknowns).toContain("requestSchemaNotChecked");
    expect(x402Svc?.unknowns).toContain("noObservedX402Offers");
  });
});

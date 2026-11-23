/**
 * D5.6 capability detail honesty tests — STRICTLY_OFFLINE.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { SEC_IDENTITY_CAPABILITY_ID } from "../src/adapters/quantjourney-sec-identity.ts";
import { B1B2_PLANNED_CAPABILITY_ID } from "../src/marketplace/catalog.ts";
import {
  getCapabilityById,
  loadMarketplaceCatalog,
  resetCatalogCacheForTests,
} from "../src/ui/catalog-store.ts";
import { buildProvenanceView } from "../src/ui/provenance.ts";
import {
  evidenceLevelFor,
  hiringReadinessFor,
  interfaceFieldLabel,
  ladderLevelFor,
  paymentLabelFor,
} from "../src/ui/trust-labels.ts";

describe("D5.6 UI details", () => {
  beforeEach(() => {
    resetCatalogCacheForTests();
  });

  it("SEC identity shows provenance warnings and L0 ladder", () => {
    const record = getCapabilityById(SEC_IDENTITY_CAPABILITY_ID);
    expect(record).not.toBeNull();
    const prov = buildProvenanceView(record!);
    expect(prov.quantJourneyAmbiguity).toMatch(/QuantJourney/);
    expect(prov.identityLinkageNote).toMatch(/safeToMergeProfiles=false/);
    expect(ladderLevelFor(record!)).toBe("L0");
    expect(hiringReadinessFor(record!)).toBe("Offline demo available");
    expect(paymentLabelFor(record!)).toBe("Payment unavailable");
    expect(interfaceFieldLabel(record!.method)).toBe("Unknown");
    expect(interfaceFieldLabel(null)).toBe("Unknown");
  });

  it("does not invent false ladder or Free payment for x402 resources", () => {
    const catalog = loadMarketplaceCatalog();
    const resource = catalog.capabilities.find(
      (c) => c.sourceKind === "x402-resource",
    );
    expect(resource).toBeTruthy();
    expect(ladderLevelFor(resource!)).toBe("L0");
    expect(paymentLabelFor(resource!)).not.toMatch(/Free/i);
    expect(hiringReadinessFor(resource!)).toBe("Live execution blocked");
    expect(evidenceLevelFor(resource!)).toBe("Discovery evidence");
  });

  it("planned AgentHire seller is labeled planning reference", () => {
    const record = getCapabilityById(B1B2_PLANNED_CAPABILITY_ID);
    expect(record).not.toBeNull();
    const prov = buildProvenanceView(record!);
    expect(prov.plannedSellerNote).toMatch(/Planned AgentHire/);
    expect(hiringReadinessFor(record!)).toBe("Planning reference");
  });
});

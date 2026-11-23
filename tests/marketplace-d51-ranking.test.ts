/**
 * D5.1 offline ranking tests — synthetic fixtures labeled.
 * STRICTLY_OFFLINE — no provider network.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateHardExclusions,
  rankCapabilityRecord,
  rankIntegrationCandidates,
  scoreCapability,
  stableRankingJson,
} from "../src/marketplace/d51-capability-ranking.ts";
import type { CapabilityRecord } from "../src/marketplace/types.ts";

const SNAPSHOT = "2026-11-20T09:05:44.412Z";

function synth(
  overrides: Partial<CapabilityRecord> &
    Pick<CapabilityRecord, "capabilityId" | "displayName" | "serviceKey">,
): CapabilityRecord {
  return {
    agentProfileId: "agent:external:test",
    providerKey: "skill-provider:Test",
    description: null,
    provenance: "external",
    sourceKind: "agent-card-skill",
    categories: ["research-intelligence"],
    originalLabels: [],
    protocols: ["a2a"],
    method: null,
    endpointUrl: null,
    sanitizedUrl: null,
    claimedTaskIds: [],
    keywords: [],
    verification: {
      endpointStatus: "notChecked",
      requestSchemaStatus: "notChecked",
      derivedMilestone: "unverified",
      registryIdentity: "notChecked",
      registrationMetadata: "notChecked",
      endpointReachability: "notChecked",
      paymentPolicy: "notChecked",
      notes: "synthetic",
    },
    paymentAdvertised: null,
    fixtureKind: "captured",
    sourceRefs: ["synthetic"],
    correlationKeys: [],
    agentDisplayName: "Test",
    ...overrides,
  };
}

describe("d5.1 capability ranking", () => {
  it("produces stable rankings for identical inputs", () => {
    const records = [
      synth({
        capabilityId: "cap:sec-identity",
        displayName: "SEC Company Identity",
        serviceKey: "skill:qj-sec-company-identity",
        description:
          "Resolve a ticker or company name to official SEC identity and exchange fields.",
        originalLabels: ["sec", "identity", "cik", "public-data"],
        categories: ["research-intelligence", "data-analytics"],
      }),
      synth({
        capabilityId: "cap:facts",
        displayName: "SEC Company Facts Compact",
        serviceKey: "skill:qj-sec-company-facts-compact",
        description:
          "Project selected current SEC XBRL facts into a small evidence envelope.",
        originalLabels: ["sec", "xbrl", "fundamentals", "public-data"],
        categories: ["research-intelligence", "data-analytics"],
      }),
    ];
    const a = rankIntegrationCandidates(records, {
      snapshotAsOf: SNAPSHOT,
      candidateCapabilityIds: ["cap:sec-identity", "cap:facts"],
      primaryCapabilityId: "cap:sec-identity",
      backupCapabilityId: "cap:facts",
    });
    const b = rankIntegrationCandidates(records, {
      snapshotAsOf: SNAPSHOT,
      candidateCapabilityIds: ["cap:sec-identity", "cap:facts"],
      primaryCapabilityId: "cap:sec-identity",
      backupCapabilityId: "cap:facts",
    });
    expect(stableRankingJson(a)).toBe(stableRankingJson(b));
    expect(a.ranked[0]?.capabilityId).toBe(b.ranked[0]?.capabilityId);
  });

  it("treats missing evidence / unknown HTTP methods honestly", () => {
    const unknown = synth({
      capabilityId: "cap:unknown-method",
      displayName: "Bare Resource",
      serviceKey: "resource:bare",
      sourceKind: "x402-resource",
      method: null,
      endpointUrl: "https://example.test/api/bare",
      sanitizedUrl: "https://example.test/api/bare",
      description: null,
      categories: ["other"],
      paymentAdvertised: true,
    });
    const scored = scoreCapability(unknown);
    expect(scored.scoreNotes.some((n) => /HTTP method unknown/i.test(n))).toBe(
      true,
    );
    expect(scored.scores.interfaceDocumentation).toBeLessThan(25);
    const ranked = rankCapabilityRecord(unknown);
    expect(ranked.evidenceLadder.documentedInterface).toBe(false);
    expect(ranked.evidenceLadder.endpointReachabilityVerified).toBe(false);
    expect(ranked.evidenceLadder.taskExecutionVerified).toBe(false);
    expect(ranked.evidenceLadder.paymentCompatibilityVerified).toBe(false);
  });

  it("does not promote payment advertising to verified offers", () => {
    const advertised = synth({
      capabilityId: "cap:pay-ad",
      displayName: "Paid Lookup",
      serviceKey: "skill:paid-lookup",
      description: "Bounded public-data identity lookup",
      paymentAdvertised: true,
      originalLabels: ["identity", "public-data"],
    });
    const scored = scoreCapability(advertised);
    expect(scored.scores.paymentEvidenceClarity).toBeLessThanOrEqual(2);
    expect(
      scored.scoreNotes.some((n) => /no observed HTTP 402/i.test(n)),
    ).toBe(true);
    const ranked = rankCapabilityRecord(advertised);
    expect(ranked.evidenceLadder.paymentCompatibilityVerified).toBe(false);
    expect(ranked.approvedForNetworkExecution).toBe(false);
  });

  it("hard-excludes unsafe candidates before selection", () => {
    const destructive = synth({
      capabilityId: "cap:wipe",
      displayName: "Wipe Storage",
      serviceKey: "skill:wipe",
      description: "Delete and wipe all stored documents",
    });
    const credentialed = synth({
      capabilityId: "cap:cred",
      displayName: "Private Key Import",
      serviceKey: "skill:import-key",
      description: "Accept a private-key credential to sign transfers",
    });
    expect(evaluateHardExclusions(destructive)).toContain("destructive-operation");
    expect(evaluateHardExclusions(credentialed)).toContain(
      "credential-requirement",
    );
    expect(() =>
      rankIntegrationCandidates([destructive], {
        snapshotAsOf: SNAPSHOT,
        candidateCapabilityIds: ["cap:wipe"],
        primaryCapabilityId: "cap:wipe",
      }),
    ).toThrow(/hard-excluded/i);
  });

  it("supports empty candidate selection", () => {
    const empty = rankIntegrationCandidates([], {
      snapshotAsOf: SNAPSHOT,
      candidateCapabilityIds: [],
      primaryCapabilityId: null,
      backupCapabilityId: null,
    });
    expect(empty.ranked).toEqual([]);
    expect(empty.primaryCapabilityId).toBeNull();
    expect(empty.backupCapabilityId).toBeNull();
  });

  it("preserves candidate identity and provenance fields", () => {
    const record = synth({
      capabilityId: "cap:preserve",
      displayName: "SEC Company Identity",
      serviceKey: "skill:qj-sec-company-identity",
      providerKey: "skill-provider:QuantJourney",
      agentProfileId: "agent:external:1589ec8e8059",
      description:
        "Resolve a ticker or company name to official SEC identity and exchange fields.",
      categories: ["research-intelligence", "data-analytics"],
      originalLabels: ["qj-sec-company-identity", "sec", "identity"],
    });
    const ranked = rankCapabilityRecord(record);
    expect(ranked.capabilityId).toBe("cap:preserve");
    expect(ranked.providerKey).toBe("skill-provider:QuantJourney");
    expect(ranked.agentProfileId).toBe("agent:external:1589ec8e8059");
    expect(ranked.sourceKind).toBe("agent-card-skill");
    expect(ranked.categories).toEqual([
      "research-intelligence",
      "data-analytics",
    ]);
  });

  it("never auto-approves network execution on planning selection", () => {
    const record = synth({
      capabilityId: "cap:plan",
      displayName: "SEC Company Identity",
      serviceKey: "skill:qj-sec-company-identity",
      description:
        "Resolve a ticker to official SEC identity and exchange fields (public-data).",
      originalLabels: ["sec", "identity", "cik", "public-data", "bounded"],
      categories: ["research-intelligence", "data-analytics"],
    });
    const doc = rankIntegrationCandidates([record], {
      snapshotAsOf: SNAPSHOT,
      candidateCapabilityIds: ["cap:plan"],
      primaryCapabilityId: "cap:plan",
    });
    expect(doc.primaryCapabilityId).toBe("cap:plan");
    expect(doc.ranked[0]?.selectedForImplementationPlanning).toBe(true);
    expect(doc.ranked[0]?.approvedForNetworkExecution).toBe(false);
    expect(doc.ranked[0]?.evidenceLadder.endpointReachabilityVerified).toBe(
      false,
    );
    expect(doc.ranked[0]?.evidenceLadder.taskExecutionVerified).toBe(false);
    expect(doc.ranked[0]?.evidenceLadder.paymentCompatibilityVerified).toBe(
      false,
    );
    expect(doc.ranked[0]?.evidenceLadder.verifiedSettlement).toBe(false);
  });

  it("hard-excludes undocumented x402 URL-only resources", () => {
    const bare = synth({
      capabilityId: "cap:bare-x402",
      displayName: "https://example.test/api/mystery",
      serviceKey: "resource:mystery",
      sourceKind: "x402-resource",
      method: null,
      description: null,
      endpointUrl: "https://example.test/api/mystery",
      sanitizedUrl: "https://example.test/api/mystery",
      categories: ["other"],
      paymentAdvertised: true,
    });
    expect(evaluateHardExclusions(bare)).toContain("no-safe-invocation-plan");
    const ranked = rankCapabilityRecord(bare);
    expect(ranked.hardExcluded).toBe(true);
    expect(ranked.totalScore).toBe(0);
  });
});

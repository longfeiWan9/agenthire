/**
 * D5.2 identity linkage assessment tests.
 * No unsafe name-only QuantJourney profile merge.
 */

import { describe, expect, it } from "vitest";
import {
  assessIdentityLinkage,
  assessQuantJourneyIdentityLinkage,
  QUANTJOURNEY_DISCOVERY_PROFILE,
  QUANTJOURNEY_ERC8004_PROFILE,
  type IdentityProfileFacts,
} from "../src/marketplace/identity-linkage.ts";

describe("marketplace identity linkage", () => {
  it("refuses to merge QuantJourney ERC-8004 and discovery profiles by name", () => {
    const assessment = assessQuantJourneyIdentityLinkage();
    expect(assessment.safeToMergeProfiles).toBe(false);
    expect(assessment.verdict).toBe("likelySameOperatorUnproven");
    expect(assessment.left.agentProfileId).toBe(
      QUANTJOURNEY_ERC8004_PROFILE.agentProfileId,
    );
    expect(assessment.right.agentProfileId).toBe(
      QUANTJOURNEY_DISCOVERY_PROFILE.agentProfileId,
    );
    expect(
      assessment.reasons.some((r) => /insufficient|heuristic|unproven/i.test(r)),
    ).toBe(true);
    expect(assessment.notes.some((n) => /Owner ≠ authenticated operator/i.test(n))).toBe(
      true,
    );
  });

  it("allows merge only on identical providerId or profile id", () => {
    const sameId = assessIdentityLinkage(
      QUANTJOURNEY_ERC8004_PROFILE,
      QUANTJOURNEY_ERC8004_PROFILE,
    );
    expect(sameId.safeToMergeProfiles).toBe(true);
    expect(sameId.verdict).toBe("sameProvenIdentity");

    const twin: IdentityProfileFacts = {
      ...QUANTJOURNEY_ERC8004_PROFILE,
      agentProfileId: "agent:other-row",
    };
    const byProvider = assessIdentityLinkage(QUANTJOURNEY_ERC8004_PROFILE, twin);
    expect(byProvider.safeToMergeProfiles).toBe(true);
  });

  it("marks conflicting providerIds as distinct", () => {
    const other: IdentityProfileFacts = {
      agentProfileId: "agent:eip155:8453/0xabc/1",
      displayName: "QuantJourney Research Agent Fabric",
      providerId: "eip155:8453/0xabc/1",
      registryChainId: 8453,
      registryAddress: "0xabc",
      agentId: "1",
      origin: "external",
      sourceKinds: ["erc8004-service"],
    };
    const assessment = assessIdentityLinkage(
      QUANTJOURNEY_ERC8004_PROFILE,
      other,
    );
    expect(assessment.verdict).toBe("distinct");
    expect(assessment.safeToMergeProfiles).toBe(false);
  });

  it("does not treat display-name equality alone as safe merge", () => {
    const left: IdentityProfileFacts = {
      agentProfileId: "agent:a",
      displayName: "Same Name Co",
      providerId: null,
      registryChainId: null,
      registryAddress: null,
      agentId: null,
      origin: "external",
      sourceKinds: ["agent-card-skill"],
    };
    const right: IdentityProfileFacts = {
      ...left,
      agentProfileId: "agent:b",
    };
    const assessment = assessIdentityLinkage(left, right);
    expect(assessment.safeToMergeProfiles).toBe(false);
    expect(assessment.verdict).toBe("likelySameOperatorUnproven");
  });
});

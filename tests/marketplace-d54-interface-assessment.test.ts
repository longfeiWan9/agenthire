import { describe, expect, it } from "vitest";
import {
  assessLadderLevel,
  decideD54Outcome,
  evaluateD54HardExclusions,
  isDiscoveryDocumentUrl,
  rankD54Candidate,
  type D54InterfaceFacts,
} from "../src/marketplace/d54-interface-assessment.ts";

function base(partial: Partial<D54InterfaceFacts>): D54InterfaceFacts {
  return {
    capabilityId: "cap:test",
    providerKey: "skill-provider:Test",
    displayName: "SEC Company Identity",
    sourceKind: "agent-card-skill",
    fixtureKind: "captured",
    provenance: "external",
    categories: ["research-intelligence"],
    description: "Resolve a ticker to official SEC identity fields.",
    method: null,
    endpointUrl: null,
    requestSchemaKnown: false,
    responseSchemaKnown: false,
    paymentAdvertised: null,
    endpointReachabilityVerified: false,
    taskExecutionVerified: false,
    paymentCompatibilityVerified: false,
    evidenceRefs: [],
    notes: [],
    ...partial,
  };
}

describe("d54 interface assessment", () => {
  it("keeps QuantJourney-like skill at L0 and hard-excludes missing method/route/schema", () => {
    const facts = base({ capabilityId: "cap:79da211975c2" });
    expect(assessLadderLevel(facts)).toBe("L0");
    const reasons = evaluateD54HardExclusions(facts);
    expect(reasons).toContain("unknown-http-method");
    expect(reasons).toContain("unknown-route-url");
    expect(reasons).toContain("unknown-request-or-response-schema");
    const ranked = rankD54Candidate(facts);
    expect(ranked.hardExcluded).toBe(true);
    expect(ranked.totalScore).toBe(0);
  });

  it("does not treat discovery/OpenAPI URLs as invocation routes", () => {
    expect(isDiscoveryDocumentUrl("https://agent402.tools/openapi.json")).toBe(true);
    expect(isDiscoveryDocumentUrl("https://agents.quantjourney.cloud/.well-known/agent-card.json")).toBe(
      true,
    );
    expect(isDiscoveryDocumentUrl("https://agent402.tools/api/base64")).toBe(false);
  });

  it("requires method+route+schemas for L1 and never upgrades synthetic", () => {
    const l1 = base({
      method: "GET",
      endpointUrl: "https://example.example/api/identity",
      requestSchemaKnown: true,
      responseSchemaKnown: true,
    });
    expect(assessLadderLevel(l1)).toBe("L1");
    expect(evaluateD54HardExclusions(l1)).toEqual([]);

    const synthetic = base({
      fixtureKind: "synthetic",
      method: "GET",
      endpointUrl: "https://example.example/api/identity",
      requestSchemaKnown: true,
      responseSchemaKnown: true,
      endpointReachabilityVerified: true,
      taskExecutionVerified: true,
      paymentCompatibilityVerified: true,
    });
    expect(assessLadderLevel(synthetic)).toBe("L0");
  });

  it("decides Outcome C when no L1 candidate exists", () => {
    const ranked = [
      rankD54Candidate(base({ capabilityId: "cap:79da211975c2" })),
      rankD54Candidate(
        base({
          capabilityId: "cap:349239bd1d0a",
          sourceKind: "x402-resource",
          displayName: "https://agent402.tools/api/base64",
          description: null,
          endpointUrl: "https://agent402.tools/api/base64",
          paymentAdvertised: true,
        }),
      ),
    ];
    const decision = decideD54Outcome({
      quantjourneyIdentityLadder: "L0",
      ranked,
    });
    expect(decision.outcome).toBe("C_no_l1_null_selection");
    expect(decision.selectedCapabilityId).toBeNull();
  });
});

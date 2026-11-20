/**
 * D4.5 marketplace catalog tests — synthetic fixtures labeled.
 * STRICTLY_OFFLINE.
 */

import { describe, expect, it } from "vitest";
import {
  B1B2_PLANNED_CAPABILITY_ID,
  B1B2_TASK_ID,
  buildCapabilityId,
  buildMarketplaceCatalog,
  correlationKeysFor,
  type MarketplaceBuildInput,
} from "../src/marketplace/catalog.ts";
import { classifyMarketplaceCategories } from "../src/marketplace/classify.ts";
import { MARKETPLACE_CATEGORIES } from "../src/marketplace/categories.ts";
import type {
  ProviderCatalogDocument,
  ProviderVerificationDocument,
} from "../src/providers/types.ts";

const SNAPSHOT = "2026-11-20T12:00:00.000Z";

function syntheticProviderCatalog(): ProviderCatalogDocument {
  return {
    schemaVersion: "1.0",
    mode: "READ_ONLY / NO_SIGNING",
    snapshotAsOf: SNAPSHOT,
    source: {
      registryEvidencePath: "synthetic://registry",
      metadataEvidencePath: "synthetic://metadata",
      registryCapturedAt: SNAPSHOT,
      metadataCapturedAt: SNAPSHOT,
    },
    providerCount: 1,
    providers: [
      {
        schemaVersion: "1.0",
        providerId: "eip155:8453/0xabc/1",
        origin: "external",
        identity: {
          registryChainId: 8453,
          registryAddress: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
          agentId: "1",
          owner: null,
          agentWallet: null,
          tokenURI: null,
          observedAtBlock: "1",
          observedAt: SNAPSHOT,
        },
        registration: {
          uri: "https://example.test/meta.json",
          fetchStatus: "success",
          metadataHash: "aa",
          advertisedName: "Synthetic Agent",
          advertisedDescription: "synthetic fixture agent",
          operatorEvidenceIds: [],
        },
        services: [
          {
            serviceId: "openapi-synth",
            endpointUrl: "https://example.test/openapi.json",
            method: "OTHER",
            description: "OpenAPI developer surface",
            claimedTaskTypes: [],
            endpointStatus: "notChecked",
            requestSchemaStatus: "notChecked",
          },
          {
            serviceId: "research-intel-market",
            endpointUrl: "https://example.test/v1/intel/market",
            method: "OTHER",
            description: "Agent intelligence capability market map",
            claimedTaskTypes: [],
            endpointStatus: "notChecked",
            requestSchemaStatus: "notChecked",
          },
        ],
        payment: {
          x402Advertised: true,
          advertisedNetworks: ["eip155:84532"],
          observedOffers: [],
        },
        compatibility: {
          taskType: "wallet-activity-summary",
          taskVersion: "1.0",
          requestSchemaStatus: "notChecked",
          responseSchemaStatus: "notChecked",
          paymentStatus: "notChecked",
        },
        operational: {
          lastCheckedAt: null,
          lastErrorCode: null,
          evidenceIds: [],
        },
      },
    ],
  };
}

function syntheticVerification(): ProviderVerificationDocument {
  return {
    schemaVersion: "1.0",
    mode: "READ_ONLY / NO_SIGNING",
    snapshotAsOf: SNAPSHOT,
    maxSupportedMilestone: "metadataValidated",
    evidenceCount: 0,
    verificationCount: 1,
    evidences: [],
    verifications: [
      {
        providerId: "eip155:8453/0xabc/1",
        serviceId: "provider",
        taskType: "wallet-activity-summary",
        taskVersion: "1.0",
        checks: {
          registryIdentity: {
            result: "passed",
            checkedAt: SNAPSHOT,
            evidenceIds: [],
          },
          registrationMetadata: {
            result: "passed",
            checkedAt: SNAPSHOT,
            evidenceIds: [],
          },
          endpointReachability: {
            result: "notChecked",
            checkedAt: null,
            evidenceIds: [],
          },
          taskRequestCompatibility: {
            result: "notChecked",
            checkedAt: null,
            evidenceIds: [],
          },
          taskResponseCompatibility: {
            result: "notChecked",
            checkedAt: null,
            evidenceIds: [],
          },
          x402Challenge: {
            result: "notChecked",
            checkedAt: null,
            evidenceIds: [],
          },
          paymentPolicy: {
            result: "notChecked",
            checkedAt: null,
            evidenceIds: [],
          },
          paidExecution: {
            result: "notChecked",
            checkedAt: null,
            evidenceIds: [],
          },
        },
        derivedMilestone: "metadataValidated",
        availability: "unknown",
        evaluatedAt: SNAPSHOT,
      },
    ],
  };
}

function syntheticInput(): MarketplaceBuildInput {
  return {
    providerCatalog: syntheticProviderCatalog(),
    providerVerification: syntheticVerification(),
    discoveryInspection: {
      evidences: [
        {
          discoveryId: "DISC-SYNTH",
          provider: "Synthetic Agent",
          status: "success",
          documentSummary: {
            name: "Synthetic Agent",
            skills: [
              {
                id: "synth-research-report",
                name: "Research Report",
                description: "Finished research and diligence reports",
                tags: ["research", "reports", "filings"],
              },
              {
                id: "synth-pdf-render",
                name: "PDF Render",
                description: "Render a PDF document from HTML content",
                tags: ["pdf", "document", "content"],
              },
            ],
          },
        },
      ],
    },
    agent402Catalog: {
      provider: "Synthetic Agent",
      summary: { observedAt: SNAPSHOT },
      resources: [
        {
          resourceId: "SYNTH:0:GET:https://example.test/api/onchain-sql-schema",
          sourceDiscoveryId: "CATALOG-SYNTH",
          provider: "Synthetic Agent",
          url: "https://example.test/api/onchain-sql-schema",
          sanitizedUrl: "https://example.test/api/onchain-sql-schema",
          method: "GET",
          description: "On-chain SQL schema lookup",
          sameHostClaim: true,
          inspectionStatus: "notChecked",
          categories: ["blockchainData"],
          taskRelevance: "potentiallyRelated",
          taskRelevanceNotes: "synthetic",
          adapterNeeds: null,
          paymentAssessment: "insufficientInformation",
          paymentNotes: "synthetic",
          urlSafety: {
            ok: true,
            scheme: "https",
            hasCredentials: false,
            hasPathTemplate: false,
            hasQuery: false,
            hasFragment: false,
            literalIpHost: false,
            literalIpBlocked: false,
            hasSecretQuery: false,
            methodKnown: true,
            methodSafeGetCandidate: true,
            notes: [],
          },
          family: "/api/onchain-sql-schema",
          fixtureKind: "synthetic",
          duplicateUrl: false,
          duplicateId: false,
        },
        {
          resourceId: "SYNTH:1:METHOD_UNSPECIFIED:https://example.test/api/uuid",
          sourceDiscoveryId: "CATALOG-SYNTH",
          provider: "Synthetic Agent",
          url: "https://example.test/api/uuid",
          sanitizedUrl: "https://example.test/api/uuid",
          method: null,
          description: null,
          sameHostClaim: true,
          inspectionStatus: "notChecked",
          categories: ["developerInfrastructure"],
          taskRelevance: "unrelated",
          taskRelevanceNotes: "synthetic",
          adapterNeeds: null,
          paymentAssessment: "insufficientInformation",
          paymentNotes: "synthetic",
          urlSafety: {
            ok: true,
            scheme: "https",
            hasCredentials: false,
            hasPathTemplate: false,
            hasQuery: false,
            hasFragment: false,
            literalIpHost: false,
            literalIpBlocked: false,
            hasSecretQuery: false,
            methodKnown: false,
            methodSafeGetCandidate: false,
            notes: [],
          },
          family: "/api/uuid",
          fixtureKind: "synthetic",
          duplicateUrl: false,
          duplicateId: false,
        },
      ],
    },
    sourcePaths: {
      providerCatalog: "synthetic://provider-catalog",
      providerVerification: "synthetic://provider-verification",
      discoveryInspection: "synthetic://discovery",
      agent402Catalog: "synthetic://agent402",
    },
    snapshotAsOf: SNAPSHOT,
  };
}

describe("marketplace categories", () => {
  it("exposes curated categories including other fallback", () => {
    expect(MARKETPLACE_CATEGORIES.map((c) => c.id)).toEqual([
      "research-intelligence",
      "data-analytics",
      "content-documents",
      "developer-tools",
      "other",
    ]);
  });

  it("classifies multi-category and preserves fallback", () => {
    const cats = classifyMarketplaceCategories({
      name: "research pdf report",
      description: "research diligence PDF document",
      tags: ["research", "pdf"],
    });
    expect(cats).toContain("research-intelligence");
    expect(cats).toContain("content-documents");
    expect(
      classifyMarketplaceCategories({ name: "zzz-unknown-thing" }),
    ).toEqual(["other"]);
  });
});

describe("capability id determinism + collisions", () => {
  it("is deterministic and handles collisions", () => {
    const used = new Set<string>();
    const a = buildCapabilityId("p", "s", used);
    const used2 = new Set<string>();
    const b = buildCapabilityId("p", "s", used2);
    expect(a).toBe(b);
    used.add(a);
    const c = buildCapabilityId("p", "s", used);
    expect(c).not.toBe(a);
    expect(c.startsWith(a)).toBe(true);
  });

  it("correlation keys omit name-only merges", () => {
    const keys = correlationKeysFor({
      providerKey: "Agent402",
      url: "https://example.test/api/x",
      skillId: "catalog-find",
    });
    expect(keys.some((k) => k.startsWith("url:"))).toBe(true);
    expect(keys.some((k) => k.startsWith("skill:"))).toBe(true);
    expect(keys.every((k) => !k.startsWith("name:"))).toBe(true);
  });
});

describe("hybrid catalog merge", () => {
  it("counts agents/skills/resources/capabilities separately and keeps B1/B2 planned", () => {
    const input = syntheticInput();
    const { catalog, categorySummary, catalogJson } =
      buildMarketplaceCatalog(input);
    const again = buildMarketplaceCatalog(input);
    expect(again.catalogJson).toBe(catalogJson);

    expect(catalog.counts.skills).toBe(2);
    expect(catalog.counts.resources).toBe(2);
    expect(catalog.counts.erc8004Services).toBe(2);
    expect(catalog.counts.planned).toBe(1);
    expect(catalog.counts.capabilities).toBe(
      catalog.counts.skills +
        catalog.counts.resources +
        catalog.counts.erc8004Services +
        catalog.counts.planned,
    );
    // Counts are separate fields (620 resources ≠ 620 agents in production evidence).
    expect(catalog.counts).toEqual(
      expect.objectContaining({
        skills: 2,
        resources: 2,
        erc8004Services: 2,
        planned: 1,
      }),
    );
    expect(Object.keys(catalog.counts)).toEqual(
      expect.arrayContaining([
        "agentProfiles",
        "capabilities",
        "skills",
        "resources",
        "erc8004Services",
        "planned",
      ]),
    );

    expect(catalog.b1b2Reference.taskId).toBe(B1B2_TASK_ID);
    expect(catalog.b1b2Reference.categoryId).toBe("data-analytics");
    expect(catalog.b1b2Reference.verified).toBe(false);
    expect(catalog.b1b2Reference.capabilityId).toBe(B1B2_PLANNED_CAPABILITY_ID);

    const planned = catalog.capabilities.find(
      (c) => c.capabilityId === B1B2_PLANNED_CAPABILITY_ID,
    );
    expect(planned?.categories).toContain("data-analytics");
    expect(planned?.provenance).toBe("agenthire-operated");
    expect(planned?.verification.derivedMilestone).toBe("unverified");

    // No invented verified flag on derived view
    for (const cap of catalog.capabilities) {
      expect(cap.verification.endpointStatus).not.toBe("verified");
    }

    // Original labels preserved on skills
    const skill = catalog.capabilities.find(
      (c) => c.serviceKey === "skill:synth-research-report",
    );
    expect(skill?.originalLabels).toEqual(
      expect.arrayContaining(["synth-research-report", "research"]),
    );

    expect(categorySummary.categories).toHaveLength(5);
    expect(catalog.hireJobBoundary.implemented).toBe(false);
  });

  it("does not silently merge capability rows by display name alone", () => {
    const input = syntheticInput();
    const { catalog } = buildMarketplaceCatalog(input);
    const byName = catalog.capabilities.filter((c) =>
      c.displayName.toLowerCase().includes("research"),
    );
    // Multiple research-ish rows remain distinct capabilityIds
    const ids = new Set(byName.map((c) => c.capabilityId));
    expect(ids.size).toBe(byName.length);
  });
});

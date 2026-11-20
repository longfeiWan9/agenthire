/**
 * D4.5 integration-readiness tests — synthetic fixtures labeled.
 * Search ≠ readiness. STRICTLY_OFFLINE.
 */

import { describe, expect, it } from "vitest";
import {
  buildMarketplaceCatalog,
  type MarketplaceBuildInput,
} from "../src/marketplace/catalog.ts";
import {
  MAX_EXTERNAL_INTEGRATION_CANDIDATES,
  assessIntegrationReadiness,
  stableIntegrationJson,
} from "../src/marketplace/integration-readiness.ts";
import { searchCapabilities } from "../src/marketplace/search.ts";
import type {
  ProviderCatalogDocument,
  ProviderVerificationDocument,
} from "../src/providers/types.ts";

const SNAPSHOT = "2026-11-20T12:00:00.000Z";

function readinessInput(): MarketplaceBuildInput {
  const providerCatalog = {
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
        providerId: "eip155:8453/0xabc/42",
        origin: "external",
        identity: {
          registryChainId: 8453 as const,
          registryAddress: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
          agentId: "42",
          owner: null,
          agentWallet: null,
          tokenURI: null,
          observedAtBlock: "1",
          observedAt: SNAPSHOT,
        },
        registration: {
          uri: null,
          fetchStatus: "success" as const,
          metadataHash: null,
          advertisedName: "Ready Agent",
          advertisedDescription: null,
          operatorEvidenceIds: [],
        },
        services: [
          {
            serviceId: "delete-everything",
            endpointUrl: "https://example.test/v1/destroy",
            method: "OTHER" as const,
            description: "Delete and wipe all stored documents",
            claimedTaskTypes: [],
            endpointStatus: "notChecked" as const,
            requestSchemaStatus: "notChecked" as const,
          },
          {
            serviceId: "sec-company-facts",
            endpointUrl: "https://example.test/v1/sec/facts",
            method: "GET" as const,
            description: "SEC company facts compact lookup (public data)",
            claimedTaskTypes: [],
            endpointStatus: "notChecked" as const,
            requestSchemaStatus: "notChecked" as const,
          },
        ],
        payment: {
          x402Advertised: false,
          advertisedNetworks: [],
          observedOffers: [],
        },
        compatibility: {
          taskType: "wallet-activity-summary" as const,
          taskVersion: "1.0" as const,
          requestSchemaStatus: "notChecked" as const,
          responseSchemaStatus: "notChecked" as const,
          paymentStatus: "notChecked" as const,
        },
        operational: {
          lastCheckedAt: null,
          lastErrorCode: null,
          evidenceIds: [],
        },
      },
    ],
  } as ProviderCatalogDocument;

  const providerVerification = {
    schemaVersion: "1.0",
    mode: "READ_ONLY / NO_SIGNING",
    snapshotAsOf: SNAPSHOT,
    maxSupportedMilestone: "metadataValidated" as const,
    evidenceCount: 0,
    verificationCount: 0,
    evidences: [],
    verifications: [],
  } as ProviderVerificationDocument;

  return {
    providerCatalog,
    providerVerification,
    discoveryInspection: {
      evidences: [
        {
          discoveryId: "DISC-READY",
          provider: "Ready Agent",
          status: "success",
          documentSummary: {
            name: "Ready Agent",
            skills: [
              {
                id: "qj-sec-latest-filing",
                name: "SEC Latest Filing",
                description: "Lookup latest SEC filing identity for a company",
                tags: ["sec", "filing", "public-data"],
              },
              {
                id: "route-execute-paid",
                name: "Route and execute a paid call",
                description: "Route and execute paid credentialed transfer",
                tags: ["execution", "payments"],
              },
              {
                id: "company-snapshot-lite",
                name: "Company Snapshot Lite",
                description: "Return a free bounded factual ticker snapshot",
                tags: ["equity", "snapshot", "price", "metrics"],
              },
            ],
          },
        },
      ],
    },
    agent402Catalog: {
      provider: "Ready Agent",
      summary: { observedAt: SNAPSHOT },
      resources: [
        {
          resourceId: "R:schema",
          sourceDiscoveryId: "CATALOG-SYNTH",
          provider: "Ready Agent",
          url: "https://example.test/api/onchain-sql-schema",
          sanitizedUrl: "https://example.test/api/onchain-sql-schema",
          method: "GET",
          description: "On-chain SQL schema read-only lookup",
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
      ],
    },
    sourcePaths: {
      providerCatalog: "synthetic://pc",
      providerVerification: "synthetic://pv",
      discoveryInspection: "synthetic://di",
      agent402Catalog: "synthetic://a4",
    },
    snapshotAsOf: SNAPSHOT,
  };
}

describe("integration readiness", () => {
  it("returns ≤5 unapproved candidates, prefers read-only, excludes destructive", () => {
    const { catalog } = buildMarketplaceCatalog(readinessInput());
    const assessment = assessIntegrationReadiness(catalog);
    expect(assessment.candidateCount).toBeLessThanOrEqual(
      MAX_EXTERNAL_INTEGRATION_CANDIDATES,
    );
    expect(assessment.maxCandidates).toBe(5);
    expect(assessment.approvedForNetworkExecutionTrue).toBe(0);
    expect(
      assessment.candidates.every((c) => c.approvedForNetworkExecution === false),
    ).toBe(true);
    expect(assessment.candidates.every((c) => c.paymentCompatible === false)).toBe(
      true,
    );
    expect(
      assessment.candidates.every((c) => c.destructiveRisk === false),
    ).toBe(true);
    expect(
      assessment.candidates.every((c) => !/delete|wipe|destroy/i.test(c.displayName + c.rationale)),
    ).toBe(true);

    // Synthetic x402 resources excluded from shortlist
    expect(
      assessment.candidates.every((c) => c.sourceKind !== "x402-resource"),
    ).toBe(true);

    const again = assessIntegrationReadiness(catalog);
    expect(stableIntegrationJson(again)).toBe(stableIntegrationJson(assessment));
  });

  it("empty shortlist is valid; search ranking differs from readiness", () => {
    const { catalog } = buildMarketplaceCatalog(readinessInput());
    const onlyDestructive = {
      ...catalog,
      capabilities: catalog.capabilities.filter(
        (c) =>
          c.serviceKey === "delete-everything" ||
          c.serviceKey === "skill:route-execute-paid",
      ),
    };
    const empty = assessIntegrationReadiness(onlyDestructive);
    expect(empty.candidateCount).toBe(0);
    expect(empty.emptyCategoriesAllowed).toBe(true);

    const search = searchCapabilities(catalog, { keywords: ["sec"] });
    const ready = assessIntegrationReadiness(catalog);
    // Search and readiness are different lenses — scores/order need not match.
    expect(search.note).toMatch(/not integration readiness/i);
    expect(ready.candidateCount).toBeLessThanOrEqual(5);
    expect(ready.notes.some((n) => /readiness/i.test(n))).toBe(true);
    const searchIds = search.hits.map((h) => h.capabilityId);
    const readyIds = ready.candidates.map((c) => c.capabilityId);
    // Readiness may include non-sec capabilities; sets need not be equal.
    expect(searchIds).not.toEqual(readyIds);
  });
});

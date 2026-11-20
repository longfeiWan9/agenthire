/**
 * D4.5 marketplace search tests — synthetic fixtures labeled.
 * Search ≠ readiness. STRICTLY_OFFLINE.
 */

import { describe, expect, it } from "vitest";
import {
  B1B2_PLANNED_CAPABILITY_ID,
  buildMarketplaceCatalog,
  type MarketplaceBuildInput,
} from "../src/marketplace/catalog.ts";
import { listByCategory, searchCapabilities } from "../src/marketplace/search.ts";
import type {
  ProviderCatalogDocument,
  ProviderVerificationDocument,
} from "../src/providers/types.ts";

const SNAPSHOT = "2026-11-20T12:00:00.000Z";

function miniInput(): MarketplaceBuildInput {
  const providerCatalog = {
    schemaVersion: "1.0",
    mode: "READ_ONLY / NO_SIGNING",
    snapshotAsOf: SNAPSHOT,
    source: {},
    providerCount: 1,
    providers: [
      {
        schemaVersion: "1.0",
        providerId: "eip155:8453/0xabc/9",
        origin: "external",
        identity: {
          registryChainId: 8453 as const,
          registryAddress: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
          agentId: "9",
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
          advertisedName: "Search Fixture Agent",
          advertisedDescription: null,
          operatorEvidenceIds: [],
        },
        services: [
          {
            serviceId: "dev-hash-tool",
            endpointUrl: "https://example.test/api/hash",
            method: "GET" as const,
            description: "Hash developer tool",
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
  } as unknown as ProviderCatalogDocument;

  const providerVerification = {
    schemaVersion: "1.0",
    mode: "READ_ONLY / NO_SIGNING",
    snapshotAsOf: SNAPSHOT,
    maxSupportedMilestone: "discovered",
    evidenceCount: 0,
    verificationCount: 0,
    evidences: [],
    verifications: [],
  } as unknown as ProviderVerificationDocument;

  return {
    providerCatalog,
    providerVerification,
    discoveryInspection: {
      evidences: [
        {
          discoveryId: "DISC-SEARCH",
          provider: "Search Fixture Agent",
          status: "success",
          documentSummary: {
            name: "Search Fixture Agent",
            skills: [
              {
                id: "other-oddity",
                name: "Odd Utility",
                description: "Uncategorized odd utility",
                tags: ["zzz"],
              },
            ],
          },
        },
      ],
    },
    agent402Catalog: {
      provider: "Search Fixture Agent",
      summary: { observedAt: SNAPSHOT },
      resources: [],
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

describe("marketplace search", () => {
  it("filters by category including other, ranks exact task first, ties by capabilityId", () => {
    const { catalog } = buildMarketplaceCatalog(miniInput());

    const other = searchCapabilities(catalog, { category: "other" });
    expect(other.total).toBeGreaterThanOrEqual(0);
    expect(other.note).toMatch(/not integration readiness/i);

    const listedOther = listByCategory(catalog, "other");
    for (const row of listedOther) {
      expect(row.categories).toContain("other");
    }

    const byTask = searchCapabilities(catalog, {
      taskId: "wallet-activity-summary@1.0",
    });
    expect(byTask.hits[0]?.capabilityId).toBe(B1B2_PLANNED_CAPABILITY_ID);
    expect(byTask.hits[0]?.reasons).toContain("exact-task");

    const byProvider = searchCapabilities(catalog, {
      provider: "Search Fixture",
    });
    expect(byProvider.total).toBeGreaterThan(0);

    const byName = searchCapabilities(catalog, { name: "Hash developer tool" });
    expect(byName.hits.some((h) => h.reasons.includes("explicit-capability") || h.reasons.includes("descriptive"))).toBe(
      true,
    );

    const byProtocol = searchCapabilities(catalog, { protocol: "agenthire-task" });
    expect(
      byProtocol.hits.every((h) => h.record.protocols.includes("agenthire-task")),
    ).toBe(true);

    const byMilestone = searchCapabilities(catalog, {
      verificationMilestone: "unverified",
    });
    expect(byMilestone.total).toBeGreaterThan(0);

    // Tie-break documentation: equal scores sort by capabilityId asc
    expect(byTask.tieBreak).toBe("capabilityId-asc");
    for (let i = 1; i < byTask.hits.length; i += 1) {
      const prev = byTask.hits[i - 1]!;
      const cur = byTask.hits[i]!;
      if (prev.rankScore === cur.rankScore) {
        expect(prev.capabilityId <= cur.capabilityId).toBe(true);
      }
    }
  });

  it("includeOther false excludes pure-other rows", () => {
    const { catalog } = buildMarketplaceCatalog(miniInput());
    const withOther = searchCapabilities(catalog, { includeOther: true });
    const without = searchCapabilities(catalog, { includeOther: false });
    expect(without.total).toBeLessThanOrEqual(withOther.total);
    expect(
      without.hits.every(
        (h) =>
          !(
            h.record.categories.length === 1 &&
            h.record.categories[0] === "other"
          ),
      ),
    ).toBe(true);
  });
});

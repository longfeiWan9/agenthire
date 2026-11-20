import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MVP_TASK_ID,
  assessCatalog,
  assessServiceForInspection,
  assessStaticUrl,
  assessTaskRelevance,
  buildInspectionManifest,
  isDiscoveryDocumentPath,
  sanitizeEndpointForArtifact,
} from "../src/providers/inspection-policy.ts";
import { stableStringify } from "../src/providers/catalog.ts";
import type { ProviderCatalogDocument, ProviderRecord, ProviderService } from "../src/providers/types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function baseProvider(
  overrides: Partial<ProviderRecord> = {},
): ProviderRecord {
  return {
    schemaVersion: "1.0",
    providerId: "eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/19353",
    origin: "external",
    identity: {
      registryChainId: 8453,
      registryAddress: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      agentId: "19353",
      owner: "0xe9D45C3F847a7d2aE4efD7D6Da491f8a7E19b9F0",
      agentWallet: "0xB9148CD4157AD89691f86b762E9e1A166b788D45",
      tokenURI: "https://onchainagentintel.io/agent.json",
      observedAtBlock: "59445246",
      observedAt: "2026-11-19T09:10:23.986Z",
    },
    registration: {
      uri: "https://onchainagentintel.io/agent.json",
      fetchStatus: "success",
      metadataHash: "abc",
      advertisedName: "Agent Zero",
      advertisedDescription: "desc",
      operatorEvidenceIds: [],
    },
    services: [],
    payment: {
      x402Advertised: true,
      advertisedNetworks: [],
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
      lastCheckedAt: "2026-11-19T09:45:48.912Z",
      lastErrorCode: null,
      evidenceIds: ["ev-registryRead-test", "ev-metadataFetch-test"],
    },
    ...overrides,
  };
}

function service(
  overrides: Partial<ProviderService> & Pick<ProviderService, "serviceId" | "endpointUrl">,
): ProviderService {
  return {
    method: "OTHER",
    description: null,
    claimedTaskTypes: [],
    endpointStatus: "notChecked",
    requestSchemaStatus: "notChecked",
    ...overrides,
  };
}

describe("sanitizeEndpointForArtifact", () => {
  it("strips embedded credentials", () => {
    expect(
      sanitizeEndpointForArtifact("https://user:secret@example.com/path"),
    ).toBe("https://example.com/path");
  });

  it("redacts sensitive query keys", () => {
    expect(
      sanitizeEndpointForArtifact(
        "https://example.com/x?api_key=abc&keep=1&token=t",
      ),
    ).toBe("https://example.com/x?api_key=%5Bredacted%5D&keep=1&token=%5Bredacted%5D");
  });

  it("does not invent values for invalid URLs", () => {
    expect(sanitizeEndpointForArtifact("not a url")).toBe("[invalid-url]");
  });
});

describe("assessStaticUrl", () => {
  it("accepts structurally safe HTTPS hostname URLs", () => {
    const a = assessStaticUrl("https://agent402.tools/openapi.json");
    expect(a.ok).toBe(true);
    expect(a.reasonCodes).toContain("staticUrlStructurallySafe");
  });

  it("rejects non-HTTPS schemes", () => {
    const a = assessStaticUrl("http://example.com/x");
    expect(a.ok).toBe(false);
    expect(a.reasonCodes).toContain("schemeNotHttps");
  });

  it("rejects embedded credentials", () => {
    const a = assessStaticUrl("https://u:p@example.com/x");
    expect(a.ok).toBe(false);
    expect(a.reasonCodes).toContain("embeddedCredentials");
  });

  it("rejects private literal IPv4 hosts", () => {
    for (const host of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.1.1"]) {
      const a = assessStaticUrl(`https://${host}/x`);
      expect(a.ok).toBe(false);
      expect(a.reasonCodes).toContain("literalBlockedIp");
    }
  });

  it("rejects private / mapped IPv6 literal hosts", () => {
    const a = assessStaticUrl("https://[::1]/x");
    expect(a.ok).toBe(false);
    expect(a.reasonCodes).toContain("literalBlockedIp");

    const mapped = assessStaticUrl("https://[::ffff:127.0.0.1]/x");
    expect(mapped.ok).toBe(false);
    expect(mapped.reasonCodes).toContain("literalBlockedIp");
  });

  it("flags public literal IP hosts without treating them as hostname discovery", () => {
    const a = assessStaticUrl("https://8.8.8.8/openapi.json");
    expect(a.ok).toBe(true);
    expect(a.literalIpHost).toBe(true);
    expect(a.reasonCodes).toContain("literalPublicIpHost");
  });

  it("rejects fragments and control characters", () => {
    const frag = assessStaticUrl("https://example.com/x#frag");
    expect(frag.ok).toBe(false);
    expect(frag.reasonCodes).toContain("urlFragmentPresent");

    const ctrl = assessStaticUrl("https://example.com/\u0001x");
    expect(ctrl.ok).toBe(false);
    expect(ctrl.reasonCodes).toContain("controlCharacters");
  });

  it("flags unresolved path templates and query strings", () => {
    const tmpl = assessStaticUrl("https://example.com/v1/agent/{agent_id}");
    expect(tmpl.ok).toBe(true);
    expect(tmpl.hasPathTemplate).toBe(true);
    expect(tmpl.reasonCodes).toContain("pathTemplateUnresolved");

    const q = assessStaticUrl("https://example.com/v1?x=1");
    expect(q.hasQuery).toBe(true);
    expect(q.reasonCodes).toContain("queryStringPresent");
  });
});

describe("assessTaskRelevance", () => {
  it("requires exact task id for explicitMatch", () => {
    expect(assessTaskRelevance([MVP_TASK_ID]).relevance).toBe("explicitMatch");
    expect(assessTaskRelevance(["wallet-activity-summary"]).relevance).toBe(
      "explicitMatch",
    );
  });

  it("does not treat wallet analytics wording as explicitMatch", () => {
    expect(assessTaskRelevance(["wallet-analytics"]).relevance).toBe(
      "potentiallyRelated",
    );
    expect(assessTaskRelevance([]).relevance).toBe("unknown");
    expect(assessTaskRelevance(["market-map"]).relevance).toBe("unrelated");
  });
});

describe("discovery path helpers", () => {
  it("recognizes only exact discovery document paths", () => {
    expect(isDiscoveryDocumentPath("/.well-known/agent-card.json")).toBe(true);
    expect(isDiscoveryDocumentPath("/.well-known/x402")).toBe(true);
    expect(isDiscoveryDocumentPath("/openapi.json")).toBe(true);
    expect(isDiscoveryDocumentPath("/v1/intel")).toBe(false);
    expect(isDiscoveryDocumentPath("/mcp")).toBe(false);
  });
});

describe("assessServiceForInspection policy", () => {
  it("marks OTHER discovery documents eligibleForReview with proposed GET", () => {
    const provider = baseProvider();
    const a = assessServiceForInspection(
      provider,
      service({
        serviceId: "openapi-test",
        endpointUrl: "https://agent402.tools/openapi.json",
        method: "OTHER",
      }),
    );
    expect(a.planningStatus).toBe("eligibleForReview");
    expect(a.proposedProbeMethod).toBe("GET");
    expect(a.approvedForNetworkExecution).toBe(false);
    expect(a.reasonCodes).toContain("methodOtherNotGet");
    expect(a.reasonCodes).toContain("discoveryDocumentCandidate");
    expect(a.reasonCodes).toContain("x402ProviderScopeOnly");
    expect(a.exactRouteScope).toBe("https://agent402.tools/openapi.json");
  });

  it("does not auto-treat OTHER API surfaces as GET", () => {
    const a = assessServiceForInspection(
      baseProvider(),
      service({
        serviceId: "intel",
        endpointUrl: "https://api.onchainagentintel.io/v1/intel",
        method: "OTHER",
      }),
    );
    expect(a.planningStatus).toBe("needsMoreInformation");
    expect(a.proposedProbeMethod).toBeNull();
    expect(a.reasonCodes).toContain("methodOtherNotGet");
    expect(a.reasonCodes).toContain("nonDiscoverySurface");
  });

  it("does not treat POST as auto-safe", () => {
    const a = assessServiceForInspection(
      baseProvider({ payment: { x402Advertised: false, advertisedNetworks: [], observedOffers: [] } }),
      service({
        serviceId: "post-svc",
        endpointUrl: "https://example.com/task",
        method: "POST",
        claimedTaskTypes: [MVP_TASK_ID],
      }),
    );
    expect(a.planningStatus).toBe("needsMoreInformation");
    expect(a.reasonCodes).toContain("methodPostNotAutoSafe");
    expect(a.taskRelevance).toBe("explicitMatch");
  });

  it("rejects unsafe URLs", () => {
    const a = assessServiceForInspection(
      baseProvider(),
      service({
        serviceId: "bad",
        endpointUrl: "http://127.0.0.1/admin",
        method: "GET",
      }),
    );
    expect(a.planningStatus).toBe("rejected");
    expect(a.approvedForNetworkExecution).toBe(false);
  });

  it("requires more information for unresolved templates", () => {
    const a = assessServiceForInspection(
      baseProvider(),
      service({
        serviceId: "tmpl",
        endpointUrl: "https://api.example.com/v1/agent/{agent_id}",
        method: "OTHER",
      }),
    );
    expect(a.planningStatus).toBe("needsMoreInformation");
    expect(a.reasonCodes).toContain("pathTemplateUnresolved");
  });
});

describe("catalog evidence determinism", () => {
  const catalogPath = join(ROOT, "docs/evidence/provider-catalog.json");
  const catalogJson = readFileSync(catalogPath, "utf8");
  const catalog = JSON.parse(catalogJson) as ProviderCatalogDocument;
  const catalogSha = sha256Hex(catalogJson);

  it("assesses all 29 Day-3 services offline", () => {
    const assessments = assessCatalog(catalog.providers);
    expect(catalog.providerCount).toBe(3);
    expect(assessments).toHaveLength(29);
    expect(assessments.every((a) => a.approvedForNetworkExecution === false)).toBe(
      true,
    );
    expect(assessments.every((a) => a.catalogMethod === "OTHER")).toBe(true);
    expect(assessments.every((a) => a.taskRelevance === "unknown")).toBe(true);
  });

  it("builds a dual-run byte-identical manifest proposal", () => {
    const build = () =>
      buildInspectionManifest({
        providers: catalog.providers,
        catalogPath: "docs/evidence/provider-catalog.json",
        catalogSnapshotAsOf: catalog.snapshotAsOf,
        catalogSha256: catalogSha,
      });

    const a = stableStringify(build());
    const b = stableStringify(build());
    expect(a).toBe(b);
    expect(sha256Hex(a)).toBe(sha256Hex(b));

    const doc = build();
    expect(doc.summary.serviceCount).toBe(29);
    expect(doc.summary.approvedForNetworkExecutionTrue).toBe(0);
    expect(doc.summary.eligibleForReview).toBe(6);
    expect(doc.summary.needsMoreInformation).toBe(23);
    expect(doc.summary.rejected).toBe(0);
    expect(
      doc.entries.every((e) => e.approvedForNetworkExecution === false),
    ).toBe(true);
    expect(
      doc.entries.filter((e) => e.shortlistedForHumanReview).map((e) => e.serviceId).sort(),
    ).toEqual(
      [
        "a2a-684fdeab4efe67f7",
        "a2a-8889450caf4353f8",
        "a2a-b0315e364f73a4a6",
        "openapi-c6e4e0d8beb343e8",
        "x402-4b0816487b68c62a",
        "x402-b002ca7b39879b45",
      ].sort(),
    );
  });

  it("never claims network approval from provider-level x402Advertised", () => {
    const agentZero = catalog.providers.find((p) => p.identity.agentId === "19353")!;
    expect(agentZero.payment.x402Advertised).toBe(true);
    const intel = assessServiceForInspection(
      agentZero,
      agentZero.services.find((s) => s.serviceId.startsWith("x402-"))!,
    );
    expect(intel.reasonCodes).toContain("x402ProviderScopeOnly");
    expect(intel.planningStatus).toBe("needsMoreInformation");
    expect(intel.approvedForNetworkExecution).toBe(false);
  });
});

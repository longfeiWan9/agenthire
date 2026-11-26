import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeResourceCatalog,
  assessAdvertisedPaymentClaim,
  assessResourceTaskRelevance,
  buildInspectionShortlist,
  buildShortlistDocument,
  classifyResourceCategories,
  determineCatalogCoverage,
  loadCatalogSourcesFromDiscoveryEvidence,
  normalizeAdvertisedResource,
  scoreResourceCandidate,
  sha256Hex,
  stableStringify,
  type CatalogSourceEvidence,
  type RawAdvertisedResourceInput,
} from "../src/providers/resource-analysis.ts";
import {
  parseAnalyzeResourcesArgs,
  runAnalyzeResources,
} from "../src/scripts/analyze-resources.ts";
import {
  APPROVED_PAYMENT_NETWORK,
  APPROVED_SEPOLIA_TEST_USDC,
} from "../src/x402/challenge-types.ts";

const REPO_ROOT = join(import.meta.dirname, "..");
const EVIDENCE_PATH = join(
  REPO_ROOT,
  "docs/day4/evidence/x402-discovery-inspection.json",
);

function synthetic(
  partial: RawAdvertisedResourceInput,
): RawAdvertisedResourceInput {
  return { fixtureKind: "synthetic", ...partial };
}

function sourceFrom(
  id: string,
  resources: readonly RawAdvertisedResourceInput[],
  overrides?: Partial<CatalogSourceEvidence>,
): CatalogSourceEvidence {
  return {
    discoveryId: id,
    provider: overrides?.provider ?? "SyntheticProvider",
    approvedUrl:
      overrides?.approvedUrl ?? "https://example.test/.well-known/x402",
    contentSha256: overrides?.contentSha256 ?? null,
    byteLength: overrides?.byteLength ?? null,
    reportedResourceCount:
      overrides?.reportedResourceCount ?? resources.length,
    recoverableResourceCount:
      overrides?.recoverableResourceCount ?? resources.length,
    truncated: overrides?.truncated ?? false,
    recognitionKind: overrides?.recognitionKind ?? "legacyResourceList",
    x402Version: overrides?.x402Version ?? 2,
    fullBodyRecoverable: overrides?.fullBodyRecoverable ?? true,
    sourcePath: overrides?.sourcePath ?? "synthetic://fixture",
    resources,
  };
}

describe("resource-analysis offline catalog coverage", () => {
  it("labels live evidence as sampleOnly (25 recoverable of 620 reported)", () => {
    const fileJson = readFileSync(EVIDENCE_PATH, "utf8");
    const sources = loadCatalogSourcesFromDiscoveryEvidence(
      fileJson,
      "docs/day4/evidence/x402-discovery-inspection.json",
    );
    const analysis = analyzeResourceCatalog(sources);
    expect(analysis.coverage.coverage).toBe("sampleOnly");
    expect(analysis.coverage.reportedResourceCount).toBe(620);
    expect(analysis.coverage.recoverableResourceCount).toBe(25);
    expect(analysis.resources).toHaveLength(25);
    expect(analysis.coverage.sampleLimitObserved).toBe(25);
    const agent = analysis.coverage.sources.find(
      (s) => s.discoveryId === "XDISC-001",
    );
    expect(agent?.truncated).toBe(true);
    expect(agent?.fullBodyRecoverable).toBe(false);
    expect(agent?.contentSha256).toMatch(/^57182ef89b91/);
    // SHA alone ≠ full body recoverable
    expect(analysis.coverage.honestyNotes.some((n) => /SHA-256/i.test(n))).toBe(
      true,
    );
  });

  it("treats a complete local catalog as complete", () => {
    const resources = [
      synthetic({
        url: "https://example.test/v1/wallet-activity-summary",
        method: "POST",
        description:
          "wallet-activity-summary@1.0 with block range fromBlock/toBlock and receipt metrics",
        taskId: "wallet-activity-summary@1.0",
      }),
    ];
    const sources = [sourceFrom("SYN-COMPLETE", resources)];
    expect(determineCatalogCoverage(sources)).toBe("complete");
    const analysis = analyzeResourceCatalog(sources);
    expect(analysis.coverage.coverage).toBe("complete");
    expect(analysis.coverage.reportedResourceCount).toBe(1);
    expect(analysis.coverage.recoverableResourceCount).toBe(1);
  });

  it("records empty QuantJourney list without inventing entries", () => {
    const fileJson = readFileSync(EVIDENCE_PATH, "utf8");
    const sources = loadCatalogSourcesFromDiscoveryEvidence(
      fileJson,
      "docs/day4/evidence/x402-discovery-inspection.json",
    );
    const qj = sources.find((s) => s.discoveryId === "XDISC-002");
    expect(qj).toBeDefined();
    expect(qj!.reportedResourceCount).toBe(0);
    expect(qj!.recoverableResourceCount).toBe(0);
    expect(qj!.resources).toHaveLength(0);
  });

  it("separates reported vs recoverable counts under truncation", () => {
    const sample = [
      synthetic({ url: "https://example.test/a", method: "GET" }),
      synthetic({ url: "https://example.test/b", method: "GET" }),
    ];
    const sources = [
      sourceFrom("SYN-SAMPLE", sample, {
        reportedResourceCount: 100,
        recoverableResourceCount: 2,
        truncated: true,
        fullBodyRecoverable: false,
        contentSha256: "abc123",
      }),
    ];
    const analysis = analyzeResourceCatalog(sources);
    expect(analysis.coverage.coverage).toBe("sampleOnly");
    expect(analysis.coverage.reportedResourceCount).toBe(100);
    expect(analysis.coverage.recoverableResourceCount).toBe(2);
    expect(analysis.resources).toHaveLength(2);
  });
});

describe("resource normalization", () => {
  it("never defaults method to GET and keeps inspectionStatus notChecked", () => {
    const resource = normalizeAdvertisedResource(
      synthetic({ url: "https://example.test/api/x", description: "tool" }),
      { discoveryId: "SYN", provider: "Syn", index: 0 },
    );
    expect(resource.method).toBeNull();
    expect(resource.inspectionStatus).toBe("notChecked");
  });

  it("marks duplicate resource IDs and duplicate URLs", () => {
    const analysis = analyzeResourceCatalog([
      sourceFrom("SYN-DUP", [
        synthetic({
          resourceId: "same-id",
          url: "https://example.test/dup",
          method: "GET",
        }),
        synthetic({
          resourceId: "same-id",
          url: "https://example.test/dup",
          method: "POST",
        }),
        synthetic({
          resourceId: "other",
          url: "https://example.test/dup",
          method: "GET",
        }),
      ]),
    ]);
    expect(analysis.coverage.uniqueUrlCount).toBe(1);
    expect(analysis.coverage.uniqueMethodUrlCount).toBe(2);
    expect(analysis.resources.filter((r) => r.duplicateId)).toHaveLength(2);
    expect(analysis.resources.filter((r) => r.duplicateUrl)).toHaveLength(3);
  });

  it("flags path templates and unknown HTTP methods", () => {
    const templated = normalizeAdvertisedResource(
      synthetic({
        url: "https://example.test/wallets/{address}/activity",
        method: "GET",
      }),
      { discoveryId: "SYN", provider: "Syn", index: 0 },
    );
    expect(templated.urlSafety.hasPathTemplate).toBe(true);
    expect(templated.urlSafety.notes).toContain("pathTemplateUnresolved");

    const unknownMethod = normalizeAdvertisedResource(
      synthetic({
        url: "https://example.test/ok",
        method: "PURGE",
      }),
      { discoveryId: "SYN", provider: "Syn", index: 1 },
    );
    expect(unknownMethod.method).toBe("PURGE");
    expect(unknownMethod.urlSafety.methodKnown).toBe(false);
    expect(unknownMethod.urlSafety.notes).toContain("methodUnknown");
  });

  it("rejects unsafe URL literals and redacts secret-bearing URLs", () => {
    const blocked = normalizeAdvertisedResource(
      synthetic({
        url: "https://127.0.0.1/secret",
        method: "GET",
      }),
      { discoveryId: "SYN", provider: "Syn", index: 0 },
    );
    expect(blocked.urlSafety.ok).toBe(false);
    expect(blocked.urlSafety.literalIpBlocked).toBe(true);

    const secret = normalizeAdvertisedResource(
      synthetic({
        url: "https://example.test/api?api_key=supersecret&x=1",
        method: "GET",
      }),
      { discoveryId: "SYN", provider: "Syn", index: 1 },
    );
    expect(secret.sanitizedUrl).toMatch(/\[redacted\]|%5Bredacted%5D/i);
    expect(secret.sanitizedUrl).not.toContain("supersecret");
    expect(secret.urlSafety.hasSecretQuery).toBe(true);
  });
});

describe("classification and task relevance (§7)", () => {
  it("assigns categories and allows multiple categories", () => {
    const cats = classifyResourceCategories(
      synthetic({
        url: "https://example.test/api/hash",
        description: "hash utility",
      }),
    );
    expect(cats).toContain("developerInfrastructure");

    const multi = classifyResourceCategories(
      synthetic({
        url: "https://example.test/research/wallet-analytics",
        description: "research report over wallet analytics and blockchain receipts",
      }),
    );
    expect(multi.length).toBeGreaterThan(1);
    expect(multi).toEqual([...multi].sort());
  });

  it("classifies clearly unrelated developer utilities as unrelated", () => {
    const task = assessResourceTaskRelevance(
      synthetic({
        url: "https://agent402.tools/api/uuid",
        description: null,
      }),
    );
    expect(task.relevance).toBe("unrelated");
  });

  it("requires explicit task id + compatible behavior hints for explicitMatch", () => {
    const exact = assessResourceTaskRelevance(
      synthetic({
        url: "https://example.test/v1/wallet-activity-summary",
        method: "POST",
        taskId: "wallet-activity-summary@1.0",
        description:
          "Canonical wallet-activity-summary request/response with fromBlock/toBlock metrics schema",
      }),
    );
    expect(exact.relevance).toBe("explicitMatch");
  });

  it("marks adaptableCandidate only with concrete wallet/chain interface evidence", () => {
    const adaptable = assessResourceTaskRelevance(
      synthetic({
        url: "https://example.test/v1/address-transactions",
        method: "POST",
        description:
          "Returns wallet transactions and eth_getTransactionReceipt for an address over a block range",
      }),
    );
    expect(adaptable.relevance).toBe("adaptableCandidate");
    expect(adaptable.adapterNeeds).toMatch(/Adapter would need/i);

    const keywordOnly = assessResourceTaskRelevance(
      synthetic({
        url: "https://example.test/wallet-analytics",
        description: "wallet analytics",
      }),
    );
    expect(keywordOnly.relevance).toBe("potentiallyRelated");
    expect(keywordOnly.adapterNeeds).toBeNull();
  });

  it("does not treat a different task id as automatically useless when concrete functions exist", () => {
    const otherId = assessResourceTaskRelevance(
      synthetic({
        url: "https://example.test/v1/tx-scanner",
        taskId: "base-tx-scan@0.2",
        description:
          "Scans wallet transactions and receipts for an EVM address across a block range on Base",
      }),
    );
    expect(otherId.relevance).toBe("adaptableCandidate");
  });
});

describe("advertised payment claims (§8)", () => {
  it("matches complete Sepolia policy metadata (not a live challenge)", () => {
    const result = assessAdvertisedPaymentClaim({
      x402Version: 2,
      scheme: "exact",
      network: APPROVED_PAYMENT_NETWORK,
      asset: APPROVED_SEPOLIA_TEST_USDC,
      assetDecimals: 6,
      maxAmountRequired: "1000",
      payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    });
    expect(result.assessment).toBe("claimsPolicyMatch");
    expect(result.notes).toMatch(/not a live challenge/i);
  });

  it("mismatches legacy v1 and cross-network USDC substitution (D8.7)", () => {
    expect(
      assessAdvertisedPaymentClaim({
        x402Version: 1,
        scheme: "exact",
        network: APPROVED_PAYMENT_NETWORK,
        asset: APPROVED_SEPOLIA_TEST_USDC,
        assetDecimals: 6,
        maxAmountRequired: "1",
        payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      }).assessment,
    ).toBe("claimsPolicyMismatch");

    // Mainnet network + Sepolia USDC = cross-network substitution reject
    expect(
      assessAdvertisedPaymentClaim({
        x402Version: 2,
        scheme: "exact",
        network: "eip155:8453",
        asset: APPROVED_SEPOLIA_TEST_USDC,
        assetDecimals: 6,
        maxAmountRequired: "1",
        payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      }).assessment,
    ).toBe("claimsPolicyMismatch");
  });

  it("matches complete Mainnet policy metadata with Mainnet USDC (D8.7)", () => {
    const result = assessAdvertisedPaymentClaim({
      x402Version: 2,
      scheme: "exact",
      network: "eip155:8453",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      assetDecimals: 6,
      maxAmountRequired: "1000",
      payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    });
    expect(result.assessment).toBe("claimsPolicyMatch");
    expect(result.notes).toMatch(/not a live challenge/i);
  });

  it("returns insufficientInformation for missing token/asset, unknown recipient, or missing price", () => {
    expect(
      assessAdvertisedPaymentClaim({
        x402Version: 2,
        scheme: "exact",
        network: APPROVED_PAYMENT_NETWORK,
        assetDecimals: 6,
        maxAmountRequired: "1",
        payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      }).assessment,
    ).toBe("insufficientInformation");

    expect(
      assessAdvertisedPaymentClaim({
        x402Version: 2,
        scheme: "exact",
        network: APPROVED_PAYMENT_NETWORK,
        asset: APPROVED_SEPOLIA_TEST_USDC,
        assetDecimals: 6,
        maxAmountRequired: "1",
        payTo: "not-an-address",
      }).assessment,
    ).toBe("claimsPolicyMismatch");

    expect(
      assessAdvertisedPaymentClaim({
        x402Version: 2,
        scheme: "exact",
        network: APPROVED_PAYMENT_NETWORK,
        asset: APPROVED_SEPOLIA_TEST_USDC,
        assetDecimals: 6,
        payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      }).assessment,
    ).toBe("insufficientInformation");

    expect(assessAdvertisedPaymentClaim(null).assessment).toBe(
      "insufficientInformation",
    );
  });
});

describe("shortlist scoring and emptiness", () => {
  it("ranks candidates deterministically and prefers wallet/chain over discovery", () => {
    const analysis = analyzeResourceCatalog([
      sourceFrom("SYN-RANK", [
        synthetic({
          resourceId: "discovery",
          url: "https://example.test/.well-known/x402",
          method: "GET",
          description: "agent discovery catalog index",
        }),
        synthetic({
          resourceId: "wallet-b",
          url: "https://example.test/v1/b-wallet-txs",
          method: "GET",
          description:
            "wallet transactions and receipt analysis for an address over a block range",
        }),
        synthetic({
          resourceId: "wallet-a",
          url: "https://example.test/v1/a-wallet-txs",
          method: "GET",
          description:
            "wallet transactions and receipt analysis for an address over a block range",
        }),
      ]),
    ]);
    expect(analysis.shortlist.length).toBeGreaterThan(0);
    expect(analysis.shortlist.length).toBeLessThanOrEqual(3);
    // Deterministic: higher score first; ties by URL.
    for (let i = 1; i < analysis.shortlist.length; i += 1) {
      const prev = analysis.shortlist[i - 1]!;
      const cur = analysis.shortlist[i]!;
      expect(prev.score).toBeGreaterThanOrEqual(cur.score);
      if (prev.score === cur.score) {
        expect((prev.sanitizedUrl ?? "") <= (cur.sanitizedUrl ?? "")).toBe(true);
      }
    }
    expect(analysis.shortlist[0]!.resourceId).not.toBe("discovery");
    for (const c of analysis.shortlist) {
      expect(c.approvedForNetworkExecution).toBe(false);
      expect(c.b4Upgrades.endpointReachable).toBe(false);
      expect(c.b4Upgrades.challengeVerified).toBe(false);
      expect(c.b4Upgrades.paymentCompatible).toBe(false);
      expect(c.b4Upgrades.paidVerified).toBe(false);
    }
  });

  it("returns empty shortlist when recoverable evidence is insufficient", () => {
    const analysis = analyzeResourceCatalog([
      sourceFrom("SYN-EMPTY", [
        synthetic({
          url: "https://agent402.tools/api/uuid",
          method: null,
          description: null,
        }),
        synthetic({
          url: "https://agent402.tools/api/hash",
          method: null,
          description: "hash helper",
        }),
      ]),
    ]);
    expect(analysis.shortlist).toHaveLength(0);
    const doc = buildShortlistDocument(analysis);
    expect(doc.candidateCount).toBe(0);
    expect(doc.approvedForNetworkExecutionTrue).toBe(0);
  });

  it("live sampleOnly evidence yields empty shortlist and no B4 upgrades", () => {
    const fileJson = readFileSync(EVIDENCE_PATH, "utf8");
    const sources = loadCatalogSourcesFromDiscoveryEvidence(
      fileJson,
      "docs/day4/evidence/x402-discovery-inspection.json",
    );
    const analysis = analyzeResourceCatalog(sources);
    expect(analysis.shortlist).toHaveLength(0);
    expect(analysis.b4Upgrades).toEqual({
      endpointReachable: false,
      challengeVerified: false,
      paymentCompatible: false,
      paidVerified: false,
    });
    for (const r of analysis.resources) {
      expect(r.inspectionStatus).toBe("notChecked");
      expect(r.fixtureKind).toBe("captured");
      expect(r.taskRelevance).toBe("unrelated");
      expect(r.paymentAssessment).toBe("insufficientInformation");
    }
  });

  it("scoreResourceCandidate is transparent high/medium/low", () => {
    const high = normalizeAdvertisedResource(
      synthetic({
        url: "https://example.test/v1/wallet-activity-summary",
        method: "GET",
        taskId: "wallet-activity-summary@1.0",
        description:
          "request/response schema with fromBlock toBlock metrics for wallet activity",
      }),
      { discoveryId: "SYN", provider: "Syn", index: 0 },
    );
    const scored = scoreResourceCandidate(high);
    expect(scored.priority).toBe("high");
    expect(scored.rationale).toMatch(/explicitMatch/);
  });
});

describe("determinism and CLI offline guards", () => {
  it("dual analyze produces byte-identical SHA-256", () => {
    const fileJson = readFileSync(EVIDENCE_PATH, "utf8");
    const sources = loadCatalogSourcesFromDiscoveryEvidence(
      fileJson,
      "docs/day4/evidence/x402-discovery-inspection.json",
    );
    const a = stableStringify(analyzeResourceCatalog(sources));
    const b = stableStringify(analyzeResourceCatalog(sources));
    expect(a).toBe(b);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });

  it("rejects --live/--fetch/--probe/--execute flags", () => {
    for (const flag of ["--live", "--fetch", "--probe", "--execute"]) {
      const parsed = parseAnalyzeResourcesArgs([
        "node",
        "analyze-resources.ts",
        flag,
      ]);
      expect(parsed.ok).toBe(false);
    }
  });

  it("runAnalyzeResources writes artifacts without network and keeps shortlist unapproved", async () => {
    const result = await runAnalyzeResources({ repoRoot: REPO_ROOT });
    expect(result.ok).toBe(true);
    expect(result.coverage).toBe("sampleOnly");
    expect(result.reported).toBe(620);
    expect(result.recoverable).toBe(25);
    expect(result.shortlist).toBe(0);
    const analysis = JSON.parse(
      readFileSync(result.analysisPath, "utf8"),
    ) as ReturnType<typeof analyzeResourceCatalog>;
    expect(analysis.b4Upgrades.paymentCompatible).toBe(false);
    const shortlist = JSON.parse(
      readFileSync(result.shortlistPath, "utf8"),
    ) as ReturnType<typeof buildShortlistDocument>;
    expect(shortlist.approvedForNetworkExecutionTrue).toBe(0);
    for (const c of shortlist.candidates) {
      expect(c.approvedForNetworkExecution).toBe(false);
    }
  });

  it("buildInspectionShortlist never sets approvedForNetworkExecution true", () => {
    const resources = analyzeResourceCatalog([
      sourceFrom("SYN", [
        synthetic({
          url: "https://example.test/v1/wallet-txs",
          method: "GET",
          description:
            "wallet transactions and receipts for an address over a block range",
        }),
      ]),
    ]).resources;
    const shortlist = buildInspectionShortlist(resources, 3);
    expect(shortlist.every((c) => c.approvedForNetworkExecution === false)).toBe(
      true,
    );
  });
});

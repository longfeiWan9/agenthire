import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SecureFetchError,
  type SecureHttpsExchange,
} from "../src/erc8004/secure-https.ts";
import {
  AttemptMarkerConflictError,
  CATALOG_001_APPROVED_URL,
  CATALOG_001_MARKER_CREATE_STRATEGY,
  CATALOG_001_REQUEST_ID,
  D43C_AGENT402_CONTENT_SHA256,
  analyzeRecoveredAgent402Catalog,
  assertExactCatalog001Destination,
  attemptMarkerExists,
  buildCatalogRecoverySummary,
  classifyRawResourceEntries,
  hashAndDiscardRawBody,
  isApprovedCatalog001Url,
  recoverAgent402Catalog,
  writeAttemptMarker,
  type Agent402FullResourceCatalogDocument,
  type CatalogRecoveryTransport,
} from "../src/providers/agent402-catalog-recovery.ts";
import { sha256Hex as sha256Buffer } from "../src/providers/x402-discovery-document.ts";
import { runRecoverAgent402Catalog } from "../src/scripts/recover-agent402-catalog.ts";
import { sanitizeEndpointForArtifact } from "../src/providers/inspection-policy.ts";

const OBSERVED = "2026-11-20T16:00:00.000Z";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "agenthire-catalog-"));
  tempRoots.push(root);
  mkdirSync(join(root, "docs/day4/evidence"), { recursive: true });
  return root;
}

function exchangeFromBody(
  body: unknown,
  overrides?: {
    readonly statusCode?: number;
    readonly elapsedMs?: number;
  },
): SecureHttpsExchange {
  const buf = Buffer.from(
    typeof body === "string" ? body : JSON.stringify(body),
    "utf8",
  );
  return {
    url: CATALOG_001_APPROVED_URL,
    finalUrl: CATALOG_001_APPROVED_URL,
    statusCode: overrides?.statusCode ?? 200,
    headers: { "content-type": "application/json" },
    contentType: "application/json",
    body: buf,
    sha256: sha256Buffer(buf),
    byteLength: buf.length,
    resolvedAddresses: [{ address: "203.0.113.10", family: 4 }],
    pinnedAddress: { address: "203.0.113.10", family: 4 },
    elapsedMs: overrides?.elapsedMs ?? 12,
  };
}

/** Synthetic fixture — labeled. */
function syntheticLegacyCatalog(count: number): {
  readonly fixtureKind: "synthetic";
  readonly body: {
    readonly version: number;
    readonly name: string;
    readonly resources: string[];
  };
} {
  const resources = Array.from(
    { length: count },
    (_, i) => `https://agent402.tools/api/synthetic/${i}`,
  );
  return {
    fixtureKind: "synthetic",
    body: {
      version: 1,
      name: "Synthetic-Agent402-Full-Catalog",
      resources,
    },
  };
}

describe("CATALOG-001 authorization / allowlist", () => {
  it("accepts only the exact approved URL", () => {
    expect(isApprovedCatalog001Url(CATALOG_001_APPROVED_URL)).toBe(true);
    expect(assertExactCatalog001Destination(CATALOG_001_APPROVED_URL).hostname).toBe(
      "agent402.tools",
    );
  });

  it("rejects siblings, trailing slash, query, fragment, http, credentials", () => {
    const bad = [
      "https://agent402.tools/.well-known/x402/",
      "https://agent402.tools/.well-known/x402?x=1",
      "https://agent402.tools/.well-known/x402#frag",
      "http://agent402.tools/.well-known/x402",
      "https://user:pass@agent402.tools/.well-known/x402",
      "https://agent402.tools/openapi.json",
      "https://agent402.tools/agent-card.json",
      "https://agents.quantjourney.cloud/.well-known/x402",
      "https://evil.example/.well-known/x402",
    ];
    for (const url of bad) {
      expect(isApprovedCatalog001Url(url)).toBe(false);
      expect(() => assertExactCatalog001Destination(url)).toThrow();
    }
  });
});

describe("dry-run zero network", () => {
  it("plans without calling transport", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, "docs/day4/evidence/catalog-001-live-attempt.marker");
    const transport = vi.fn<CatalogRecoveryTransport>();
    const result = await recoverAgent402Catalog({
      runMode: "dry-run",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
    });
    expect(transport).not.toHaveBeenCalled();
    expect(result.status).toBe("planned");
    expect(result.summary.coverage).toBe("unavailable");
    expect(result.resources).toEqual([]);
    expect(attemptMarkerExists(markerPath)).toBe(false);
    expect(result.attemptMarkerPath).toBe(
      "docs/day4/evidence/catalog-001-live-attempt.marker",
    );
  });

  it("CLI dry-run rejects arbitrary URLs and force-reset flags", async () => {
    await expect(
      runRecoverAgent402Catalog({
        argv: ["node", "recover", "https://evil.example/"],
        repoRoot: tempRepo(),
      }),
    ).rejects.toThrow(/Arbitrary URL/);
    await expect(
      runRecoverAgent402Catalog({
        argv: ["node", "recover", "--force"],
        repoRoot: tempRepo(),
      }),
    ).rejects.toThrow(/force-reset|force-retry/);
  });
});

describe("single-use attempt guard", () => {
  it("writes marker before transport I/O", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, "docs/day4/evidence/catalog-001-live-attempt.marker");
    let markerSeenBeforeTransport = false;
    const transport: CatalogRecoveryTransport = async () => {
      markerSeenBeforeTransport = attemptMarkerExists(markerPath);
      return exchangeFromBody(syntheticLegacyCatalog(3).body);
    };
    const result = await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
    });
    expect(markerSeenBeforeTransport).toBe(true);
    expect(result.status).toBe("success");
    expect(attemptMarkerExists(markerPath)).toBe(true);
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as {
      requestId: string;
      purpose: string;
    };
    expect(marker.requestId).toBe(CATALOG_001_REQUEST_ID);
    expect(marker.purpose).toBe("single-use-live-attempt-guard");
  });

  it("blocks re-run when marker already exists (no silent reset)", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, "docs/day4/evidence/catalog-001-live-attempt.marker");
    writeAttemptMarker({ markerPath, writtenAt: OBSERVED });
    const transport = vi.fn<CatalogRecoveryTransport>(async () =>
      exchangeFromBody(syntheticLegacyCatalog(2).body),
    );
    const result = await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
    });
    expect(result.status).toBe("attemptBlocked");
    expect(transport).not.toHaveBeenCalled();
    expect(result.summary.safelyRetainedResourceCount).toBe(0);
  });

  it("CLI attemptBlocked does not overwrite prior catalog artifacts", async () => {
    const repo = tempRepo();
    const evidenceDir = join(repo, "docs/day4/evidence");
    const catalogPath = join(evidenceDir, "agent402-full-resource-catalog.json");
    const prior = JSON.stringify({ keep: "prior-success-catalog", resources: [1, 2, 3] });
    writeFileSync(catalogPath, prior, "utf8");
    writeAttemptMarker({
      markerPath: join(evidenceDir, "catalog-001-live-attempt.marker"),
      writtenAt: OBSERVED,
    });
    const result = await runRecoverAgent402Catalog({
      argv: ["node", "recover", "--approved-live"],
      repoRoot: repo,
      observedAt: OBSERVED,
    });
    expect(result.status).toBe("attemptBlocked");
    expect(result.ok).toBe(false);
    expect(readFileSync(catalogPath, "utf8")).toBe(prior);
  });

  it("writeAttemptMarker itself refuses overwrite", () => {
    const repo = tempRepo();
    const markerPath = join(repo, "marker.marker");
    writeAttemptMarker({ markerPath, writtenAt: OBSERVED });
    expect(() =>
      writeAttemptMarker({ markerPath, writtenAt: OBSERVED }),
    ).toThrow(AttemptMarkerConflictError);
  });

  it("uses exclusive wx final-path strategy (not rename-overwrite)", () => {
    expect(CATALOG_001_MARKER_CREATE_STRATEGY).toBe("exclusive-wx-final-path");
  });

  it("concurrent marker race: only one exclusive create wins", () => {
    const repo = tempRepo();
    const markerPath = join(repo, "race.marker");
    const winners: boolean[] = [];
    const errors: unknown[] = [];
    // Sequential contention on same path — second must EEXIST / conflict.
    try {
      writeAttemptMarker({ markerPath, writtenAt: OBSERVED });
      winners.push(true);
    } catch (e) {
      errors.push(e);
    }
    try {
      writeAttemptMarker({ markerPath, writtenAt: OBSERVED });
      winners.push(true);
    } catch (e) {
      errors.push(e);
    }
    expect(winners).toEqual([true]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(AttemptMarkerConflictError);
    expect(attemptMarkerExists(markerPath)).toBe(true);
    const body = readFileSync(markerPath, "utf8");
    expect(body).toContain(CATALOG_001_REQUEST_ID);
  });

  it("transport failure preserves marker (no silent re-approve)", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, "fail-preserve.marker");
    const result = await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport: async () => {
        throw new SecureFetchError("timeout", "timed out");
      },
    });
    expect(result.status).toBe("timeout");
    expect(attemptMarkerExists(markerPath)).toBe(true);
    // Re-run must stay blocked even after failure.
    const blocked = await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport: vi.fn(async () => exchangeFromBody(syntheticLegacyCatalog(1).body)),
    });
    expect(blocked.status).toBe("attemptBlocked");
  });

  it("dry-run does not consume the live attempt marker", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, "docs/day4/evidence/catalog-001-live-attempt.marker");
    await recoverAgent402Catalog({
      runMode: "dry-run",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport: vi.fn(),
    });
    expect(attemptMarkerExists(markerPath)).toBe(false);
    // A subsequent live attempt can still write the marker once.
    const live = await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport: async () => exchangeFromBody(syntheticLegacyCatalog(1).body),
    });
    expect(live.status).toBe("success");
    expect(attemptMarkerExists(markerPath)).toBe(true);
  });

  it("CLI rejects --retry / --force-reset (no renewed-auth bypass)", async () => {
    await expect(
      runRecoverAgent402Catalog({
        argv: ["node", "recover", "--retry"],
        repoRoot: tempRepo(),
      }),
    ).rejects.toThrow(/force-reset|force-retry|auto-reset/);
    await expect(
      runRecoverAgent402Catalog({
        argv: ["node", "recover", "--force-reset"],
        repoRoot: tempRepo(),
      }),
    ).rejects.toThrow(/force-reset|force-retry|auto-reset/);
  });
});

describe("transport failure mapping (no retries)", () => {
  it("maps redirect / TLS / blocked IP / timeout / oversized without retry", async () => {
    const cases: {
      error: SecureFetchError;
      status: string;
    }[] = [
      {
        error: new SecureFetchError("redirect", "Refusing redirect (302) to https://evil"),
        status: "redirectRejected",
      },
      {
        error: new SecureFetchError("tls", "certificate verify failed"),
        status: "tlsFailure",
      },
      {
        error: new SecureFetchError("blockedIp", "blocked private IP"),
        status: "unsafeDestination",
      },
      {
        error: new SecureFetchError("timeout", "timed out"),
        status: "timeout",
      },
      {
        error: new SecureFetchError("oversized", "body exceeded limit"),
        status: "oversized",
      },
    ];
    for (const c of cases) {
      const repo = tempRepo();
      const markerPath = join(repo, `marker-${c.status}.marker`);
      const transport = vi.fn<CatalogRecoveryTransport>(async () => {
        throw c.error;
      });
      const result = await recoverAgent402Catalog({
        runMode: "approved-live",
        observedAt: OBSERVED,
        repoRoot: repo,
        markerPath,
        transport,
      });
      expect(result.status).toBe(c.status);
      expect(transport).toHaveBeenCalledTimes(1);
      // Marker remains — crash/timeout must not silently re-approve.
      expect(attemptMarkerExists(markerPath)).toBe(true);
    }
  });
});

describe("evidence capture", () => {
  it("retains synthetic 620 resources (not 25-sample) and labels fixture path", async () => {
    const repo = tempRepo();
    const syn = syntheticLegacyCatalog(620);
    expect(syn.fixtureKind).toBe("synthetic");
    const body = syn.body;
    const transport: CatalogRecoveryTransport = async () => exchangeFromBody(body);
    const result = await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath: join(repo, "m.marker"),
      priorSha256: null,
      transport,
    });
    expect(result.status).toBe("success");
    expect(result.summary.advertisedResourceCount).toBe(620);
    expect(result.summary.safelyRetainedResourceCount).toBe(620);
    expect(result.summary.omittedResourceCount).toBe(0);
    expect(result.summary.coverage).toBe("complete");
    expect(result.resources).toHaveLength(620);
    expect(result.resources.every((r) => r.inspectionStatus === "notChecked")).toBe(
      true,
    );
    expect(result.b4Upgrades.endpointReachable).toBe(false);
    expect(result.mvpTaskBound).toBe(false);
    expect(result.rawBodyCommitted).toBe(false);
  });

  it("counts malformed entries as parse failures / omitted", () => {
    const { parsed, parseFailureCount } = classifyRawResourceEntries(
      [
        "https://agent402.tools/api/ok",
        42,
        null,
        { url: "https://agent402.tools/api/obj", method: "post" },
        true,
      ],
      "agent402.tools",
    );
    expect(parseFailureCount).toBe(3);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]?.method).toBe("POST");
  });

  it("detects duplicate URLs in normalized catalog", async () => {
    const repo = tempRepo();
    const body = {
      version: 1,
      name: "Synthetic-Dupes",
      resources: [
        "https://agent402.tools/api/dup",
        "https://agent402.tools/api/dup",
        "https://agent402.tools/api/other",
      ],
    };
    const result = await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath: join(repo, "dup.marker"),
      priorSha256: null,
      transport: async () => exchangeFromBody(body),
    });
    const { analysis } = analyzeRecoveredAgent402Catalog(
      result,
      "synthetic://dupes",
    );
    const dupes = analysis.resources.filter((r) => r.duplicateUrl);
    expect(dupes.length).toBe(2);
  });

  it("handles invalid JSON body", async () => {
    const repo = tempRepo();
    const result = await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath: join(repo, "badjson.marker"),
      priorSha256: null,
      transport: async () => exchangeFromBody("{not-json"),
    });
    expect(result.status).toBe("invalidJson");
    expect(result.summary.safelyRetainedResourceCount).toBe(0);
  });

  it("redacts secrets in retained URLs", async () => {
    const repo = tempRepo();
    const secretUrl =
      "https://agent402.tools/api/x?api_key=supersecret&token=abc";
    const result = await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath: join(repo, "secret.marker"),
      priorSha256: null,
      transport: async () =>
        exchangeFromBody({
          version: 1,
          name: "Synthetic-Secret",
          resources: [secretUrl],
        }),
    });
    expect(result.resources[0]?.sanitizedUrl).toBe(
      sanitizeEndpointForArtifact(secretUrl),
    );
    expect(result.resources[0]?.sanitizedUrl).not.toContain("supersecret");
    expect(JSON.stringify(result)).not.toContain("supersecret");
  });

  it("hashes raw body then discards temp files", () => {
    const repo = tempRepo();
    const rawTempDir = join(repo, ".tmp/raw");
    const body = Buffer.from('{"version":1,"resources":[]}', "utf8");
    const { sha256, byteLength } = hashAndDiscardRawBody({ rawTempDir, body });
    expect(byteLength).toBe(body.length);
    expect(sha256).toBe(sha256Buffer(body));
    expect(existsSync(rawTempDir)).toBe(false);
  });

  it("compares SHA to prior D4.3c hash (match and mismatch)", () => {
    const match = buildCatalogRecoverySummary({
      observedAt: OBSERVED,
      httpStatus: 200,
      rawResponseBytes: 10,
      rawResponseSha256: D43C_AGENT402_CONTENT_SHA256,
      advertisedResourceCount: 620,
      parsedResourceCount: 620,
      normalizedResourceCount: 620,
      safelyRetainedResourceCount: 620,
      parseFailureCount: 0,
      priorSha256: D43C_AGENT402_CONTENT_SHA256,
    });
    expect(match.matchesPreviousResponseHash).toBe(true);
    expect(match.coverage).toBe("complete");

    const mismatch = buildCatalogRecoverySummary({
      observedAt: OBSERVED,
      httpStatus: 200,
      rawResponseBytes: 10,
      rawResponseSha256: "aa".repeat(32),
      advertisedResourceCount: 10,
      parsedResourceCount: 10,
      normalizedResourceCount: 10,
      safelyRetainedResourceCount: 10,
      parseFailureCount: 0,
      priorSha256: D43C_AGENT402_CONTENT_SHA256,
    });
    expect(mismatch.matchesPreviousResponseHash).toBe(false);
  });

  it("does not overwrite D4.3c evidence file during recovery", async () => {
    const repo = tempRepo();
    const d43cPath = join(
      repo,
      "docs/day4/evidence/x402-discovery-inspection.json",
    );
    const sentinel = JSON.stringify({ keep: "d43c-history", evidences: [] });
    writeFileSync(d43cPath, sentinel, "utf8");
    await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath: join(repo, "hist.marker"),
      priorSha256: D43C_AGENT402_CONTENT_SHA256,
      transport: async () => exchangeFromBody(syntheticLegacyCatalog(2).body),
    });
    expect(readFileSync(d43cPath, "utf8")).toBe(sentinel);
  });
});

describe("full-catalog analysis", () => {
  function syntheticCatalogDoc(
    resources: Agent402FullResourceCatalogDocument["resources"],
    coverage: Agent402FullResourceCatalogDocument["summary"]["coverage"] = "complete",
  ): Agent402FullResourceCatalogDocument {
    return {
      schemaVersion: "1.0",
      mode: "READ_ONLY / NO_SIGNING / NO_PAYMENT / ONE_APPROVED_DISCOVERY_GET_ONLY",
      kind: "agent402FullResourceCatalog",
      requestId: "CATALOG-001",
      provider: "Agent402",
      approvedUrl: CATALOG_001_APPROVED_URL,
      sanitizedUrl: CATALOG_001_APPROVED_URL,
      method: "GET",
      runMode: "approved-live",
      status: "success",
      summary: {
        sourceUrl: CATALOG_001_APPROVED_URL,
        httpStatus: 200,
        observedAt: OBSERVED,
        rawResponseBytes: 100,
        rawResponseSha256: D43C_AGENT402_CONTENT_SHA256,
        advertisedResourceCount: resources.length,
        parsedResourceCount: resources.length,
        normalizedResourceCount: resources.length,
        safelyRetainedResourceCount: resources.length,
        omittedResourceCount: 0,
        parseFailureCount: 0,
        coverage,
        matchesPreviousResponseHash: true,
      },
      priorD43cContentSha256: D43C_AGENT402_CONTENT_SHA256,
      documentSummary: {
        recognitionKind: "legacyResourceList",
        x402Version: 1,
        name: "Synthetic",
        notes: "synthetic fixture",
      },
      resources,
      mvpTaskBound: false,
      b4Upgrades: {
        endpointReachable: false,
        challengeVerified: false,
        paymentCompatible: false,
        paidVerified: false,
      },
      attemptMarkerPath: "synthetic.marker",
      rawBodyCommitted: false,
      error: null,
      errorClass: null,
    };
  }

  it("reports complete coverage, families, methods, categories for synthetic utilities", async () => {
    const repo = tempRepo();
    const recovered = await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath: join(repo, "ana.marker"),
      priorSha256: null,
      transport: async () =>
        exchangeFromBody({
          version: 1,
          name: "Synthetic-Analysis",
          resources: [
            "https://agent402.tools/api/uuid",
            "https://agent402.tools/api/pdf",
            "https://agent402.tools/api/hash",
          ],
        }),
    });
    const { analysis, shortlist } = analyzeRecoveredAgent402Catalog(
      recovered,
      "synthetic://analysis",
    );
    expect(analysis.coverage.coverage).toBe("complete");
    expect(analysis.coverage.familyCounts["/api/uuid"]).toBe(1);
    expect(analysis.coverage.familyCounts["/api/pdf"]).toBe(1);
    expect(analysis.coverage.categoryCounts.developerInfrastructure).toBeGreaterThan(0);
    expect(analysis.coverage.taskRelevanceCounts.unrelated).toBe(3);
    expect(shortlist.candidateCount).toBe(0);
    expect(shortlist.approvedForNetworkExecutionTrue).toBe(0);
    expect(analysis.shortlist.every((c) => c.approvedForNetworkExecution === false)).toBe(
      true,
    );
    expect(analysis.b4Upgrades.paidVerified).toBe(false);
  });

  it("empty shortlist is valid; unapproved candidates; payment mismatch metadata-only", async () => {
    const {
      normalizeAdvertisedResource,
      buildInspectionShortlist,
      assessAdvertisedPaymentClaim,
    } = await import("../src/providers/resource-analysis.ts");

    const paymentMismatch = assessAdvertisedPaymentClaim({
      x402Version: 1,
      scheme: "exact",
      network: "eip155:8453",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      assetDecimals: 6,
    });
    expect(paymentMismatch.assessment).toBe("claimsPolicyMismatch");
    expect(paymentMismatch.notes).toMatch(/metadata only/i);

    const walletish = normalizeAdvertisedResource(
      {
        url: "https://agent402.tools/api/wallet-activity",
        method: "GET",
        description:
          "Returns wallet activity transaction history for an address over a block range with receipts",
        payment: {
          x402Version: 1,
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          assetDecimals: 6,
        },
        fixtureKind: "synthetic",
      },
      {
        discoveryId: "CATALOG-001",
        provider: "Agent402",
        index: 0,
        fixtureKind: "synthetic",
      },
    );
    expect(walletish.paymentAssessment).toBe("claimsPolicyMismatch");
    expect(
      walletish.taskRelevance === "adaptableCandidate" ||
        walletish.taskRelevance === "potentiallyRelated",
    ).toBe(true);

    const unrelated = normalizeAdvertisedResource(
      {
        url: "https://agent402.tools/api/uuid",
        method: null,
        description: null,
        fixtureKind: "synthetic",
      },
      {
        discoveryId: "CATALOG-001",
        provider: "Agent402",
        index: 1,
        fixtureKind: "synthetic",
      },
    );

    const shortlist = buildInspectionShortlist([walletish, unrelated], 3);
    for (const c of shortlist) {
      expect(c.approvedForNetworkExecution).toBe(false);
      expect(c.b4Upgrades.endpointReachable).toBe(false);
      expect(c.b4Upgrades.paidVerified).toBe(false);
    }
    // Empty shortlist remains valid when only unrelated utilities exist.
    const empty = buildInspectionShortlist([unrelated], 3);
    expect(empty).toEqual([]);

    const doc = syntheticCatalogDoc([unrelated]);
    const { shortlist: fromDoc } = analyzeRecoveredAgent402Catalog(
      doc,
      "synthetic://shortlist",
    );
    expect(fromDoc.candidateCount).toBe(0);
    expect(fromDoc.approvedForNetworkExecutionTrue).toBe(0);
  });

  it("deterministic dual analysis is byte-identical", async () => {
    const repo = tempRepo();
    const recovered = await recoverAgent402Catalog({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath: join(repo, "det.marker"),
      priorSha256: D43C_AGENT402_CONTENT_SHA256,
      transport: async () => {
        const buf = Buffer.from(
          JSON.stringify(syntheticLegacyCatalog(5).body),
          "utf8",
        );
        // Force SHA to prior for match path in summary.
        return {
          ...exchangeFromBody(syntheticLegacyCatalog(5).body),
          sha256: D43C_AGENT402_CONTENT_SHA256,
          body: buf,
        };
      },
    });
    const a = analyzeRecoveredAgent402Catalog(recovered, "synthetic://det");
    const b = analyzeRecoveredAgent402Catalog(recovered, "synthetic://det");
    expect(JSON.stringify(a.analysis)).toBe(JSON.stringify(b.analysis));
    expect(JSON.stringify(a.shortlist)).toBe(JSON.stringify(b.shortlist));
  });
});

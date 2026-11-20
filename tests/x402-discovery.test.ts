import { describe, expect, it, vi } from "vitest";
import {
  APPROVED_X402_DISCOVERY_TARGETS,
  assertExactX402DiscoveryDestination,
  getX402DiscoveryTargetById,
  isApprovedX402DiscoveryUrl,
  listApprovedX402DiscoveryTargets,
} from "../src/providers/x402-discovery-allowlist.ts";
import {
  evaluateCapturedChallenge,
  parseX402DiscoveryDocumentBytes,
  sha256Hex,
} from "../src/providers/x402-discovery-document.ts";
import {
  inspectX402DiscoveryBatch,
  inspectX402DiscoveryTarget,
  sanitizeX402ResponseHeaders,
  type X402DiscoveryTransport,
} from "../src/providers/x402-discovery-inspection.ts";
import {
  SecureFetchError,
  type SecureHttpsExchange,
} from "../src/erc8004/secure-https.ts";
import {
  encodePaymentRequiredBase64,
} from "../src/x402/challenge-parser.ts";
import {
  APPROVED_PAYMENT_NETWORK,
  APPROVED_SEPOLIA_TEST_USDC,
} from "../src/x402/challenge-types.ts";
import { runInspectX402Discovery } from "../src/scripts/inspect-x402-discovery.ts";

const OBSERVED = "2026-11-20T12:00:00.000Z";

function exchangeFromBody(
  url: string,
  body: unknown,
  overrides?: {
    readonly statusCode?: number;
    readonly headers?: Record<string, string | string[] | undefined>;
    readonly contentType?: string | null;
    readonly elapsedMs?: number;
  },
): SecureHttpsExchange {
  const buf = Buffer.from(
    typeof body === "string" ? body : JSON.stringify(body),
    "utf8",
  );
  const headers = overrides?.headers ?? { "content-type": "application/json" };
  const contentType =
    overrides?.contentType ??
    (typeof headers["content-type"] === "string"
      ? headers["content-type"]
      : "application/json");
  return {
    url,
    finalUrl: url,
    statusCode: overrides?.statusCode ?? 200,
    headers,
    contentType,
    body: buf,
    sha256: sha256Hex(buf),
    byteLength: buf.length,
    resolvedAddresses: [{ address: "203.0.113.10", family: 4 }],
    pinnedAddress: { address: "203.0.113.10", family: 4 },
    elapsedMs: overrides?.elapsedMs ?? 11,
  };
}

function sepoliaExactOffer(overrides?: Record<string, unknown>) {
  return {
    scheme: "exact",
    network: APPROVED_PAYMENT_NETWORK,
    maxAmountRequired: "10000",
    asset: APPROVED_SEPOLIA_TEST_USDC,
    payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    maxTimeoutSeconds: 60,
    resource: "https://agent402.tools/paid/demo",
    ...overrides,
  };
}

const WELL_KNOWN_MANIFEST = {
  x402Version: 2,
  kind: "resource-server",
  name: "Demo Resource Server",
  description: "Synthetic well-known manifest",
  resources: [
    {
      url: "https://agent402.tools/paid/demo",
      method: "POST",
      description: "paid demo",
    },
    {
      url: "https://evil.example/ssrf",
      method: "GET",
      description: "cross-host claim must not be fetched",
    },
  ],
  facilitator: {
    baseUrl: "https://agent402.tools",
    endpoints: {
      supported: "/supported",
      verify: "/verify",
      settle: "/settle",
    },
    kinds: [
      { x402Version: 2, scheme: "exact", network: "eip155:84532" },
      { x402Version: 2, scheme: "exact", network: "eip155:8453" },
    ],
    assets: [
      {
        network: "eip155:84532",
        address: APPROVED_SEPOLIA_TEST_USDC,
        symbol: "USDC",
        decimals: 6,
      },
    ],
  },
  docs: "https://agent402.tools/",
  updated: "2026-11-20T00:00:00Z",
};

const LEGACY_LIST = {
  version: 1,
  resources: ["https://agents.quantjourney.cloud/api/a"],
};

describe("x402 discovery allowlist", () => {
  it("exposes exactly two approved destinations (XDISC-001/002)", () => {
    expect(APPROVED_X402_DISCOVERY_TARGETS).toHaveLength(2);
    expect(listApprovedX402DiscoveryTargets()).toHaveLength(2);
    expect(APPROVED_X402_DISCOVERY_TARGETS.map((t) => t.id)).toEqual([
      "XDISC-001",
      "XDISC-002",
    ]);
    expect(APPROVED_X402_DISCOVERY_TARGETS.map((t) => t.url)).toEqual([
      "https://agent402.tools/.well-known/x402",
      "https://agents.quantjourney.cloud/.well-known/x402",
    ]);
  });

  it("accepts only exact allowlisted URLs and rejects siblings", () => {
    for (const t of APPROVED_X402_DISCOVERY_TARGETS) {
      expect(isApprovedX402DiscoveryUrl(t.url)).toBe(true);
      expect(() => assertExactX402DiscoveryDestination(t.url)).not.toThrow();
    }
    expect(
      isApprovedX402DiscoveryUrl("https://agent402.tools/.well-known/x402/"),
    ).toBe(false);
    expect(
      isApprovedX402DiscoveryUrl(
        "https://agent402.tools/.well-known/x402?x=1",
      ),
    ).toBe(false);
    expect(
      isApprovedX402DiscoveryUrl(
        "https://agent402.tools/.well-known/agent-card.json",
      ),
    ).toBe(false);
    expect(
      isApprovedX402DiscoveryUrl("https://agent402.tools/openapi.json"),
    ).toBe(false);
    expect(
      isApprovedX402DiscoveryUrl(
        "https://api.onchainagentintel.io/v1/intel",
      ),
    ).toBe(false);
  });

  it("rejects query, fragment, credentials, unexpected port, and unknown ids", () => {
    expect(() =>
      assertExactX402DiscoveryDestination(
        "https://user:pass@agent402.tools/.well-known/x402",
      ),
    ).toThrow(/allowlist|credentials/i);
    expect(() =>
      assertExactX402DiscoveryDestination(
        "https://agent402.tools/.well-known/x402#x",
      ),
    ).toThrow();
    expect(() =>
      assertExactX402DiscoveryDestination(
        "https://agent402.tools:8443/.well-known/x402",
      ),
    ).toThrow();
    expect(getX402DiscoveryTargetById("XDISC-999")).toBeUndefined();
    expect(getX402DiscoveryTargetById("XDISC-001")?.priorProposalId).toBe(
      "PSI-001",
    );
  });
});

describe("x402 discovery document recognition", () => {
  it("recognizes well-known manifest claims without fetching resources", () => {
    const parsed = parseX402DiscoveryDocumentBytes(
      Buffer.from(JSON.stringify(WELL_KNOWN_MANIFEST), "utf8"),
      { manifestUrl: "https://agent402.tools/.well-known/x402" },
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.recognitionKind).toBe("wellKnownManifest");
    expect(parsed.summary.advertisedResourceCount).toBe(2);
    expect(parsed.summary.advertisedResourcesTruncated).toBe(false);
    expect(parsed.summary.advertisedResources.every((r) => r.fetched === false)).toBe(
      true,
    );
    expect(parsed.summary.advertisedResources[0]?.sameHostClaim).toBe(true);
    expect(parsed.summary.advertisedResources[1]?.sameHostClaim).toBe(false);
    expect(parsed.summary.facilitatorNetworks).toContain("eip155:84532");
    expect(parsed.summary.facilitatorNetworks).toContain("eip155:8453");
    expect(parsed.bodyChallengeParse).toBeNull();
  });

  it("recognizes legacy resource list", () => {
    const parsed = parseX402DiscoveryDocumentBytes(
      Buffer.from(JSON.stringify(LEGACY_LIST), "utf8"),
      { manifestUrl: "https://agents.quantjourney.cloud/.well-known/x402" },
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.recognitionKind).toBe("legacyResourceList");
    expect(parsed.summary.advertisedResourceCount).toBe(1);
  });

  it("recognizes PaymentRequired envelope body and separates policy", () => {
    const body = {
      x402Version: 2,
      error: "PAYMENT-SIGNATURE header is required",
      accepts: [sepoliaExactOffer()],
    };
    const parsed = parseX402DiscoveryDocumentBytes(
      Buffer.from(JSON.stringify(body), "utf8"),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.recognitionKind).toBe("paymentRequiredEnvelope");
    expect(parsed.bodyChallengeParse?.ok).toBe(true);
    expect(parsed.bodyPolicy?.anyStructurallyCompatible).toBe(true);
    expect(parsed.bodyPolicy?.anyPolicyPass).toBe(false);
    expect(parsed.bodyPolicy?.paymentApprovalGranted).toBe(false);
  });

  it("rejects invalid JSON and empty body", () => {
    const bad = parseX402DiscoveryDocumentBytes(Buffer.from("{nope", "utf8"));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("invalidJson");
    const empty = parseX402DiscoveryDocumentBytes(Buffer.alloc(0));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe("emptyBody");
  });

  it("marks Mainnet offer as policy-fail even when parse succeeds", () => {
    const { challengeParse, policy } = evaluateCapturedChallenge({
      fixtureKind: "synthetic",
      httpStatus: 402,
      headers: {
        "PAYMENT-REQUIRED": encodePaymentRequiredBase64({
          x402Version: 2,
          accepts: [
            sepoliaExactOffer({
              network: "eip155:8453",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            }),
          ],
        }),
      },
      body: {},
    });
    expect(challengeParse.ok).toBe(true);
    expect(policy.anyStructurallyCompatible).toBe(false);
    expect(policy.anyPolicyPass).toBe(false);
    expect(
      policy.evaluations.some((e) =>
        e.reasonCodes.includes("networkMainnetRejected"),
      ),
    ).toBe(true);
  });
});

describe("header sanitization", () => {
  it("redacts PAYMENT-SIGNATURE and auth cookies", () => {
    const sanitized = sanitizeX402ResponseHeaders({
      "content-type": "application/json",
      "PAYMENT-SIGNATURE": "secret-payment-payload",
      authorization: "Bearer abc",
      "set-cookie": "session=1",
      "payment-required": "eyJ4NDAyVmVyc2lvbiI6Mn0=",
      "x-request-id": "ok",
    });
    expect(sanitized["payment-signature"]).toBe("[redacted]");
    expect(sanitized.authorization).toBe("[redacted]");
    expect(sanitized["set-cookie"]).toBe("[redacted]");
    expect(sanitized["payment-required"]).toContain("eyJ");
    expect(sanitized["x-request-id"]).toBe("ok");
  });
});

describe("x402 discovery inspection with mock transport", () => {
  it("dry-run performs zero network I/O", async () => {
    const transport = vi.fn<X402DiscoveryTransport>();
    const batch = await inspectX402DiscoveryBatch({
      runMode: "dry-run",
      observedAt: OBSERVED,
      transport,
    });
    expect(transport).not.toHaveBeenCalled();
    expect(batch.source).toBe("dry-run-plan");
    expect(batch.evidences).toHaveLength(2);
    expect(batch.evidences.every((e) => e.status === "planned")).toBe(true);
    expect(batch.successCount).toBe(0);
    expect(batch.evidences.every((e) => e.mvpTaskBound === false)).toBe(true);
    expect(
      batch.evidences.every((e) => e.b4Upgrades.endpointReachable === false),
    ).toBe(true);
  });

  it("records success for well-known manifests on both targets", async () => {
    const transport: X402DiscoveryTransport = async (url) =>
      exchangeFromBody(url, WELL_KNOWN_MANIFEST);
    const batch = await inspectX402DiscoveryBatch({
      runMode: "approved-live",
      observedAt: OBSERVED,
      transport,
    });
    expect(batch.successCount).toBe(2);
    expect(batch.evidences.every((e) => e.status === "success")).toBe(true);
    expect(
      batch.evidences.every(
        (e) => e.documentSummary?.recognitionKind === "wellKnownManifest",
      ),
    ).toBe(true);
    expect(
      batch.evidences.every((e) =>
        e.documentSummary?.advertisedResources.every((r) => r.fetched === false),
      ),
    ).toBe(true);
    expect(batch.evidences.every((e) => e.b4Upgrades.challengeVerified === false)).toBe(
      true,
    );
  });

  it("parses HTTP 402 PAYMENT-REQUIRED without policy pass or signing", async () => {
    const encoded = encodePaymentRequiredBase64({
      x402Version: 2,
      error: "PAYMENT-SIGNATURE header is required",
      accepts: [sepoliaExactOffer()],
    });
    const target = APPROVED_X402_DISCOVERY_TARGETS[0]!;
    const evidence = await inspectX402DiscoveryTarget({
      target,
      observedAt: OBSERVED,
      transport: async (url) =>
        exchangeFromBody(url, {}, {
          statusCode: 402,
          headers: {
            "content-type": "application/json",
            "PAYMENT-REQUIRED": encoded,
            "PAYMENT-SIGNATURE": "must-not-leak-raw",
          },
        }),
    });
    expect(evidence.status).toBe("paymentRequired");
    expect(evidence.paymentRequiredObserved).toBe(true);
    expect(evidence.paymentRequiredHeaderPresent).toBe(true);
    expect(evidence.challengeParse?.ok).toBe(true);
    expect(evidence.offerPolicy?.anyStructurallyCompatible).toBe(true);
    expect(evidence.offerPolicy?.anyPolicyPass).toBe(false);
    expect(evidence.layers.x402Parse).toBe("ok");
    expect(evidence.layers.sepoliaPolicy).toBe("structurallyCompatible");
    expect(evidence.sanitizedResponseHeaders?.["payment-signature"]).toBe(
      "[redacted]",
    );
    expect(evidence.mvpTaskBound).toBe(false);
    expect(evidence.b4Upgrades.paymentCompatible).toBe(false);
    expect(evidence.b4Upgrades.paidVerified).toBe(false);
  });

  it("maps HTTP status outcomes", async () => {
    const cases: Array<{ statusCode: number; expected: string }> = [
      { statusCode: 404, expected: "notFound" },
      { statusCode: 401, expected: "unauthorized" },
      { statusCode: 500, expected: "httpError" },
    ];
    for (const c of cases) {
      const evidence = await inspectX402DiscoveryTarget({
        target: APPROVED_X402_DISCOVERY_TARGETS[0]!,
        observedAt: OBSERVED,
        transport: async (url) =>
          exchangeFromBody(url, { error: "x" }, { statusCode: c.statusCode }),
      });
      expect(evidence.status).toBe(c.expected);
    }
  });

  it("maps transport SecureFetchError classes", async () => {
    const mapping: Array<[SecureFetchError, string]> = [
      [
        new SecureFetchError(
          "redirect",
          "Refusing redirect (302) to https://evil.test/",
        ),
        "redirectRejected",
      ],
      [new SecureFetchError("tls", "certificate expired"), "tlsFailure"],
      [new SecureFetchError("timeout", "timed out"), "timeout"],
      [new SecureFetchError("oversized", "too big"), "oversized"],
      [new SecureFetchError("blockedIp", "private"), "unsafeDestination"],
      [
        new SecureFetchError("connection", "ECONNRESET", { retryable: true }),
        "networkError",
      ],
    ];
    for (const [error, expected] of mapping) {
      const evidence = await inspectX402DiscoveryTarget({
        target: APPROVED_X402_DISCOVERY_TARGETS[1]!,
        observedAt: OBSERVED,
        transport: async () => {
          throw error;
        },
      });
      expect(evidence.status).toBe(expected);
      if (expected === "redirectRejected") {
        expect(evidence.redirectLocation).toContain("https://evil.test/");
      }
    }
  });

  it("records invalidJson without stopping the batch", async () => {
    const transport: X402DiscoveryTransport = async (url) => {
      if (url.includes("agent402.tools")) {
        return exchangeFromBody(url, "{not-json", { statusCode: 200 });
      }
      return exchangeFromBody(url, LEGACY_LIST);
    };
    const batch = await inspectX402DiscoveryBatch({
      runMode: "approved-live",
      observedAt: OBSERVED,
      transport,
    });
    expect(batch.evidences).toHaveLength(2);
    expect(batch.evidences.find((e) => e.discoveryId === "XDISC-001")?.status).toBe(
      "invalidJson",
    );
    expect(batch.evidences.find((e) => e.discoveryId === "XDISC-002")?.status).toBe(
      "success",
    );
    expect(batch.successCount).toBe(1);
  });

  it("passes Accept: application/json to transport deps", async () => {
    const seen: Array<string | undefined> = [];
    const transport: X402DiscoveryTransport = async (url, deps) => {
      seen.push(deps?.accept);
      return exchangeFromBody(url, WELL_KNOWN_MANIFEST);
    };
    await inspectX402DiscoveryTarget({
      target: APPROVED_X402_DISCOVERY_TARGETS[0]!,
      observedAt: OBSERVED,
      transport,
    });
    expect(seen[0]).toBe("application/json");
  });

  it("never upgrades B4 flags from discovery observations", async () => {
    const transport: X402DiscoveryTransport = async (url) =>
      exchangeFromBody(url, {
        x402Version: 2,
        accepts: [sepoliaExactOffer()],
      });
    const batch = await inspectX402DiscoveryBatch({
      runMode: "approved-live",
      observedAt: OBSERVED,
      transport,
    });
    for (const e of batch.evidences) {
      expect(e.b4Upgrades).toEqual({
        endpointReachable: false,
        challengeVerified: false,
        paymentCompatible: false,
        paidVerified: false,
      });
      expect(e.mvpTaskBound).toBe(false);
    }
  });
});

describe("inspect-x402-discovery CLI args", () => {
  it("rejects arbitrary URL arguments", async () => {
    await expect(
      runInspectX402Discovery({
        argv: [
          "node",
          "inspect-x402-discovery.ts",
          "https://agent402.tools/openapi.json",
        ],
      }),
    ).rejects.toThrow(/Arbitrary URL/);
  });

  it("rejects unknown flags and positional ids", async () => {
    await expect(
      runInspectX402Discovery({
        argv: ["node", "inspect-x402-discovery.ts", "--url", "x"],
      }),
    ).rejects.toThrow(/Unknown flag/);
    await expect(
      runInspectX402Discovery({
        argv: ["node", "inspect-x402-discovery.ts", "XDISC-001"],
      }),
    ).rejects.toThrow(/Unexpected argument/);
  });

  it("dry-run via CLI does not write live evidence by default", async () => {
    const result = await runInspectX402Discovery({
      argv: ["node", "inspect-x402-discovery.ts"],
      writeEvidencePath: null,
      writeMarkdownPath: null,
      now: () => new Date(OBSERVED),
    });
    expect(result.runMode).toBe("dry-run");
    expect(result.batch.evidences).toHaveLength(2);
    expect(result.ok).toBe(true);
  });
});

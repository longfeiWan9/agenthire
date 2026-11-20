import { describe, expect, it, vi } from "vitest";
import {
  APPROVED_DISCOVERY_TARGETS,
  assertExactDiscoveryDestination,
  getDiscoveryTargetById,
  isApprovedDiscoveryUrl,
  listApprovedDiscoveryTargets,
} from "../src/providers/discovery-allowlist.ts";
import {
  assessDocumentationCompatibility,
  countUnresolvedRefs,
  parseAgentCardDocument,
  parseDiscoveryDocumentBytes,
  parseOpenApiDocument,
  sha256Hex,
} from "../src/providers/discovery-document.ts";
import {
  inspectDiscoveryBatch,
  inspectDiscoveryTarget,
  sanitizeResponseHeaders,
  type DiscoveryTransport,
} from "../src/providers/discovery-inspection.ts";
import {
  SecureFetchError,
  type SecureHttpsExchange,
} from "../src/erc8004/secure-https.ts";
import { runInspectDiscovery } from "../src/scripts/inspect-discovery.ts";

const OBSERVED = "2026-11-20T00:00:00.000Z";

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

const AGENT_CARD_WITH_MVP = {
  name: "Test Card",
  description: "demo",
  protocolVersion: "0.3.0",
  skills: [
    {
      id: "wallet-activity-summary@1.0",
      name: "Wallet Activity Summary",
      tags: ["wallet"],
    },
    { id: "other-skill", name: "Other" },
  ],
};

const AGENT_CARD_RELATED_ONLY = {
  name: "Analytics Agent",
  skills: [
    {
      id: "wallet-analytics-v2",
      name: "Wallet analytics",
      description: "wallet analytics dashboard",
    },
  ],
};

const AGENT_CARD_UNRELATED = {
  name: "Audit Bot",
  skills: [{ id: "solidity-audit", name: "Solidity Audit" }],
};

const OPENAPI_DOC = {
  openapi: "3.0.3",
  info: { title: "Demo API", version: "1.0.0" },
  paths: {
    "/v1/ping": {
      get: { operationId: "ping", summary: "Ping" },
    },
    "/v1/wallet": {
      post: {
        operationId: "walletStuff",
        summary: "wallet-activity related hint",
        $ref: "#/components/schemas/Unused",
      },
    },
  },
  components: {
    schemas: {
      Unused: { $ref: "#/components/schemas/Other" },
      Other: { type: "object" },
    },
  },
};

describe("discovery allowlist", () => {
  it("exposes exactly four approved destinations", () => {
    expect(APPROVED_DISCOVERY_TARGETS).toHaveLength(4);
    expect(listApprovedDiscoveryTargets()).toHaveLength(4);
    expect(APPROVED_DISCOVERY_TARGETS.map((t) => t.id)).toEqual([
      "DISC-001",
      "DISC-002",
      "DISC-003",
      "DISC-004",
    ]);
  });

  it("accepts only exact allowlisted URLs", () => {
    for (const t of APPROVED_DISCOVERY_TARGETS) {
      expect(isApprovedDiscoveryUrl(t.url)).toBe(true);
      expect(() => assertExactDiscoveryDestination(t.url)).not.toThrow();
    }
    expect(
      isApprovedDiscoveryUrl(
        "https://onchainagentintel.io/.well-known/agent-card.json/",
      ),
    ).toBe(false);
    expect(
      isApprovedDiscoveryUrl(
        "https://onchainagentintel.io/.well-known/agent-card.json?x=1",
      ),
    ).toBe(false);
    expect(
      isApprovedDiscoveryUrl("https://agent402.tools/.well-known/x402"),
    ).toBe(false);
    expect(
      isApprovedDiscoveryUrl("https://agents.quantjourney.cloud/.well-known/x402"),
    ).toBe(false);
    expect(
      isApprovedDiscoveryUrl("https://api.onchainagentintel.io/v1/intel"),
    ).toBe(false);
  });

  it("rejects query, fragment, credentials, unexpected port, and unknown ids", () => {
    expect(() =>
      assertExactDiscoveryDestination(
        "https://user:pass@onchainagentintel.io/.well-known/agent-card.json",
      ),
    ).toThrow(/allowlist|credentials/i);
    expect(() =>
      assertExactDiscoveryDestination(
        "https://onchainagentintel.io/.well-known/agent-card.json#x",
      ),
    ).toThrow();
    expect(() =>
      assertExactDiscoveryDestination(
        "https://onchainagentintel.io:8443/.well-known/agent-card.json",
      ),
    ).toThrow();
    expect(getDiscoveryTargetById("DISC-999")).toBeUndefined();
    expect(getDiscoveryTargetById("DISC-001")?.documentKind).toBe("agent-card");
    expect(getDiscoveryTargetById("DISC-003")?.documentKind).toBe("openapi");
  });
});

describe("discovery document parsing", () => {
  it("parses agent-card skills and detects exact MVP match", () => {
    const parsed = parseAgentCardDocument(AGENT_CARD_WITH_MVP);
    expect(parsed?.skillCount).toBe(2);
    const compat = assessDocumentationCompatibility("agent-card", parsed!);
    expect(compat.explicitSkillMatch).toBe(true);
    expect(compat.matchedSkillIds).toContain("wallet-activity-summary@1.0");
    expect(compat.claimsEndpointStatus).toBe(false);
    expect(compat.claimsPaymentVerified).toBe(false);
  });

  it("reports related hints without claiming explicit match", () => {
    const parsed = parseAgentCardDocument(AGENT_CARD_RELATED_ONLY)!;
    const compat = assessDocumentationCompatibility("agent-card", parsed);
    expect(compat.explicitSkillMatch).toBe(false);
    expect(compat.relatedHints.length).toBeGreaterThan(0);
  });

  it("reports honest mismatch for unrelated skills", () => {
    const parsed = parseAgentCardDocument(AGENT_CARD_UNRELATED)!;
    const compat = assessDocumentationCompatibility("agent-card", parsed);
    expect(compat.explicitSkillMatch).toBe(false);
    expect(compat.relatedHints).toEqual([]);
    expect(compat.notes).toMatch(/do not match/);
  });

  it("lists OpenAPI paths/methods as unapproved and does not fetch $ref", () => {
    const parsed = parseOpenApiDocument(OPENAPI_DOC)!;
    expect(parsed.pathCount).toBe(2);
    expect(parsed.operations).toHaveLength(2);
    expect(parsed.operations.every((op) => op.approvedForFollowUp === false)).toBe(
      true,
    );
    expect(parsed.unresolvedRefCount).toBeGreaterThan(0);
    expect(countUnresolvedRefs(OPENAPI_DOC)).toBe(parsed.unresolvedRefCount);
    const compat = assessDocumentationCompatibility("openapi", parsed);
    expect(compat.openApiOperations).toHaveLength(2);
    expect(compat.claimsRequestSchemaVerified).toBe(false);
  });

  it("rejects invalid JSON and wrong document kinds", () => {
    const badJson = parseDiscoveryDocumentBytes(
      "agent-card",
      Buffer.from("{nope", "utf8"),
    );
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) expect(badJson.reason).toBe("invalidJson");

    const openapiAsCard = parseDiscoveryDocumentBytes(
      "agent-card",
      Buffer.from(JSON.stringify(OPENAPI_DOC), "utf8"),
    );
    expect(openapiAsCard.ok).toBe(false);
    if (!openapiAsCard.ok) expect(openapiAsCard.reason).toBe("invalidDocument");
  });
});

describe("header sanitization", () => {
  it("redacts PAYMENT-SIGNATURE and auth cookies", () => {
    const sanitized = sanitizeResponseHeaders({
      "content-type": "application/json",
      "PAYMENT-SIGNATURE": "secret-payment-payload",
      authorization: "Bearer abc",
      "set-cookie": "session=1",
      "x-request-id": "ok",
    });
    expect(sanitized["payment-signature"]).toBe("[redacted]");
    expect(sanitized.authorization).toBe("[redacted]");
    expect(sanitized["set-cookie"]).toBe("[redacted]");
    expect(sanitized["x-request-id"]).toBe("ok");
  });
});

describe("discovery inspection with mock transport", () => {
  it("dry-run performs zero network I/O", async () => {
    const transport = vi.fn<DiscoveryTransport>();
    const batch = await inspectDiscoveryBatch({
      runMode: "dry-run",
      observedAt: OBSERVED,
      transport,
    });
    expect(transport).not.toHaveBeenCalled();
    expect(batch.source).toBe("dry-run-plan");
    expect(batch.evidences).toHaveLength(4);
    expect(batch.evidences.every((e) => e.status === "planned")).toBe(true);
    expect(batch.successCount).toBe(0);
  });

  it("records success for agent-card and openapi", async () => {
    const transport: DiscoveryTransport = async (url) => {
      if (url.endsWith("openapi.json")) {
        return exchangeFromBody(url, OPENAPI_DOC);
      }
      return exchangeFromBody(url, AGENT_CARD_WITH_MVP);
    };
    const batch = await inspectDiscoveryBatch({
      runMode: "approved-live",
      observedAt: OBSERVED,
      transport,
    });
    expect(batch.successCount).toBe(4);
    expect(batch.evidences.every((e) => e.status === "success")).toBe(true);
    const openapi = batch.evidences.find((e) => e.discoveryId === "DISC-003");
    expect(openapi?.documentSummary?.kind).toBe("openapi");
    expect(
      openapi?.documentationCompatibility?.openApiOperations.every(
        (op) => op.approvedForFollowUp === false,
      ),
    ).toBe(true);
  });

  it("maps HTTP status outcomes including sanitized 402", async () => {
    const cases: Array<{
      statusCode: number;
      expected: string;
      headers?: Record<string, string>;
    }> = [
      { statusCode: 404, expected: "notFound" },
      { statusCode: 401, expected: "unauthorized" },
      {
        statusCode: 402,
        expected: "paymentRequired",
        headers: {
          "content-type": "application/json",
          "PAYMENT-SIGNATURE": "do-not-leak",
        },
      },
      { statusCode: 500, expected: "httpError" },
    ];

    for (const c of cases) {
      const target = APPROVED_DISCOVERY_TARGETS[0]!;
      const evidence = await inspectDiscoveryTarget({
        target,
        observedAt: OBSERVED,
        transport: async (url) =>
          exchangeFromBody(url, { error: "x" }, {
            statusCode: c.statusCode,
            headers: c.headers ?? { "content-type": "application/json" },
          }),
      });
      expect(evidence.status).toBe(c.expected);
      if (c.expected === "paymentRequired") {
        expect(evidence.paymentRequiredObserved).toBe(true);
        expect(evidence.sanitizedResponseHeaders?.["payment-signature"]).toBe(
          "[redacted]",
        );
        expect(evidence.documentSummary).toBeNull();
      }
    }
  });

  it("maps transport SecureFetchError classes", async () => {
    const mapping: Array<[SecureFetchError, string]> = [
      [
        new SecureFetchError("redirect", "Refusing redirect (302) to https://evil.test/"),
        "redirectRejected",
      ],
      [new SecureFetchError("tls", "certificate expired"), "tlsFailure"],
      [new SecureFetchError("timeout", "timed out"), "timeout"],
      [new SecureFetchError("oversized", "too big"), "oversized"],
      [new SecureFetchError("blockedIp", "private"), "unsafeDestination"],
      [new SecureFetchError("connection", "ECONNRESET", { retryable: true }), "networkError"],
    ];

    for (const [error, expected] of mapping) {
      const evidence = await inspectDiscoveryTarget({
        target: APPROVED_DISCOVERY_TARGETS[1]!,
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

  it("records invalidJson and invalidDocument without stopping the batch", async () => {
    const transport: DiscoveryTransport = async (url) => {
      if (url.includes("onchainagentintel")) {
        return exchangeFromBody(url, "{not-json", { statusCode: 200 });
      }
      if (url.includes("openapi")) {
        return exchangeFromBody(url, { name: "not-openapi" });
      }
      return exchangeFromBody(url, AGENT_CARD_UNRELATED);
    };
    const batch = await inspectDiscoveryBatch({
      runMode: "approved-live",
      observedAt: OBSERVED,
      transport,
    });
    expect(batch.evidences).toHaveLength(4);
    expect(batch.evidences.find((e) => e.discoveryId === "DISC-001")?.status).toBe(
      "invalidJson",
    );
    expect(batch.evidences.find((e) => e.discoveryId === "DISC-003")?.status).toBe(
      "invalidDocument",
    );
    expect(batch.successCount).toBe(2);
  });

  it("passes Accept: application/json to transport deps", async () => {
    const seen: Array<string | undefined> = [];
    const transport: DiscoveryTransport = async (url, deps) => {
      seen.push(deps?.accept);
      return exchangeFromBody(url, AGENT_CARD_UNRELATED);
    };
    await inspectDiscoveryTarget({
      target: APPROVED_DISCOVERY_TARGETS[0]!,
      observedAt: OBSERVED,
      transport,
    });
    expect(seen[0]).toBe("application/json");
  });
});

describe("inspect-discovery CLI args", () => {
  it("rejects arbitrary URL arguments", async () => {
    await expect(
      runInspectDiscovery({
        argv: [
          "node",
          "inspect-discovery.ts",
          "https://agent402.tools/.well-known/x402",
        ],
      }),
    ).rejects.toThrow(/Arbitrary URL/);
  });

  it("dry-run via CLI does not write live evidence by default", async () => {
    const result = await runInspectDiscovery({
      argv: ["node", "inspect-discovery.ts"],
      writeEvidencePath: null,
      writeMarkdownPath: null,
      now: () => new Date(OBSERVED),
    });
    expect(result.runMode).toBe("dry-run");
    expect(result.batch.evidences).toHaveLength(4);
    expect(result.ok).toBe(true);
  });
});

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SecureFetchError,
  type SecureHttpsExchange,
} from "../src/erc8004/secure-https.ts";
import {
  AttemptMarkerConflictError,
  D44B_CATALOG_MARKER_REL,
  OPENAPI_001_APPROVED_URL,
  OPENAPI_001_ATTEMPT_MARKER_REL,
  OPENAPI_001_MARKER_CREATE_STRATEGY,
  OPENAPI_001_MAX_BYTES,
  OPENAPI_001_REQUEST_ID,
  OPENAPI_001_TIMEOUT_MS,
  analyzeCapturedOpenApiBody,
  assertExactOpenApi001Destination,
  attemptMarkerExists,
  buildControlChecklist,
  envProxyPresent,
  inspectAgent402OpenApi,
  isApprovedOpenApi001Url,
  parseOpenApiInventory,
  selectTopL1Candidates,
  writeAttemptMarker,
  type OpenApiInspectionTransport,
} from "../src/providers/agent402-openapi-inspection.ts";
import { sha256Hex } from "../src/providers/discovery-document.ts";
import { runInspectAgent402OpenApi } from "../src/scripts/inspect-agent402-openapi.ts";

const OBSERVED = "2026-11-23T08:00:00.000Z";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "agenthire-openapi-"));
  tempRoots.push(root);
  mkdirSync(join(root, "docs/day5/evidence"), { recursive: true });
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
    url: OPENAPI_001_APPROVED_URL,
    finalUrl: OPENAPI_001_APPROVED_URL,
    statusCode: overrides?.statusCode ?? 200,
    headers: { "content-type": "application/json" },
    contentType: "application/json",
    body: buf,
    sha256: sha256Hex(buf),
    byteLength: buf.length,
    resolvedAddresses: [{ address: "203.0.113.10", family: 4 }],
    pinnedAddress: { address: "203.0.113.10", family: 4 },
    elapsedMs: overrides?.elapsedMs ?? 12,
  };
}

/** Synthetic OpenAPI fixture — labeled. */
function syntheticOpenApi(): {
  readonly fixtureKind: "synthetic";
  readonly body: Record<string, unknown>;
} {
  return {
    fixtureKind: "synthetic",
    body: {
      openapi: "3.0.3",
      info: { title: "Synthetic Agent402 OpenAPI", version: "0.0.0-synthetic" },
      servers: [{ url: "https://agent402.tools" }],
      paths: {
        "/api/onchain-sql-schema": {
          get: {
            operationId: "getOnchainSqlSchema",
            summary: "Return onchain SQL schema catalog",
            tags: ["blockchainData"],
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { tables: { type: "array" } },
                    },
                  },
                },
              },
            },
          },
        },
        "/api/evm-rpc": {
          post: {
            operationId: "postEvmRpc",
            summary: "Bounded EVM JSON-RPC proxy",
            tags: ["blockchainData"],
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      method: { type: "string" },
                      params: { type: "array" },
                    },
                  },
                },
              },
            },
            responses: {
              "200": {
                description: "rpc",
                content: {
                  "application/json": {
                    schema: { type: "object" },
                  },
                },
              },
            },
          },
        },
        "/api/wallet-wipe": {
          delete: {
            operationId: "wipeWallet",
            summary: "Destroy wallet state",
            responses: {
              "200": {
                content: {
                  "application/json": { schema: { type: "object" } },
                },
              },
            },
          },
        },
        "/api/no-schema": {
          get: {
            operationId: "noSchema",
            summary: "Missing response schema",
            responses: { "200": { description: "opaque" } },
          },
        },
      },
    },
  };
}

describe("OPENAPI-001 authorization / allowlist", () => {
  it("accepts only the exact approved URL", () => {
    expect(isApprovedOpenApi001Url(OPENAPI_001_APPROVED_URL)).toBe(true);
    expect(assertExactOpenApi001Destination(OPENAPI_001_APPROVED_URL).hostname).toBe(
      "agent402.tools",
    );
  });

  it("rejects siblings, trailing slash, query, fragment, http, credentials, x402", () => {
    const bad = [
      "https://agent402.tools/openapi.json/",
      "https://agent402.tools/openapi.json?x=1",
      "https://agent402.tools/openapi.json#frag",
      "http://agent402.tools/openapi.json",
      "https://user:pass@agent402.tools/openapi.json",
      "https://agent402.tools/.well-known/x402",
      "https://agent402.tools/agent-card.json",
      "https://agents.quantjourney.cloud/openapi.json",
      "https://evil.example/openapi.json",
    ];
    for (const url of bad) {
      expect(isApprovedOpenApi001Url(url)).toBe(false);
      expect(() => assertExactOpenApi001Destination(url)).toThrow();
    }
  });

  it("documents exclusive marker strategy and distinct path from D4.4b", () => {
    expect(OPENAPI_001_MARKER_CREATE_STRATEGY).toBe("exclusive-wx-final-path");
    expect(OPENAPI_001_ATTEMPT_MARKER_REL).not.toBe(D44B_CATALOG_MARKER_REL);
    expect(OPENAPI_001_MAX_BYTES).toBe(1_048_576);
    expect(OPENAPI_001_TIMEOUT_MS).toBe(5_000);
  });
});

describe("control checklist", () => {
  it("is complete when no proxy env is set", () => {
    const controls = buildControlChecklist({
      env: {} as NodeJS.ProcessEnv,
    });
    expect(controls.controlsComplete).toBe(true);
    expect(controls.abortReason).toBeNull();
    expect(controls.maxBytes).toBe(OPENAPI_001_MAX_BYTES);
    expect(controls.timeoutMs).toBe(OPENAPI_001_TIMEOUT_MS);
    expect(controls.distinctFromD44bMarker).toBe(true);
  });

  it("aborts incomplete when proxy env is present", () => {
    expect(envProxyPresent({ HTTPS_PROXY: "http://127.0.0.1:8080" } as NodeJS.ProcessEnv)).toBe(
      true,
    );
    const controls = buildControlChecklist({
      env: { HTTPS_PROXY: "http://127.0.0.1:8080" } as NodeJS.ProcessEnv,
    });
    expect(controls.controlsComplete).toBe(false);
    expect(controls.abortReason).toMatch(/PROXY/);
  });
});

describe("dry-run zero network", () => {
  it("plans without calling transport or writing marker", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, OPENAPI_001_ATTEMPT_MARKER_REL);
    const transport = vi.fn<OpenApiInspectionTransport>();
    const result = await inspectAgent402OpenApi({
      runMode: "dry-run",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
    });
    expect(transport).not.toHaveBeenCalled();
    expect(result.attempt.status).toBe("planned");
    expect(result.attempt.networkRequestPerformed).toBe(false);
    expect(result.candidates.l1Count).toBe(0);
    expect(attemptMarkerExists(markerPath)).toBe(false);
  });

  it("CLI dry-run rejects arbitrary URLs and force-reset flags", async () => {
    await expect(
      runInspectAgent402OpenApi({
        argv: ["node", "inspect", "https://evil.example/"],
        repoRoot: tempRepo(),
      }),
    ).rejects.toThrow(/Arbitrary URL/);
    await expect(
      runInspectAgent402OpenApi({
        argv: ["node", "inspect", "--force"],
        repoRoot: tempRepo(),
      }),
    ).rejects.toThrow(/force-reset|force-retry/);
  });
});

describe("controlsIncomplete aborts without network", () => {
  it("does not call transport or write marker when proxy env set", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, OPENAPI_001_ATTEMPT_MARKER_REL);
    const transport = vi.fn<OpenApiInspectionTransport>();
    const result = await inspectAgent402OpenApi({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: { HTTP_PROXY: "http://127.0.0.1:9" } as NodeJS.ProcessEnv,
    });
    expect(transport).not.toHaveBeenCalled();
    expect(result.attempt.status).toBe("controlsIncomplete");
    expect(result.attempt.networkRequestPerformed).toBe(false);
    expect(attemptMarkerExists(markerPath)).toBe(false);
  });
});

describe("single-use attempt guard", () => {
  it("writes marker before transport I/O", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, OPENAPI_001_ATTEMPT_MARKER_REL);
    let markerSeenBeforeTransport = false;
    const transport: OpenApiInspectionTransport = async (_url, deps) => {
      markerSeenBeforeTransport = attemptMarkerExists(markerPath);
      expect(deps?.maxBytes).toBe(OPENAPI_001_MAX_BYTES);
      expect(deps?.timeoutMs).toBe(OPENAPI_001_TIMEOUT_MS);
      return exchangeFromBody(syntheticOpenApi().body);
    };
    const result = await inspectAgent402OpenApi({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
      commitRawBody: false,
    });
    expect(markerSeenBeforeTransport).toBe(true);
    expect(result.attempt.status).toBe("success");
    expect(attemptMarkerExists(markerPath)).toBe(true);
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as {
      requestId: string;
      purpose: string;
    };
    expect(marker.requestId).toBe(OPENAPI_001_REQUEST_ID);
    expect(marker.purpose).toBe("single-use-live-attempt-guard");
  });

  it("blocks re-run when marker already exists (no silent reset)", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, OPENAPI_001_ATTEMPT_MARKER_REL);
    writeAttemptMarker({ markerPath, writtenAt: OBSERVED });
    const transport = vi.fn<OpenApiInspectionTransport>(async () =>
      exchangeFromBody(syntheticOpenApi().body),
    );
    const result = await inspectAgent402OpenApi({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
    });
    expect(transport).not.toHaveBeenCalled();
    expect(result.attempt.status).toBe("attemptBlocked");
    expect(result.attempt.networkRequestPerformed).toBe(false);
  });

  it("wx create throws AttemptMarkerConflictError on existing file", () => {
    const repo = tempRepo();
    const markerPath = join(repo, OPENAPI_001_ATTEMPT_MARKER_REL);
    writeAttemptMarker({ markerPath, writtenAt: OBSERVED });
    expect(() =>
      writeAttemptMarker({ markerPath, writtenAt: OBSERVED }),
    ).toThrow(AttemptMarkerConflictError);
  });

  it("refuses to write the D4.4b catalog marker path", () => {
    const repo = tempRepo();
    const bad = join(repo, D44B_CATALOG_MARKER_REL);
    expect(() =>
      writeAttemptMarker({ markerPath: bad, writtenAt: OBSERVED }),
    ).toThrow(/D4\.4b/);
  });
});

describe("offline OpenAPI parse / L1 selection", () => {
  it("extracts ≤5 L1 candidates with method+route+schemas", () => {
    const inventory = parseOpenApiInventory(syntheticOpenApi().body, { maxL1: 5 });
    expect(inventory.operationCount).toBe(4);
    const l1 = selectTopL1Candidates(inventory, 5);
    expect(l1.length).toBeGreaterThanOrEqual(2);
    expect(l1.length).toBeLessThanOrEqual(5);
    for (const op of l1) {
      expect(op.ladderLevel).toBe("L1");
      expect(op.hardExcluded).toBe(false);
      expect(op.method).toMatch(/^(GET|POST|HEAD)$/);
      expect(op.invocationRouteUrl).toMatch(/^https:\/\//);
      expect(op.schemas.requestSchemaKnown).toBe(true);
      expect(op.schemas.responseSchemaKnown).toBe(true);
      expect(op.approvedForNetworkExecution).toBe(false);
    }
    expect(l1.some((o) => o.path.includes("wipe"))).toBe(false);
    expect(l1.some((o) => o.path.includes("no-schema"))).toBe(false);
  });

  it("analyzeCapturedOpenApiBody is deterministic and decides keep/switch/null", () => {
    const a = analyzeCapturedOpenApiBody({
      body: JSON.stringify(syntheticOpenApi().body),
      observedAt: OBSERVED,
    });
    const b = analyzeCapturedOpenApiBody({
      body: JSON.stringify(syntheticOpenApi().body),
      observedAt: OBSERVED,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.l1Count).toBeGreaterThan(0);
    expect(a.quantjourneyIdentityLadder).toBe("L0");
    expect(a.decision.outcome).toBe("B_switch_capability");
    expect(a.decision.selectedCapabilityId).not.toBeNull();
  });

  it("returns C_no_l1_null_selection when no schemas", () => {
    const doc = {
      openapi: "3.0.0",
      info: { title: "empty", version: "0" },
      paths: {
        "/x": {
          get: {
            responses: { "200": { description: "no schema" } },
          },
        },
      },
    };
    const candidates = analyzeCapturedOpenApiBody({
      body: JSON.stringify(doc),
      observedAt: OBSERVED,
    });
    expect(candidates.l1Count).toBe(0);
    expect(candidates.decision.outcome).toBe("C_no_l1_null_selection");
    expect(candidates.decision.selectedCapabilityId).toBeNull();
  });
});

describe("transport failure evidence preserved", () => {
  it("records oversized without resetting marker", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, OPENAPI_001_ATTEMPT_MARKER_REL);
    const transport: OpenApiInspectionTransport = async () => {
      throw new SecureFetchError(
        "oversized",
        `Response exceeded ${OPENAPI_001_MAX_BYTES} byte limit`,
      );
    };
    const result = await inspectAgent402OpenApi({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
    });
    expect(result.attempt.status).toBe("oversized");
    expect(result.attempt.networkRequestPerformed).toBe(true);
    expect(attemptMarkerExists(markerPath)).toBe(true);
    expect(existsSync(join(repo, D44B_CATALOG_MARKER_REL))).toBe(false);
  });
});

describe("CLI artifact write on success", () => {
  it("does not overwrite prior evidence on attemptBlocked re-run", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, OPENAPI_001_ATTEMPT_MARKER_REL);
    writeAttemptMarker({ markerPath, writtenAt: OBSERVED });
    const prior = join(repo, "docs/day5/evidence/d5.5-request-attempt.json");
    writeFileSync(
      prior,
      JSON.stringify({ status: "oversized", preserved: true }, null, 2),
    );
    const result = await runInspectAgent402OpenApi({
      argv: ["node", "inspect", "--approved-live"],
      repoRoot: repo,
      markerPath,
      writeArtifacts: true,
      env: {},
    });
    expect(result.status).toBe("attemptBlocked");
    expect(result.networkRequestPerformed).toBe(false);
    expect(JSON.parse(readFileSync(prior, "utf8"))).toEqual({
      status: "oversized",
      preserved: true,
    });
  });

  it("writes attempt + candidates + markdowns once", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, OPENAPI_001_ATTEMPT_MARKER_REL);
    // Inject via inspect path used by CLI internals — call inspect then write
    // through CLI with skipMarkerWrite after we already have a custom transport
    // by exercising runInspect with dry-run first, then approved via module.
    const transport: OpenApiInspectionTransport = async () =>
      exchangeFromBody(syntheticOpenApi().body);
    const live = await inspectAgent402OpenApi({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
      commitRawBody: true,
    });
    expect(live.attempt.status).toBe("success");
    expect(live.candidates.l1Count).toBeGreaterThan(0);

    // Simulate CLI artifact persistence
    const { writeFileSync: wfs, mkdirSync: mks } = await import("node:fs");
    const {
      stableStringify,
      renderOpenApiInspectionMarkdown,
      renderInterfaceAssessmentMarkdown,
      renderIntegrationDecisionMarkdown,
    } = await import("../src/providers/agent402-openapi-inspection.ts");
    mks(join(repo, "docs/day5/evidence"), { recursive: true });
    wfs(
      join(repo, "docs/day5/evidence/d5.5-request-attempt.json"),
      stableStringify(live.attempt),
    );
    wfs(
      join(repo, "docs/day5/evidence/d5.5-interface-candidates.json"),
      stableStringify(live.candidates),
    );
    wfs(
      join(repo, "docs/day5/d5.5-openapi-inspection-report.md"),
      renderOpenApiInspectionMarkdown({
        attempt: live.attempt,
        candidates: live.candidates,
      }),
    );
    wfs(
      join(repo, "docs/day5/d5.5-agent402-interface-assessment.md"),
      renderInterfaceAssessmentMarkdown(live.candidates),
    );
    wfs(
      join(repo, "docs/day5/d5.5-integration-decision.md"),
      renderIntegrationDecisionMarkdown(live.candidates),
    );
    if (live.rawBody && live.attempt.rawBodyPath) {
      wfs(join(repo, live.attempt.rawBodyPath), live.rawBody);
    }
    expect(
      existsSync(join(repo, "docs/day5/evidence/d5.5-request-attempt.json")),
    ).toBe(true);
    expect(
      existsSync(join(repo, "docs/day5/evidence/d5.5-interface-candidates.json")),
    ).toBe(true);
    expect(existsSync(join(repo, "docs/day5/evidence/d5.5-openapi-raw.json"))).toBe(
      true,
    );
  });
});

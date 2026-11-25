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
  JSONVALIDATE_001_APPROVED_URL,
  JSONVALIDATE_001_ATTEMPT_MARKER_REL,
  JSONVALIDATE_001_MARKER_CREATE_STRATEGY,
  JSONVALIDATE_001_MAX_BYTES,
  JSONVALIDATE_001_METHOD,
  JSONVALIDATE_001_REQUEST_BODY,
  JSONVALIDATE_001_REQUEST_ID,
  JSONVALIDATE_001_TIMEOUT_MS,
  JSONVALIDATE_002_ATTEMPT_MARKER_REL,
  JSONVALIDATE_002_REQUEST_ID,
  OPENAPI_001_MARKER_REL,
  assessLadder,
  assertExactJsonValidate001Destination,
  attemptMarkerExists,
  attemptMarkerRelFor,
  buildControlChecklist,
  compareEnvelopeToIndependent,
  envProxyPresent,
  evidenceBasenamePrefix,
  isApprovedJsonValidate001Url,
  observeAgent402JsonValidate,
  parseValidateEnvelope,
  requestBodySha256,
  validateIndependently,
  writeAttemptMarker,
  type JsonValidateObservationTransport,
} from "../src/providers/agent402-jsonvalidate-observation.ts";
import { sha256Hex } from "../src/providers/discovery-document.ts";
import { runObserveAgent402JsonValidate } from "../src/scripts/observe-agent402-jsonvalidate.ts";

const OBSERVED = "2026-11-24T08:00:00.000Z";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "agenthire-jsonvalidate-"));
  tempRoots.push(root);
  mkdirSync(join(root, "docs/day6/evidence"), { recursive: true });
  mkdirSync(join(root, "docs/day5/evidence"), { recursive: true });
  mkdirSync(join(root, "docs/day4/evidence"), { recursive: true });
  return root;
}

function exchangeFromBody(
  body: unknown,
  overrides?: {
    readonly statusCode?: number;
    readonly elapsedMs?: number;
    readonly headers?: Record<string, string | string[] | undefined>;
  },
): SecureHttpsExchange {
  const buf = Buffer.from(
    typeof body === "string" ? body : JSON.stringify(body),
    "utf8",
  );
  return {
    url: JSONVALIDATE_001_APPROVED_URL,
    finalUrl: JSONVALIDATE_001_APPROVED_URL,
    statusCode: overrides?.statusCode ?? 200,
    headers: {
      "content-type": "application/json",
      ...(overrides?.headers ?? {}),
    },
    contentType: "application/json",
    body: buf,
    sha256: sha256Hex(buf),
    byteLength: buf.length,
    resolvedAddresses: [{ address: "203.0.113.10", family: 4 }],
    pinnedAddress: { address: "203.0.113.10", family: 4 },
    elapsedMs: overrides?.elapsedMs ?? 12,
  };
}

describe("JSONVALIDATE-001 authorization / allowlist", () => {
  it("accepts only the exact approved URL and POST method constants", () => {
    expect(isApprovedJsonValidate001Url(JSONVALIDATE_001_APPROVED_URL)).toBe(
      true,
    );
    expect(
      assertExactJsonValidate001Destination(JSONVALIDATE_001_APPROVED_URL)
        .hostname,
    ).toBe("agent402.tools");
    expect(JSONVALIDATE_001_METHOD).toBe("POST");
    expect(JSONVALIDATE_001_MAX_BYTES).toBe(65_536);
    expect(JSONVALIDATE_001_TIMEOUT_MS).toBe(5_000);
    expect(JSONVALIDATE_001_MARKER_CREATE_STRATEGY).toBe(
      "exclusive-wx-final-path",
    );
    expect(JSONVALIDATE_001_ATTEMPT_MARKER_REL).not.toBe(OPENAPI_001_MARKER_REL);
    expect(JSONVALIDATE_001_ATTEMPT_MARKER_REL).not.toBe(D44B_CATALOG_MARKER_REL);
  });

  it("rejects siblings, trailing slash, query, fragment, http, credentials", () => {
    const bad = [
      "https://agent402.tools/api/json-validate/",
      "https://agent402.tools/api/json-validate?x=1",
      "https://agent402.tools/api/json-validate#frag",
      "http://agent402.tools/api/json-validate",
      "https://user:pass@agent402.tools/api/json-validate",
      "https://agent402.tools/openapi.json",
      "https://agent402.tools/.well-known/x402",
      "https://evil.example/api/json-validate",
    ];
    for (const url of bad) {
      expect(isApprovedJsonValidate001Url(url)).toBe(false);
      expect(() => assertExactJsonValidate001Destination(url)).toThrow();
    }
  });

  it("pins the exact synthetic request body and stable sha256", () => {
    expect(JSONVALIDATE_001_REQUEST_BODY.data.name).toBe("Alice");
    expect(JSONVALIDATE_001_REQUEST_BODY.data.age).toBe(30);
    const a = requestBodySha256();
    const b = requestBodySha256();
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("control checklist (fail-closed)", () => {
  it("is complete when no proxy env is set", () => {
    const controls = buildControlChecklist({
      env: {} as NodeJS.ProcessEnv,
    });
    expect(controls.controlsComplete).toBe(true);
    expect(controls.abortReason).toBeNull();
    expect(controls.maxBytes).toBe(JSONVALIDATE_001_MAX_BYTES);
    expect(controls.secureHttpsPostSupported).toBe(true);
  });

  it("aborts incomplete when proxy env is present", () => {
    expect(
      envProxyPresent({
        HTTPS_PROXY: "http://127.0.0.1:8080",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    const controls = buildControlChecklist({
      env: { HTTPS_PROXY: "http://127.0.0.1:8080" } as NodeJS.ProcessEnv,
    });
    expect(controls.controlsComplete).toBe(false);
    expect(controls.abortReason).toMatch(/PROXY/);
  });
});

describe("independent validation + envelope interpretation", () => {
  it("validates the authorized synthetic fixture offline", () => {
    const result = validateIndependently();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.fixtureKind).toBe("synthetic-independent");
  });

  it("parses {valid,errors} envelope and compares agreement", () => {
    const parsed = parseValidateEnvelope({ valid: true, errors: [] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const comparison = compareEnvelopeToIndependent({
      envelope: parsed.envelope,
      independent: validateIndependently(),
    });
    expect(comparison.agreement).toBe(true);
    expect(comparison.providerValid).toBe(true);
  });

  it("rejects envelopes missing valid/errors", () => {
    expect(parseValidateEnvelope({ ok: true }).ok).toBe(false);
    expect(parseValidateEnvelope({ valid: true }).ok).toBe(false);
    expect(parseValidateEnvelope({ valid: "yes", errors: [] }).ok).toBe(false);
  });

  it("assesses L3 only on 2xx envelope agreement; never L4", () => {
    const l3 = assessLadder({
      status: "success",
      httpStatus: 200,
      networkRequestPerformed: true,
      envelopeComparison: {
        envelopeOk: true,
        providerValid: true,
        independentValid: true,
        agreement: true,
        notes: [],
      },
    });
    expect(l3.observedLevel).toBe("L3");
    expect(l3.neverL4).toBe(true);
    expect(l3.maxAllowed).toBe("L3");

    const l2 = assessLadder({
      status: "paymentRequired",
      httpStatus: 402,
      networkRequestPerformed: true,
      envelopeComparison: null,
    });
    expect(l2.observedLevel).toBe("L2");
    expect(l2.neverL4).toBe(true);
  });
});

describe("dry-run zero network", () => {
  it("plans without calling transport or writing marker", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    const transport = vi.fn<JsonValidateObservationTransport>();
    const result = await observeAgent402JsonValidate({
      runMode: "dry-run",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
    });
    expect(transport).not.toHaveBeenCalled();
    expect(result.result.status).toBe("planned");
    expect(result.result.networkRequestPerformed).toBe(false);
    expect(result.result.authorizationConsumed).toBe(false);
    expect(attemptMarkerExists(markerPath)).toBe(false);
  });

  it("CLI dry-run rejects arbitrary URLs and force-reset flags", async () => {
    await expect(
      runObserveAgent402JsonValidate({
        argv: ["node", "observe", "https://evil.example/"],
        repoRoot: tempRepo(),
      }),
    ).rejects.toThrow(/Arbitrary URL/);
    await expect(
      runObserveAgent402JsonValidate({
        argv: ["node", "observe", "--force"],
        repoRoot: tempRepo(),
      }),
    ).rejects.toThrow(/force-reset|force-retry/);
  });
});

describe("controlsIncomplete aborts without network", () => {
  it("does not call transport or write marker when proxy env set", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    const transport = vi.fn<JsonValidateObservationTransport>();
    const result = await observeAgent402JsonValidate({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: { HTTP_PROXY: "http://127.0.0.1:9" } as NodeJS.ProcessEnv,
    });
    expect(transport).not.toHaveBeenCalled();
    expect(result.result.status).toBe("controlsIncomplete");
    expect(result.result.networkRequestPerformed).toBe(false);
    expect(result.result.authorizationConsumed).toBe(false);
    expect(attemptMarkerExists(markerPath)).toBe(false);
  });
});

describe("single-use attempt guard", () => {
  it("writes marker before transport I/O and sends POST body", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    let markerSeenBeforeTransport = false;
    const transport: JsonValidateObservationTransport = async (_url, deps) => {
      markerSeenBeforeTransport = attemptMarkerExists(markerPath);
      expect(deps?.method).toBe("POST");
      expect(deps?.maxBytes).toBe(JSONVALIDATE_001_MAX_BYTES);
      expect(deps?.timeoutMs).toBe(JSONVALIDATE_001_TIMEOUT_MS);
      expect(deps?.contentType).toBe("application/json");
      expect(typeof deps?.body === "string" || Buffer.isBuffer(deps?.body)).toBe(
        true,
      );
      return exchangeFromBody({ valid: true, errors: [] });
    };
    const result = await observeAgent402JsonValidate({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
      commitRawBody: false,
    });
    expect(markerSeenBeforeTransport).toBe(true);
    expect(result.result.status).toBe("success");
    expect(result.result.interpretation).toBe("B_http_2xx");
    expect(result.result.authorizationConsumed).toBe(true);
    expect(result.result.ladder.observedLevel).toBe("L3");
    expect(attemptMarkerExists(markerPath)).toBe(true);
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as {
      requestId: string;
      purpose: string;
    };
    expect(marker.requestId).toBe(JSONVALIDATE_001_REQUEST_ID);
    expect(marker.purpose).toBe("single-use-live-attempt-guard");
  });

  it("blocks re-run when marker already exists (no silent reset)", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    writeAttemptMarker({ markerPath, writtenAt: OBSERVED });
    const transport = vi.fn<JsonValidateObservationTransport>(async () =>
      exchangeFromBody({ valid: true, errors: [] }),
    );
    const result = await observeAgent402JsonValidate({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
    });
    expect(transport).not.toHaveBeenCalled();
    expect(result.result.status).toBe("attemptBlocked");
    expect(result.result.networkRequestPerformed).toBe(false);
    expect(result.result.authorizationConsumed).toBe(false);
  });

  it("wx create throws AttemptMarkerConflictError on existing file", () => {
    const repo = tempRepo();
    const markerPath = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    writeAttemptMarker({ markerPath, writtenAt: OBSERVED });
    expect(() =>
      writeAttemptMarker({ markerPath, writtenAt: OBSERVED }),
    ).toThrow(AttemptMarkerConflictError);
  });

  it("refuses to write OPENAPI-001 or D4.4b marker paths", () => {
    const repo = tempRepo();
    expect(() =>
      writeAttemptMarker({
        markerPath: join(repo, OPENAPI_001_MARKER_REL),
        writtenAt: OBSERVED,
      }),
    ).toThrow(/must end with|OPENAPI-001|D4\.4b/);
    expect(() =>
      writeAttemptMarker({
        markerPath: join(repo, D44B_CATALOG_MARKER_REL),
        writtenAt: OBSERVED,
      }),
    ).toThrow(/must end with|OPENAPI-001|D4\.4b/);
  });
});

describe("interpretation A/B/C", () => {
  it("A — HTTP 402 preserves challenge offline without follow-up", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    const transport: JsonValidateObservationTransport = async () =>
      exchangeFromBody(
        {
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:84532",
              maxAmountRequired: "1000",
              resource: JSONVALIDATE_001_APPROVED_URL,
              description: "json-validate",
              mimeType: "application/json",
              payTo: "0x0000000000000000000000000000000000000001",
              maxTimeoutSeconds: 60,
              asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
              extra: { name: "USDC", version: "2" },
            },
          ],
        },
        { statusCode: 402 },
      );
    const result = await observeAgent402JsonValidate({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
    });
    expect(result.result.status).toBe("paymentRequired");
    expect(result.result.interpretation).toBe("A_http_402");
    expect(result.result.challengeParse).not.toBeNull();
    expect(result.result.offerPolicy?.paymentApprovalGranted).toBe(false);
    expect(result.result.offerPolicy?.anyPolicyPass).toBe(false);
    expect(result.result.ladder.observedLevel).toBe("L2");
    expect(result.result.nonActions.some((n) => /402/.test(n))).toBe(true);
  });

  it("B — HTTP 2xx validates envelope vs independent fixture", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    const transport: JsonValidateObservationTransport = async () =>
      exchangeFromBody({ valid: true, errors: [] });
    const result = await observeAgent402JsonValidate({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
      commitRawBody: false,
    });
    expect(result.result.status).toBe("success");
    expect(result.result.interpretation).toBe("B_http_2xx");
    expect(result.result.envelopeComparison?.agreement).toBe(true);
    expect(result.result.ladder.observedLevel).toBe("L3");
  });

  it("C — transport error records honest outcome and consumes auth", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    const transport: JsonValidateObservationTransport = async () => {
      throw new SecureFetchError(
        "timeout",
        `Request timed out after ${JSONVALIDATE_001_TIMEOUT_MS}ms`,
        { retryable: true },
      );
    };
    const result = await observeAgent402JsonValidate({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
    });
    expect(result.result.status).toBe("timeout");
    expect(result.result.interpretation).toBe("C_error_or_unexpected");
    expect(result.result.networkRequestPerformed).toBe(true);
    expect(result.result.authorizationConsumed).toBe(true);
    expect(attemptMarkerExists(markerPath)).toBe(true);
  });

  it("C — invalid envelope does not invent success", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    const transport: JsonValidateObservationTransport = async () =>
      exchangeFromBody({ success: true });
    const result = await observeAgent402JsonValidate({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
    });
    expect(result.result.status).toBe("invalidEnvelope");
    expect(result.result.interpretation).toBe("C_error_or_unexpected");
    expect(result.result.ladder.observedLevel).toBe("L2");
  });
});

describe("CLI artifact write / blocked non-overwrite", () => {
  it("does not overwrite prior evidence on attemptBlocked re-run", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    writeAttemptMarker({ markerPath, writtenAt: OBSERVED });
    const prior = join(
      repo,
      "docs/day6/evidence/agent402-jsonvalidate-001-result.json",
    );
    writeFileSync(
      prior,
      JSON.stringify({ status: "success", preserved: true }, null, 2),
    );
    const result = await runObserveAgent402JsonValidate({
      argv: ["node", "observe", "--approved-live"],
      repoRoot: repo,
      markerPath,
      writeArtifacts: true,
      env: {},
    });
    expect(result.status).toBe("attemptBlocked");
    expect(result.networkRequestPerformed).toBe(false);
    expect(JSON.parse(readFileSync(prior, "utf8"))).toEqual({
      status: "success",
      preserved: true,
    });
  });

  it("redacts sensitive response headers in result artifacts", async () => {
    const repo = tempRepo();
    const markerPath = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    const transport: JsonValidateObservationTransport = async () =>
      exchangeFromBody(
        { valid: true, errors: [] },
        {
          headers: {
            "set-cookie": "secret=1",
            authorization: "Bearer x",
            "content-type": "application/json",
          },
        },
      );
    const live = await observeAgent402JsonValidate({
      runMode: "approved-live",
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath,
      transport,
      env: {},
      commitRawBody: false,
    });
    expect(live.result.redactedHeaders?.["set-cookie"]).toBe("[redacted]");
    expect(live.result.redactedHeaders?.authorization).toBe("[redacted]");
    expect(live.result.redactedHeaders?.["content-type"]).toMatch(
      /application\/json/,
    );
    expect(existsSync(markerPath)).toBe(true);
  });
});

describe("JSONVALIDATE-002 distinct marker / artifacts", () => {
  it("uses a distinct marker path and same approved URL/body", () => {
    expect(JSONVALIDATE_002_ATTEMPT_MARKER_REL).not.toBe(
      JSONVALIDATE_001_ATTEMPT_MARKER_REL,
    );
    expect(attemptMarkerRelFor(JSONVALIDATE_002_REQUEST_ID)).toBe(
      JSONVALIDATE_002_ATTEMPT_MARKER_REL,
    );
    expect(evidenceBasenamePrefix(JSONVALIDATE_002_REQUEST_ID)).toBe(
      "agent402-jsonvalidate-002",
    );
    expect(JSONVALIDATE_001_APPROVED_URL).toBe(
      "https://agent402.tools/api/json-validate",
    );
  });

  it("writes 002 marker before I/O and never touches 001 marker", async () => {
    const repo = tempRepo();
    const marker001 = join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL);
    const marker002 = join(repo, JSONVALIDATE_002_ATTEMPT_MARKER_REL);
    writeAttemptMarker({
      markerPath: marker001,
      writtenAt: OBSERVED,
      requestId: JSONVALIDATE_001_REQUEST_ID,
    });
    const prior001Sha = readFileSync(marker001, "utf8");
    let marker002SeenBeforeTransport = false;
    const transport: JsonValidateObservationTransport = async () => {
      marker002SeenBeforeTransport = attemptMarkerExists(marker002);
      return exchangeFromBody({ valid: true, errors: [] });
    };
    const result = await observeAgent402JsonValidate({
      runMode: "approved-live",
      requestId: JSONVALIDATE_002_REQUEST_ID,
      observedAt: OBSERVED,
      repoRoot: repo,
      transport,
      env: {},
      commitRawBody: false,
    });
    expect(marker002SeenBeforeTransport).toBe(true);
    expect(result.result.requestId).toBe(JSONVALIDATE_002_REQUEST_ID);
    expect(result.result.status).toBe("success");
    expect(attemptMarkerExists(marker002)).toBe(true);
    expect(readFileSync(marker001, "utf8")).toBe(prior001Sha);
    const marker = JSON.parse(readFileSync(marker002, "utf8")) as {
      requestId: string;
    };
    expect(marker.requestId).toBe(JSONVALIDATE_002_REQUEST_ID);
  });

  it("refuses to write 002 into the 001 marker path", () => {
    const repo = tempRepo();
    expect(() =>
      writeAttemptMarker({
        markerPath: join(repo, JSONVALIDATE_001_ATTEMPT_MARKER_REL),
        writtenAt: OBSERVED,
        requestId: JSONVALIDATE_002_REQUEST_ID,
      }),
    ).toThrow(/must end with|sibling|OPENAPI|D4\.4b/);
  });

  it("CLI accepts --request-id=JSONVALIDATE-002 and rejects force-reset", async () => {
    const repo = tempRepo();
    const dry = await runObserveAgent402JsonValidate({
      argv: ["node", "observe", "--request-id=JSONVALIDATE-002"],
      repoRoot: repo,
      env: {},
    });
    expect(dry.requestId).toBe(JSONVALIDATE_002_REQUEST_ID);
    expect(dry.status).toBe("planned");
    expect(dry.networkRequestPerformed).toBe(false);
    expect(
      attemptMarkerExists(join(repo, JSONVALIDATE_002_ATTEMPT_MARKER_REL)),
    ).toBe(false);
    await expect(
      runObserveAgent402JsonValidate({
        argv: [
          "node",
          "observe",
          "--request-id=JSONVALIDATE-002",
          "--force",
        ],
        repoRoot: repo,
      }),
    ).rejects.toThrow(/force-reset|force-retry/);
  });

  it("CLI writes 002 evidence via observe + artifact helper paths", async () => {
    const repo = tempRepo();
    const prior001 = join(
      repo,
      "docs/day6/evidence/agent402-jsonvalidate-001-result.json",
    );
    writeFileSync(
      prior001,
      JSON.stringify({ status: "preserved-001", keep: true }, null, 2),
    );
    const marker002 = join(repo, JSONVALIDATE_002_ATTEMPT_MARKER_REL);
    const transport: JsonValidateObservationTransport = async () =>
      exchangeFromBody({ valid: true, errors: [] });
    const live = await observeAgent402JsonValidate({
      runMode: "approved-live",
      requestId: JSONVALIDATE_002_REQUEST_ID,
      observedAt: OBSERVED,
      repoRoot: repo,
      markerPath: marker002,
      transport,
      env: {},
      commitRawBody: true,
    });
    expect(live.result.requestId).toBe(JSONVALIDATE_002_REQUEST_ID);
    expect(live.result.rawBodyPath).toBe(
      "docs/day6/evidence/agent402-jsonvalidate-002-response-raw.json",
    );
    // Simulate CLI artifact write for 002 only
    const evidenceDir = join(repo, "docs/day6/evidence");
    writeFileSync(
      join(evidenceDir, "agent402-jsonvalidate-002-request.json"),
      JSON.stringify(live.request, null, 2),
    );
    writeFileSync(
      join(evidenceDir, "agent402-jsonvalidate-002-result.json"),
      JSON.stringify(live.result, null, 2),
    );
    expect(JSON.parse(readFileSync(prior001, "utf8"))).toEqual({
      status: "preserved-001",
      keep: true,
    });
    expect(
      existsSync(join(evidenceDir, "agent402-jsonvalidate-002-result.json")),
    ).toBe(true);
  });
});

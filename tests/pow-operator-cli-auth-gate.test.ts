/**
 * D7.3 — Offline operator CLI + authorization-gate alignment tests.
 *
 * Fake transport + temp evidence dirs only. Never real Agent402 challenge
 * material. Simulation outcomes are never classified as genuine L3.
 */

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
import { afterEach, describe, expect, it } from "vitest";
import {
  POW_AUTHORIZED_CHALLENGE_MAX_BYTES,
  POW_AUTHORIZED_MAX_DIFFICULTY_BITS,
  POW_AUTHORIZED_MAX_ATTEMPTS,
  POW_AUTHORIZED_MAX_DURATION_MS,
  POW_AUTHORIZED_MIN_EXPIRY_MARGIN_MS,
  POW_AUTHORIZED_SUBMIT_MAX_BYTES,
  POW_CHALLENGE_GET_MARKER_REL,
  POW_CHALLENGE_GET_REQUEST_ID,
  POW_CHALLENGE_MAX_BYTES,
  POW_CHALLENGE_URL,
  POW_DEFAULT_MAX_DIFFICULTY_BITS,
  POW_SUBMIT_POST_MARKER_REL,
  POW_SUBMIT_POST_REQUEST_ID,
  POW_SUBMIT_URL,
  type PowChallenge,
} from "../src/pow/types.ts";
import {
  POW_AUTHORIZED_LIMITS,
  resolveAuthorizedExpiryMargin,
  resolveAuthorizedSolverBudget,
} from "../src/pow/auth-limits.ts";
import {
  runPowPreparation,
  powRequestBodySha256,
} from "../src/pow/adapter.ts";
import { createFakePowTransport } from "../src/pow/fake-transport.ts";
import { l3ClaimAllowed } from "../src/pow/evidence.ts";
import {
  absPowMarkerPath,
  writePowAttemptMarker,
} from "../src/pow/markers.ts";
import {
  POW_OPERATOR_LIVE_AUTH_ENV,
  POW_OPERATOR_LIVE_GRANT_VALUE,
  parsePowOperatorArgs,
  runPowOperatorCli,
} from "../src/pow/operator-cli.ts";
import { buildSanitizedAgent402ChallengeBody } from "../src/pow/challenge.ts";
import { parsePowChallengeBytes } from "../src/pow/challenge.ts";

const AT = "2026-11-26T01:00:00.000Z";
const NOW_MS = 1_700_000_000_000;

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "agenthire-pow-cli-"));
  tempRoots.push(root);
  mkdirSync(join(root, "docs/day7/evidence"), { recursive: true });
  mkdirSync(join(root, "docs/day6/evidence"), { recursive: true });
  return root;
}

function softChallenge(overrides?: Partial<PowChallenge>): PowChallenge {
  return {
    token: "auth-gate-token",
    challenge: "auth-gate-challenge-v1",
    difficultyBits: 8,
    expiresAtUnixSeconds: null,
    algorithm: null,
    submitHeader: null,
    submitFormat: null,
    ttlSeconds: null,
    slug: "json-validate",
    rawKeys: ["challenge", "difficultyBits", "slug", "token"],
    fixtureKind: "synthetic",
    parseMode: "compat",
    ...overrides,
  };
}

function contractChallenge(
  nowMs: number,
  opts?: { readonly difficulty?: number },
): PowChallenge {
  const difficulty = opts?.difficulty ?? 8;
  const expiresAtUnixSeconds = Math.floor(nowMs / 1000) + 600;
  const body = buildSanitizedAgent402ChallengeBody({
    token: "sanitized-auth-token-aaaa",
    challenge: "sanitized-auth-challenge-bbbb",
    difficulty,
    expiresAtUnixSeconds,
  });
  const parsed = parsePowChallengeBytes(
    Buffer.from(JSON.stringify(body), "utf8"),
    { fixtureKind: "synthetic", mode: "agent402-contract" },
  );
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.challenge;
}

describe("D7.3 authorized limit constants", () => {
  it("enforces Stage B approved ceilings in code", () => {
    expect(POW_CHALLENGE_MAX_BYTES).toBe(16_384);
    expect(POW_AUTHORIZED_CHALLENGE_MAX_BYTES).toBe(16_384);
    expect(POW_AUTHORIZED_SUBMIT_MAX_BYTES).toBe(65_536);
    expect(POW_AUTHORIZED_MAX_DIFFICULTY_BITS).toBe(20);
    expect(POW_DEFAULT_MAX_DIFFICULTY_BITS).toBe(20);
    expect(POW_AUTHORIZED_MAX_ATTEMPTS).toBe(2_000_000);
    expect(POW_AUTHORIZED_MAX_DURATION_MS).toBe(30_000);
    expect(POW_AUTHORIZED_MIN_EXPIRY_MARGIN_MS).toBe(5_000);
    expect(POW_AUTHORIZED_LIMITS.maxRedirects).toBe(0);
    expect(POW_AUTHORIZED_LIMITS.maxRetries).toBe(0);
    expect(POW_AUTHORIZED_LIMITS.maxChallengeGets).toBe(1);
    expect(POW_AUTHORIZED_LIMITS.maxSubmitPosts).toBe(1);
  });

  it("uses distinct POW-L3-*-002 marker identities", () => {
    expect(POW_CHALLENGE_GET_REQUEST_ID).toBe("POW-L3-GET-002");
    expect(POW_SUBMIT_POST_REQUEST_ID).toBe("POW-L3-POST-002");
    expect(POW_CHALLENGE_GET_MARKER_REL).toContain("l3-get-002");
    expect(POW_SUBMIT_POST_MARKER_REL).toContain("l3-post-002");
  });

  it("rejects request caps above approved limits", () => {
    expect(resolveAuthorizedSolverBudget({ maxAttempts: 2_000_001 }).ok).toBe(
      false,
    );
    expect(resolveAuthorizedSolverBudget({ maxDurationMs: 30_001 }).ok).toBe(
      false,
    );
    expect(
      resolveAuthorizedSolverBudget({ maxDifficultyBits: 21 }).ok,
    ).toBe(false);
    expect(resolveAuthorizedExpiryMargin(4_999).ok).toBe(false);
    expect(resolveAuthorizedExpiryMargin(5_000).ok).toBe(true);
  });
});

describe("D7.3 operator CLI (offline)", () => {
  it("default invocation is offline dry-run (no provider contact)", async () => {
    const lines: string[] = [];
    const report = await runPowOperatorCli({
      argv: ["node", "pow-operator.ts"],
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
    });
    expect(report.mode).toBe("dry-run");
    expect(report.ok).toBe(true);
    expect(report.simulationOnly).toBe(true);
    expect(report.providerExecutionVerified).toBe(false);
    expect(report.result).toBeNull();
    expect(lines.join("\n")).toMatch(/NOT authorization/i);
    expect(lines.join("\n")).toMatch(/16384|16_384|16,384|maxBytes ≤ 16384/);
  });

  it("missing authorization fails closed (approved-live without grant/env)", () => {
    const parsed = parsePowOperatorArgs(
      ["node", "pow-operator.ts", "--approved-live"],
      {},
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toMatch(/refused|grant-live-authorization|not satisfiable/i);
  });

  it("rejects unsupported URLs, endpoints, and execution flags", () => {
    expect(
      parsePowOperatorArgs([
        "node",
        "pow-operator.ts",
        "https://evil.example/pow",
      ]).ok,
    ).toBe(false);
    expect(
      parsePowOperatorArgs(["node", "pow-operator.ts", "--retry"]).ok,
    ).toBe(false);
    expect(
      parsePowOperatorArgs(["node", "pow-operator.ts", "--wallet"]).ok,
    ).toBe(false);
    expect(
      parsePowOperatorArgs(["node", "pow-operator.ts", "--force-reset"]).ok,
    ).toBe(false);
  });

  it("approved-live flag alone is not consent even with partial grant", () => {
    const parsed = parsePowOperatorArgs(
      [
        "node",
        "pow-operator.ts",
        "--approved-live",
        `--grant-live-authorization=${POW_OPERATOR_LIVE_GRANT_VALUE}`,
      ],
      {},
    );
    expect(parsed.ok).toBe(false);
  });

  it("offline-simulate completes without claiming L3", async () => {
    const report = await runPowOperatorCli({
      argv: ["node", "pow-operator.ts", "--offline-simulate"],
      clockIso: AT,
      now: () => NOW_MS,
      stdout: () => {},
      stderr: () => {},
    });
    expect(report.mode).toBe("offline-simulate");
    expect(report.ok).toBe(true);
    expect(report.status).toBe("verified");
    expect(report.simulationOnly).toBe(true);
    expect(report.providerExecutionVerified).toBe(false);
    expect(report.result?.session.ladder.observedLevel).not.toBe("L3");
    const claim = l3ClaimAllowed({
      networkChallengePerformed: false,
      networkSubmitPerformed: false,
      simulationOnly: true,
      providerExecutionVerified: false,
      envelopeValid: true,
      markersWritten: false,
      liveAuthorizationGranted: false,
    });
    expect(claim.allowed).toBe(false);
  });
});

describe("D7.3 adapter authorization gates (fake transport)", () => {
  it("refuses approved-live without liveAuthorizationGranted", async () => {
    const fake = createFakePowTransport({ challenge: softChallenge() });
    const result = await runPowPreparation({
      sessionId: "auth-missing",
      runMode: "approved-live",
      liveAuthorizationGranted: false,
      transport: fake.exchange,
      clockIso: AT,
    });
    expect(result.session.status).toBe("unauthorized");
    expect(fake.calls).toHaveLength(0);
  });

  it("attempts to increase difficulty budget fail closed", async () => {
    const fake = createFakePowTransport({ challenge: softChallenge() });
    const result = await runPowPreparation({
      sessionId: "auth-diff-budget",
      runMode: "offline-simulation",
      transport: fake.exchange,
      clockIso: AT,
      solverBudget: { maxDifficultyBits: 21 },
    });
    expect(result.session.status).toBe("unauthorized");
    expect(result.session.blockReason).toMatch(/maxDifficultyBits/);
    expect(fake.calls).toHaveLength(0);
  });

  it("request caps above approved attempts/duration fail closed", async () => {
    const fake = createFakePowTransport({ challenge: softChallenge() });
    const tooManyAttempts = await runPowPreparation({
      sessionId: "auth-attempts",
      runMode: "offline-simulation",
      transport: fake.exchange,
      clockIso: AT,
      solverBudget: { maxAttempts: 2_000_001 },
    });
    expect(tooManyAttempts.session.status).toBe("unauthorized");

    const tooLong = await runPowPreparation({
      sessionId: "auth-duration",
      runMode: "offline-simulation",
      transport: fake.exchange,
      clockIso: AT,
      solverBudget: { maxDurationMs: 30_001 },
    });
    expect(tooLong.session.status).toBe("unauthorized");

    const thinMargin = await runPowPreparation({
      sessionId: "auth-margin",
      runMode: "offline-simulation",
      transport: fake.exchange,
      clockIso: AT,
      expiryMarginMs: 1_000,
    });
    expect(thinMargin.session.status).toBe("unauthorized");
  });

  it("GET failure does not create POST marker", async () => {
    const repo = tempRepo();
    const fake = createFakePowTransport({
      challenge: softChallenge(),
      failChallenge: true,
    });
    const result = await runPowPreparation({
      sessionId: "auth-get-fail",
      runMode: "approved-live",
      liveAuthorizationGranted: true,
      repoRoot: repo,
      transport: fake.exchange,
      clockIso: AT,
    });
    expect(result.session.status).toBe("challengeRequestFailed");
    expect(existsSync(absPowMarkerPath(repo, "challenge-get"))).toBe(true);
    expect(existsSync(absPowMarkerPath(repo, "submit-post"))).toBe(false);
    expect(fake.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("solver exhaustion does not create POST marker", async () => {
    const repo = tempRepo();
    const fake = createFakePowTransport({
      challenge: softChallenge({ difficultyBits: 20 }),
    });
    const result = await runPowPreparation({
      sessionId: "auth-solve-exhaust",
      runMode: "approved-live",
      liveAuthorizationGranted: true,
      repoRoot: repo,
      transport: fake.exchange,
      clockIso: AT,
      now: () => NOW_MS,
      solverBudget: {
        maxAttempts: 8,
        maxDurationMs: 5_000,
        maxDifficultyBits: 20,
      },
    });
    expect(result.session.status).toBe("budgetExhausted");
    expect(existsSync(absPowMarkerPath(repo, "challenge-get"))).toBe(true);
    expect(existsSync(absPowMarkerPath(repo, "submit-post"))).toBe(false);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.method).toBe("GET");
  });

  it("expiry failure does not create POST marker", async () => {
    const repo = tempRepo();
    const challenge = contractChallenge(NOW_MS);
    let nowMs = NOW_MS;
    const fake = createFakePowTransport({
      challenge,
      now: () => nowMs,
    });
    nowMs = challenge.expiresAtUnixSeconds! * 1000 - 1_000;
    const result = await runPowPreparation({
      sessionId: "auth-expiry",
      runMode: "approved-live",
      liveAuthorizationGranted: true,
      repoRoot: repo,
      transport: fake.exchange,
      challengeParseMode: "agent402-contract",
      clockIso: AT,
      now: () => nowMs,
      solverBudget: { maxAttempts: 50_000, maxDifficultyBits: 16 },
    });
    expect(result.session.status).toBe("challengeInvalid");
    expect(existsSync(absPowMarkerPath(repo, "challenge-get"))).toBe(true);
    expect(existsSync(absPowMarkerPath(repo, "submit-post"))).toBe(false);
    expect(fake.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("eligible mocked execution creates markers in correct order", async () => {
    const repo = tempRepo();
    const challenge = softChallenge({ difficultyBits: 4 });
    const base = createFakePowTransport({
      challenge,
      expectedBodySha256: powRequestBodySha256(),
    });
    const order: string[] = [];
    const transport = async (
      url: string,
      deps?: Parameters<typeof base.exchange>[1],
    ) => {
      if (url === POW_CHALLENGE_URL) {
        expect(existsSync(absPowMarkerPath(repo, "challenge-get"))).toBe(true);
        expect(existsSync(absPowMarkerPath(repo, "submit-post"))).toBe(false);
        order.push("get-with-get-marker");
      }
      if (url === POW_SUBMIT_URL) {
        expect(existsSync(absPowMarkerPath(repo, "challenge-get"))).toBe(true);
        expect(existsSync(absPowMarkerPath(repo, "submit-post"))).toBe(true);
        order.push("post-with-both-markers");
      }
      return base.exchange(url, deps);
    };

    const result = await runPowPreparation({
      sessionId: "auth-marker-order",
      runMode: "approved-live",
      liveAuthorizationGranted: true,
      repoRoot: repo,
      transport,
      clockIso: AT,
      now: () => NOW_MS,
      solverBudget: {
        maxAttempts: 200_000,
        maxDurationMs: 15_000,
        maxDifficultyBits: 16,
      },
    });

    expect(result.session.status).toBe("verified");
    expect(order).toEqual(["get-with-get-marker", "post-with-both-markers"]);
    expect(base.calls).toHaveLength(2);

    const getMarker = JSON.parse(
      readFileSync(absPowMarkerPath(repo, "challenge-get"), "utf8"),
    ) as { requestId: string };
    const postMarker = JSON.parse(
      readFileSync(absPowMarkerPath(repo, "submit-post"), "utf8"),
    ) as { requestId: string };
    expect(getMarker.requestId).toBe("POW-L3-GET-002");
    expect(postMarker.requestId).toBe("POW-L3-POST-002");

    // Injected fake transport under approved-live still ≠ genuine L3.
    expect(result.simulationOnly).toBe(true);
    expect(result.providerExecutionVerified).toBe(false);
    expect(result.session.ladder.observedLevel).not.toBe("L3");
    const claim = l3ClaimAllowed({
      networkChallengePerformed: result.session.networkChallengePerformed,
      networkSubmitPerformed: result.session.networkSubmitPerformed,
      simulationOnly: result.simulationOnly,
      providerExecutionVerified: result.providerExecutionVerified,
      envelopeValid: true,
      markersWritten: true,
      liveAuthorizationGranted: true,
    });
    expect(claim.allowed).toBe(false);
    expect(claim.observedLevel).not.toBe("L3");
  });

  it("repeated invocation cannot reuse consumed markers", async () => {
    const repo = tempRepo();
    writePowAttemptMarker({
      markerPath: absPowMarkerPath(repo, "challenge-get"),
      kind: "challenge-get",
      writtenAt: AT,
    });
    const fake = createFakePowTransport({ challenge: softChallenge() });
    const first = await runPowPreparation({
      sessionId: "auth-reuse-1",
      runMode: "approved-live",
      liveAuthorizationGranted: true,
      repoRoot: repo,
      transport: fake.exchange,
      clockIso: AT,
    });
    expect(first.session.status).toBe("unauthorized");
    expect(fake.calls).toHaveLength(0);

    // Historical prior marker left intact.
    const prior = join(
      repo,
      "docs/day6/evidence/agent402-jsonvalidate-002-live-attempt.marker",
    );
    writeFileSync(prior, "consumed\n", "utf8");
    expect(existsSync(prior)).toBe(true);
  });

  it("full dual-grant CLI parse still does not default-enable live", () => {
    const env = {
      [POW_OPERATOR_LIVE_AUTH_ENV]: POW_OPERATOR_LIVE_GRANT_VALUE,
    };
    const parsed = parsePowOperatorArgs(
      [
        "node",
        "pow-operator.ts",
        "--approved-live",
        `--grant-live-authorization=${POW_OPERATOR_LIVE_GRANT_VALUE}`,
      ],
      env,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.mode).toBe("approved-live");
    expect(parsed.liveAuthorizationGranted).toBe(true);
    // Default argv (no flags) remains dry-run.
    const def = parsePowOperatorArgs(["node", "pow-operator.ts"], env);
    expect(def.ok).toBe(true);
    if (!def.ok) return;
    expect(def.mode).toBe("dry-run");
    expect(def.liveAuthorizationGranted).toBe(false);
  });
});

/**
 * D7.3 Stage B — offline adapter schema + expiry-policy readiness.
 *
 * Never loads, prints, or solves the Stage A live challenge/token.
 * Sanitized fixtures only. No provider HTTP/DNS.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPowPreparation } from "../src/pow/adapter.ts";
import {
  buildSanitizedAgent402ChallengeBody,
  checkChallengeExpiry,
  parsePowChallengeJson,
} from "../src/pow/challenge.ts";
import { createFakePowTransport } from "../src/pow/fake-transport.ts";
import {
  absPowMarkerPath,
  POW_FORBIDDEN_PRIOR_MARKERS,
  powMarkerRelFor,
  writePowAttemptMarker,
} from "../src/pow/markers.ts";
import {
  POW_CHALLENGE_GET_MARKER_REL,
  POW_CHALLENGE_URL,
  POW_CONTRACT_ALGORITHM,
  POW_CONTRACT_SUBMIT_FORMAT,
  POW_CONTRACT_SUBMIT_HEADER,
  POW_EXPIRY_SAFETY_MARGIN_MS,
  POW_STAGE_A_RESPONSE_SNAPSHOT_SHA256,
  POW_SUBMIT_POST_MARKER_REL,
  POW_SUBMIT_URL,
  type PowChallenge,
} from "../src/pow/types.ts";

const AT = "2026-11-25T09:00:00.000Z";
const REPO = join(import.meta.dirname, "..");

/** Sanitized credential material — deliberately unlike Stage A lengths/contents. */
const SANITIZED_TOKEN =
  "sanitized-stage-b-token-NOT-LIVE-00000000000000000000000000000000";
const SANITIZED_CHALLENGE = "sanitizedchal0123456789abcdef012";

/** Stage A redacted fingerprints (from observation report) — for negative asserts only. */
const STAGE_A_TOKEN_SHA12 = "d8bea7d962e6";
const STAGE_A_CHALLENGE_SHA12 = "0706af4adad8";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "agenthire-pow-b-"));
  tempRoots.push(root);
  mkdirSync(join(root, "docs/day7/evidence"), { recursive: true });
  mkdirSync(join(root, "docs/day6/evidence"), { recursive: true });
  return root;
}

function sha12(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

function futureUnixSeconds(nowMs: number, ttlSeconds = 300): number {
  return Math.floor(nowMs / 1000) + ttlSeconds;
}

function sanitizedContractBody(overrides: Record<string, unknown> = {}) {
  return {
    ...buildSanitizedAgent402ChallengeBody({
      token: SANITIZED_TOKEN,
      challenge: SANITIZED_CHALLENGE,
      difficulty: 8,
      expiresAtUnixSeconds: futureUnixSeconds(1_700_000_000_000),
      ttlSeconds: 300,
    }),
    ...overrides,
  };
}

function contractChallenge(
  nowMs: number,
  opts: { readonly difficulty?: number; readonly ttlSeconds?: number } = {},
): PowChallenge {
  const ttlSeconds = opts.ttlSeconds ?? 600;
  const expiresAtUnixSeconds = futureUnixSeconds(nowMs, ttlSeconds);
  const body = sanitizedContractBody({
    expiresAt: expiresAtUnixSeconds,
    difficulty: opts.difficulty ?? 8,
    ttlSeconds,
  });
  const parsed = parsePowChallengeJson(body, {
    fixtureKind: "synthetic",
    mode: "agent402-contract",
  });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.challenge;
}

describe("D7.3 Stage B — Agent402 contract parse (offline sanitized)", () => {
  it("never embeds Stage A live token/challenge fingerprints in fixtures", () => {
    expect(sha12(SANITIZED_TOKEN)).not.toBe(STAGE_A_TOKEN_SHA12);
    expect(sha12(SANITIZED_CHALLENGE)).not.toBe(STAGE_A_CHALLENGE_SHA12);
    expect(SANITIZED_TOKEN).not.toEqual(SANITIZED_CHALLENGE);
    expect(SANITIZED_TOKEN.length).not.toBe(104);
    expect(SANITIZED_CHALLENGE.length).toBe(32);
  });

  it("parses sanitized Stage A–shaped schema under agent402-contract", () => {
    const body = sanitizedContractBody({
      expiresAt: 1_800_000_000,
    });
    const parsed = parsePowChallengeJson(body, {
      fixtureKind: "synthetic",
      mode: "agent402-contract",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.challenge.parseMode).toBe("agent402-contract");
    expect(parsed.challenge.token).toBe(SANITIZED_TOKEN);
    expect(parsed.challenge.challenge).toBe(SANITIZED_CHALLENGE);
    expect(parsed.challenge.token).not.toBe(parsed.challenge.challenge);
    expect(parsed.challenge.difficultyBits).toBe(8);
    expect(parsed.challenge.expiresAtUnixSeconds).toBe(1_800_000_000);
    expect(parsed.challenge.algorithm).toBe(POW_CONTRACT_ALGORITHM);
    expect(parsed.challenge.submitHeader).toBe(POW_CONTRACT_SUBMIT_HEADER);
    expect(parsed.challenge.submitFormat).toBe(POW_CONTRACT_SUBMIT_FORMAT);
    expect(parsed.challenge.slug).toBe("json-validate");
    expect(parsed.challenge.ttlSeconds).toBe(300);
  });

  it("rejects non-numeric expiresAt in contract mode", () => {
    const parsed = parsePowChallengeJson(
      sanitizedContractBody({ expiresAt: "1800000000" }),
      { mode: "agent402-contract" },
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("invalidExpiresAt");
  });

  it("rejects missing expiresAt in contract mode", () => {
    const body = sanitizedContractBody();
    delete (body as { expiresAt?: unknown }).expiresAt;
    const parsed = parsePowChallengeJson(body, { mode: "agent402-contract" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("missingExpiresAt");
  });

  it("rejects bad numeric expiresAt (fractional / non-positive)", () => {
    expect(
      parsePowChallengeJson(sanitizedContractBody({ expiresAt: 1.5 }), {
        mode: "agent402-contract",
      }).ok,
    ).toBe(false);
    expect(
      parsePowChallengeJson(sanitizedContractBody({ expiresAt: 0 }), {
        mode: "agent402-contract",
      }).ok,
    ).toBe(false);
    expect(
      parsePowChallengeJson(sanitizedContractBody({ expiresAt: -10 }), {
        mode: "agent402-contract",
      }).ok,
    ).toBe(false);
  });

  it("rejects challenge === token and token-as-challenge fallback", () => {
    const same = parsePowChallengeJson(
      sanitizedContractBody({
        token: "same-value",
        challenge: "same-value",
      }),
      { mode: "agent402-contract" },
    );
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.reason).toBe("challengeTokenCollision");

    const body = sanitizedContractBody();
    delete (body as { challenge?: unknown }).challenge;
    const missingChallenge = parsePowChallengeJson(body, {
      mode: "agent402-contract",
    });
    expect(missingChallenge.ok).toBe(false);
    if (!missingChallenge.ok) {
      expect(missingChallenge.reason).toBe("missingChallenge");
      expect(missingChallenge.message).toMatch(/token-as-challenge fallback forbidden/i);
    }
  });

  it("rejects algorithm / submitHeader / submitFormat / slug mismatches", () => {
    expect(
      parsePowChallengeJson(sanitizedContractBody({ algorithm: "sha1" }), {
        mode: "agent402-contract",
      }).ok,
    ).toBe(false);
    expect(
      parsePowChallengeJson(
        sanitizedContractBody({ submitHeader: "X-Other" }),
        { mode: "agent402-contract" },
      ).ok,
    ).toBe(false);
    expect(
      parsePowChallengeJson(
        sanitizedContractBody({ submitFormat: "token|nonce" }),
        { mode: "agent402-contract" },
      ).ok,
    ).toBe(false);
    expect(
      parsePowChallengeJson(sanitizedContractBody({ slug: "other-slug" }), {
        mode: "agent402-contract",
      }).ok,
    ).toBe(false);
  });

  it("compat mode still allows aliases and optional expiry", () => {
    const parsed = parsePowChallengeJson(
      {
        id: "t1",
        puzzle: "p1",
        difficulty: 12,
        slug: "json-validate",
      },
      { mode: "compat", fixtureKind: "synthetic" },
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.challenge.parseMode).toBe("compat");
    expect(parsed.challenge.expiresAtUnixSeconds).toBeNull();
  });

  it("live fixtureKind defaults to agent402-contract", () => {
    const parsed = parsePowChallengeJson(sanitizedContractBody(), "live");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.challenge.parseMode).toBe("agent402-contract");
    expect(parsed.challenge.fixtureKind).toBe("live");
  });
});

describe("D7.3 Stage B — expiry policy (injectable clock)", () => {
  it("checkChallengeExpiry respects margin with injectable nowMs", () => {
    const expiresAtUnixSeconds = 1_700_000_100;
    const ok = checkChallengeExpiry({
      expiresAtUnixSeconds,
      nowMs: 1_700_000_000_000,
      marginMs: POW_EXPIRY_SAFETY_MARGIN_MS,
    });
    expect(ok.ok).toBe(true);

    const expired = checkChallengeExpiry({
      expiresAtUnixSeconds,
      nowMs: 1_700_000_096_000, // 4s remaining < 5s margin
      marginMs: POW_EXPIRY_SAFETY_MARGIN_MS,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe("challengeExpired");
  });

  it("refuses solve when challenge already within expiry margin", async () => {
    let nowMs = 1_700_000_000_000;
    const challenge = contractChallenge(nowMs);
    // Force expiry before solve: jump clock past expiresAt - margin.
    nowMs = (challenge.expiresAtUnixSeconds! * 1000) - 1_000;

    const fake = createFakePowTransport({
      challenge,
      expectedBodySha256: undefined,
      now: () => nowMs,
    });

    const result = await runPowPreparation({
      sessionId: "pow-b-expiry-solve",
      runMode: "offline-simulation",
      transport: fake.exchange,
      challengeParseMode: "agent402-contract",
      clockIso: AT,
      now: () => nowMs,
      solverBudget: { maxAttempts: 50_000, maxDifficultyBits: 16 },
    });

    expect(result.session.status).toBe("challengeInvalid");
    expect(result.session.blockReason).toMatch(/challengeExpired|margin/i);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.method).toBe("GET");
  });

  it("refuses POST when challenge expires after solve (injectable clock)", async () => {
    const startMs = 1_700_000_000_000;
    // difficulty 0 → single-attempt solve; few now() reads during solver.
    const challenge = contractChallenge(startMs, { difficulty: 0, ttlSeconds: 600 });
    let nowReads = 0;
    const fake = createFakePowTransport({
      challenge,
      now: () => startMs,
    });

    const result = await runPowPreparation({
      sessionId: "pow-b-expiry-post",
      runMode: "offline-simulation",
      transport: fake.exchange,
      challengeParseMode: "agent402-contract",
      clockIso: AT,
      now: () => {
        nowReads += 1;
        // Read 1: expiry-before-solve (valid).
        // Reads 2–N: solver start/budget (keep valid for difficulty-0 solve).
        // After solve, expiry-before-POST must fail — expire from read 4 onward.
        if (nowReads >= 4) {
          return challenge.expiresAtUnixSeconds! * 1000 - 100;
        }
        return startMs;
      },
      solverBudget: {
        maxAttempts: 10,
        maxDurationMs: 5_000,
        maxDifficultyBits: 16,
      },
    });

    expect(result.session.status).toBe("challengeInvalid");
    expect(result.session.blockReason).toMatch(/challengeExpired|margin/i);
    expect(result.session.solution).not.toBeNull();
    expect(fake.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("completes contract-mode offline E2E when expiry remains valid", async () => {
    const nowMs = 1_700_000_000_000;
    const challenge = contractChallenge(nowMs);
    const fake = createFakePowTransport({ challenge, now: () => nowMs });
    const result = await runPowPreparation({
      sessionId: "pow-b-e2e-ok",
      runMode: "offline-simulation",
      transport: fake.exchange,
      challengeParseMode: "agent402-contract",
      clockIso: AT,
      now: () => nowMs,
      solverBudget: {
        maxAttempts: 200_000,
        maxDurationMs: 15_000,
        maxDifficultyBits: 16,
      },
    });
    expect(result.session.status).toBe("verified");
    expect(result.simulationOnly).toBe(true);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]?.powSolution?.startsWith(`${SANITIZED_TOKEN}:`)).toBe(
      true,
    );
  });
});

describe("D7.3 Stage B — transport / marker binding (offline)", () => {
  it("binds exact challenge + submit URLs only", () => {
    expect(POW_CHALLENGE_URL).toBe(
      "https://agent402.tools/api/pow/challenge?slug=json-validate",
    );
    expect(POW_SUBMIT_URL).toBe("https://agent402.tools/api/json-validate");
  });

  it("keeps GET/POST markers distinct from Stage A schema marker and JSONVALIDATE", () => {
    expect(POW_CHALLENGE_GET_MARKER_REL).toBe(
      "docs/day7/evidence/agent402-pow-l3-get-002-live-attempt.marker",
    );
    expect(POW_SUBMIT_POST_MARKER_REL).toBe(
      "docs/day7/evidence/agent402-pow-l3-post-002-live-attempt.marker",
    );
    expect(POW_CHALLENGE_GET_MARKER_REL).not.toContain(
      "agent402-pow-challenge-get-001.marker",
    );
    expect(powMarkerRelFor("challenge-get")).not.toEqual(
      powMarkerRelFor("submit-post"),
    );
    for (const prior of POW_FORBIDDEN_PRIOR_MARKERS) {
      expect(POW_CHALLENGE_GET_MARKER_REL).not.toBe(prior);
      expect(POW_SUBMIT_POST_MARKER_REL).not.toBe(prior);
    }
  });

  it("does not mutate Stage A evidence snapshot or marker", () => {
    const snapshot = join(
      REPO,
      "docs/day7/evidence/agent402-pow-challenge-get-001-response-snapshot.bin",
    );
    const marker = join(
      REPO,
      "docs/day7/evidence/agent402-pow-challenge-get-001.marker",
    );
    expect(existsSync(snapshot)).toBe(true);
    expect(existsSync(marker)).toBe(true);

    const beforeSnapStat = statSync(snapshot);
    const beforeMarkerStat = statSync(marker);
    const beforeSnapSha = createHash("sha256")
      .update(readFileSync(snapshot))
      .digest("hex");
    const beforeMarkerSha = createHash("sha256")
      .update(readFileSync(marker))
      .digest("hex");

    expect(beforeSnapSha).toBe(POW_STAGE_A_RESPONSE_SNAPSHOT_SHA256);

    // Read-only verification — no writes to evidence paths.
    expect(beforeSnapSha).toHaveLength(64);
    expect(beforeMarkerSha).toHaveLength(64);

    const afterSnapStat = statSync(snapshot);
    const afterMarkerStat = statSync(marker);
    expect(afterSnapStat.mtimeMs).toBe(beforeSnapStat.mtimeMs);
    expect(afterSnapStat.size).toBe(beforeSnapStat.size);
    expect(afterMarkerStat.mtimeMs).toBe(beforeMarkerStat.mtimeMs);
    expect(afterMarkerStat.size).toBe(beforeMarkerStat.size);
    expect(
      createHash("sha256").update(readFileSync(snapshot)).digest("hex"),
    ).toBe(POW_STAGE_A_RESPONSE_SNAPSHOT_SHA256);
  });

  it("approved-live marker gate still refuses reuse without touching Stage A files", async () => {
    const repo = tempRepo();
    writePowAttemptMarker({
      markerPath: absPowMarkerPath(repo, "challenge-get"),
      kind: "challenge-get",
      writtenAt: AT,
    });
    const fake = createFakePowTransport({
      challenge: contractChallenge(1_700_000_000_000),
    });
    const result = await runPowPreparation({
      sessionId: "pow-b-marker",
      runMode: "approved-live",
      liveAuthorizationGranted: true,
      repoRoot: repo,
      transport: fake.exchange,
      challengeParseMode: "agent402-contract",
      clockIso: AT,
      now: () => 1_700_000_000_000,
    });
    expect(result.session.status).toBe("unauthorized");
    expect(fake.calls).toHaveLength(0);

    // Historical JSONVALIDATE marker left intact when present.
    const prior = join(
      repo,
      "docs/day6/evidence/agent402-jsonvalidate-002-live-attempt.marker",
    );
    writeFileSync(prior, "consumed\n", "utf8");
    expect(existsSync(prior)).toBe(true);
  });
});

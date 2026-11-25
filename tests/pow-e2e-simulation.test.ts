import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  POW_NON_ACTIONS,
  POW_REQUEST_BODY,
  powRequestBodySha256,
  runPowPreparation,
} from "../src/pow/adapter.ts";
import { createFakePowTransport } from "../src/pow/fake-transport.ts";
import { l3ClaimAllowed, POW_L3_EVIDENCE_REQUIREMENTS } from "../src/pow/evidence.ts";
import {
  absPowMarkerPath,
  writePowAttemptMarker,
} from "../src/pow/markers.ts";
import { parsePowChallengeJson } from "../src/pow/challenge.ts";
import {
  POW_CHALLENGE_URL,
  POW_SUBMIT_URL,
  type PowChallenge,
} from "../src/pow/types.ts";
import { requestBodySha256 } from "../src/providers/agent402-jsonvalidate-observation.ts";

const AT = "2026-11-25T08:00:00.000Z";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function tempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "agenthire-pow-"));
  tempRoots.push(root);
  mkdirSync(join(root, "docs/day7/evidence"), { recursive: true });
  mkdirSync(join(root, "docs/day6/evidence"), { recursive: true });
  return root;
}

function softChallenge(): PowChallenge {
  return {
    token: "sim-token",
    challenge: "sim-challenge-v1",
    difficultyBits: 8,
    expiresAt: null,
    slug: "json-validate",
    rawKeys: ["challenge", "difficultyBits", "slug", "token"],
    fixtureKind: "synthetic",
  };
}

describe("PoW offline E2E simulation", () => {
  it("completes fake-transport E2E without claiming L3", async () => {
    const challenge = softChallenge();
    const fake = createFakePowTransport({
      challenge,
      expectedBodySha256: powRequestBodySha256(),
    });

    const result = await runPowPreparation({
      sessionId: "pow-sim-1",
      runMode: "offline-simulation",
      transport: fake.exchange,
      clockIso: AT,
      solverBudget: {
        maxAttempts: 200_000,
        maxDurationMs: 15_000,
        maxDifficultyBits: 16,
      },
    });

    expect(result.session.status).toBe("verified");
    expect(result.simulationOnly).toBe(true);
    expect(result.providerExecutionVerified).toBe(false);
    expect(result.session.ladder.observedLevel).toBe("L2");
    expect(result.session.ladder.simulationOnly).toBe(true);
    expect(result.session.networkChallengePerformed).toBe(false);
    expect(result.session.networkSubmitPerformed).toBe(false);
    expect(result.session.envelope).toEqual({
      valid: true,
      errors: [],
      extraKeys: [],
    });
    expect(result.requestBodySha256).toBe(requestBodySha256());
    expect(POW_REQUEST_BODY.data.name).toBe("Alice");
    expect(result.nonActions).toEqual([...POW_NON_ACTIONS]);

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]?.url).toBe(POW_CHALLENGE_URL);
    expect(fake.calls[0]?.method).toBe("GET");
    expect(fake.calls[1]?.url).toBe(POW_SUBMIT_URL);
    expect(fake.calls[1]?.method).toBe("POST");
    expect(fake.calls[1]?.powSolution).toMatch(/^sim-token:\d+$/);

    const claim = l3ClaimAllowed({
      networkChallengePerformed: result.session.networkChallengePerformed,
      networkSubmitPerformed: result.session.networkSubmitPerformed,
      simulationOnly: result.simulationOnly,
      providerExecutionVerified: result.providerExecutionVerified,
      envelopeValid: true,
      markersWritten: false,
      liveAuthorizationGranted: false,
    });
    expect(claim.allowed).toBe(false);
    expect(claim.observedLevel).toBe("L2");
    expect(claim.blockers).toContain("simulationOnly");
  });

  it("refuses approved-live without liveAuthorizationGranted", async () => {
    const fake = createFakePowTransport({ challenge: softChallenge() });
    const result = await runPowPreparation({
      sessionId: "pow-sim-2",
      runMode: "approved-live",
      liveAuthorizationGranted: false,
      transport: fake.exchange,
      clockIso: AT,
    });
    expect(result.session.status).toBe("unauthorized");
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses approved-live when markers already exist", async () => {
    const repo = tempRepo();
    writePowAttemptMarker({
      markerPath: absPowMarkerPath(repo, "challenge-get"),
      kind: "challenge-get",
      writtenAt: AT,
    });
    const fake = createFakePowTransport({ challenge: softChallenge() });
    const result = await runPowPreparation({
      sessionId: "pow-sim-3",
      runMode: "approved-live",
      liveAuthorizationGranted: true,
      repoRoot: repo,
      transport: fake.exchange,
      clockIso: AT,
    });
    expect(result.session.status).toBe("unauthorized");
    expect(fake.calls).toHaveLength(0);
  });

  it("does not reset historical JSONVALIDATE markers", async () => {
    const repo = tempRepo();
    const prior = join(
      repo,
      "docs/day6/evidence/agent402-jsonvalidate-002-live-attempt.marker",
    );
    writeFileSync(prior, "consumed\n", "utf8");
    expect(existsSync(prior)).toBe(true);

    const fake = createFakePowTransport({
      challenge: softChallenge(),
      expectedBodySha256: powRequestBodySha256(),
    });
    const result = await runPowPreparation({
      sessionId: "pow-sim-4",
      runMode: "offline-simulation",
      transport: fake.exchange,
      repoRoot: repo,
      clockIso: AT,
      solverBudget: { maxAttempts: 200_000, maxDifficultyBits: 16 },
    });
    expect(result.session.status).toBe("verified");
    expect(existsSync(prior)).toBe(true);
    // Offline sim must not write live PoW markers.
    expect(existsSync(absPowMarkerPath(repo, "challenge-get"))).toBe(false);
    expect(existsSync(absPowMarkerPath(repo, "submit-post"))).toBe(false);
  });

  it("fails closed on invalid challenge JSON", async () => {
    const fake = createFakePowTransport({
      challenge: softChallenge(),
      challengeHttpStatus: 200,
    });
    // Override exchange for challenge only with bad body via failChallenge path
    // using a custom transport wrapper.
    const transport = async (url: string, deps?: Parameters<typeof fake.exchange>[1]) => {
      if (url === POW_CHALLENGE_URL) {
        const exchange = await fake.exchange(url, deps);
        return {
          ...exchange,
          body: Buffer.from('{"oops":true}', "utf8"),
        };
      }
      return fake.exchange(url, deps);
    };
    const result = await runPowPreparation({
      sessionId: "pow-sim-5",
      runMode: "offline-simulation",
      transport,
      clockIso: AT,
    });
    expect(result.session.status).toBe("challengeRequestFailed");
  });

  it("parses challenge aliases", () => {
    const parsed = parsePowChallengeJson({
      id: "t1",
      puzzle: "p1",
      difficulty: 12,
      slug: "json-validate",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.challenge.token).toBe("t1");
    expect(parsed.challenge.challenge).toBe("p1");
    expect(parsed.challenge.difficultyBits).toBe(12);
  });

  it("documents L3 evidence requirements", () => {
    expect(POW_L3_EVIDENCE_REQUIREMENTS.length).toBeGreaterThanOrEqual(10);
    expect(
      POW_L3_EVIDENCE_REQUIREMENTS.every((r) => r.required === true),
    ).toBe(true);
  });

  it("offline-simulation without transport fails closed (no live DNS)", async () => {
    const result = await runPowPreparation({
      sessionId: "pow-sim-6",
      runMode: "offline-simulation",
      clockIso: AT,
    });
    expect(result.session.status).toBe("challengeRequestFailed");
    expect(result.session.blockReason).toMatch(/fake transport/i);
  });
});

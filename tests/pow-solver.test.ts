import { describe, expect, it } from "vitest";
import {
  countLeadingZeroBits,
  formatPowSolutionHeader,
  hashPowPreimage,
  solvePowChallenge,
  verifyPowSolution,
} from "../src/pow/solver.ts";
import { validatePowSolutionHeaderValue } from "../src/erc8004/secure-https.ts";

describe("PoW solver (offline, synthetic)", () => {
  it("counts leading zero bits on known digests", () => {
    expect(countLeadingZeroBits(Buffer.alloc(32, 0))).toBe(256);
    expect(countLeadingZeroBits(Buffer.from([0x00, 0x0f, ...Buffer.alloc(30)]))).toBe(
      12,
    );
    expect(countLeadingZeroBits(Buffer.from([0x80, ...Buffer.alloc(31)]))).toBe(0);
    expect(countLeadingZeroBits(Buffer.from([0x01, ...Buffer.alloc(31)]))).toBe(7);
  });

  it("solves a low-difficulty synthetic challenge", async () => {
    const result = await solvePowChallenge({
      challenge: {
        token: "tok-test",
        challenge: "chal-abc",
        difficultyBits: 8,
      },
      budget: { maxAttempts: 200_000, maxDurationMs: 10_000, maxDifficultyBits: 16 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const verified = verifyPowSolution({
      challenge: "chal-abc",
      token: "tok-test",
      nonce: result.solution.nonce,
      difficultyBits: 8,
    });
    expect(verified.ok).toBe(true);
    expect(result.solution.headerValue).toBe(
      formatPowSolutionHeader("tok-test", result.solution.nonce),
    );
    expect(result.solution.digestHex).toBe(verified.digestHex);
    expect(result.solution.preimage).toBe(`chal-abc:${result.solution.nonce}`);
  });

  it("respects attempt budget", async () => {
    const result = await solvePowChallenge({
      challenge: {
        token: "tok",
        challenge: "hard",
        difficultyBits: 30,
      },
      budget: { maxAttempts: 50, maxDurationMs: 60_000, maxDifficultyBits: 32 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("budgetExhausted");
    expect(result.attempts).toBe(50);
  });

  it("rejects difficulty above budget", async () => {
    const result = await solvePowChallenge({
      challenge: {
        token: "tok",
        challenge: "x",
        difficultyBits: 28,
      },
      budget: { maxDifficultyBits: 16 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("difficultyTooHard");
  });

  it("cancels via AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await solvePowChallenge({
      challenge: {
        token: "tok",
        challenge: "x",
        difficultyBits: 8,
      },
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("cancelled");
  });

  it("validates X-Pow-Solution header shape", () => {
    expect(validatePowSolutionHeaderValue("tok:123").ok).toBe(true);
    expect(validatePowSolutionHeaderValue("tok").ok).toBe(false);
    expect(validatePowSolutionHeaderValue("tok:1:2").ok).toBe(false);
    expect(validatePowSolutionHeaderValue("tok:1\n2").ok).toBe(false);
    expect(validatePowSolutionHeaderValue("").ok).toBe(false);
  });

  it("hashPowPreimage matches verify helper", () => {
    const digest = hashPowPreimage("c", "0");
    expect(digest).toHaveLength(32);
    const verified = verifyPowSolution({
      challenge: "c",
      token: "t",
      nonce: "0",
      difficultyBits: 0,
    });
    expect(verified.digestHex).toBe(digest.toString("hex"));
  });
});

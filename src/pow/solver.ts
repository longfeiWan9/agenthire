/**
 * Bounded Agent402 PoW solver (D7.3).
 *
 * Algorithm (docs reference, offline-verified):
 *   digest = SHA-256(challenge + ":" + nonce)
 *   accept when digest has ≥ difficultyBits leading zero bits
 *
 * No network. No live challenges. Uses Node crypto only.
 */

import { createHash } from "node:crypto";
import {
  POW_ALGORITHM,
  POW_DEFAULT_MAX_ATTEMPTS,
  POW_DEFAULT_MAX_DIFFICULTY_BITS,
  POW_DEFAULT_MAX_DURATION_MS,
  POW_PREIMAGE_SEPARATOR,
  type PowChallenge,
  type PowSolveResult,
  type PowSolverBudget,
  type PowSolution,
} from "./types.ts";

export type SolvePowInput = {
  readonly challenge: Pick<
    PowChallenge,
    "token" | "challenge" | "difficultyBits"
  >;
  readonly budget?: Partial<PowSolverBudget>;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  /** Start nonce counter (decimal string increments). Default 0. */
  readonly startNonce?: number;
};

function resolveBudget(
  partial: Partial<PowSolverBudget> | undefined,
): PowSolverBudget {
  const maxAttempts =
    typeof partial?.maxAttempts === "number" &&
    Number.isFinite(partial.maxAttempts) &&
    partial.maxAttempts > 0
      ? Math.floor(partial.maxAttempts)
      : POW_DEFAULT_MAX_ATTEMPTS;
  const maxDurationMs =
    typeof partial?.maxDurationMs === "number" &&
    Number.isFinite(partial.maxDurationMs) &&
    partial.maxDurationMs > 0
      ? Math.floor(partial.maxDurationMs)
      : POW_DEFAULT_MAX_DURATION_MS;
  const maxDifficultyBits =
    typeof partial?.maxDifficultyBits === "number" &&
    Number.isFinite(partial.maxDifficultyBits) &&
    partial.maxDifficultyBits > 0
      ? Math.floor(partial.maxDifficultyBits)
      : POW_DEFAULT_MAX_DIFFICULTY_BITS;
  return { maxAttempts, maxDurationMs, maxDifficultyBits };
}

/** Count leading zero bits in a SHA-256 digest (32 bytes). */
export function countLeadingZeroBits(digest: Buffer): number {
  let bits = 0;
  for (let i = 0; i < digest.length; i += 1) {
    const byte = digest[i]!;
    if (byte === 0) {
      bits += 8;
      continue;
    }
    // Count leading zeros in this byte.
    let mask = 0x80;
    while (mask !== 0 && (byte & mask) === 0) {
      bits += 1;
      mask >>= 1;
    }
    break;
  }
  return bits;
}

export function hashPowPreimage(challenge: string, nonce: string): Buffer {
  return createHash("sha256")
    .update(`${challenge}${POW_PREIMAGE_SEPARATOR}${nonce}`, "utf8")
    .digest();
}

export function formatPowSolutionHeader(
  token: string,
  nonce: string,
): string {
  return `${token}${POW_PREIMAGE_SEPARATOR}${nonce}`;
}

export function verifyPowSolution(input: {
  readonly challenge: string;
  readonly token: string;
  readonly nonce: string;
  readonly difficultyBits: number;
}): {
  readonly ok: boolean;
  readonly digestHex: string;
  readonly leadingZeroBits: number;
  readonly preimage: string;
  readonly headerValue: string;
} {
  const preimage = `${input.challenge}${POW_PREIMAGE_SEPARATOR}${input.nonce}`;
  const digest = hashPowPreimage(input.challenge, input.nonce);
  const leadingZeroBits = countLeadingZeroBits(digest);
  return {
    ok: leadingZeroBits >= input.difficultyBits,
    digestHex: digest.toString("hex"),
    leadingZeroBits,
    preimage,
    headerValue: formatPowSolutionHeader(input.token, input.nonce),
  };
}

/**
 * Solve a PoW challenge under attempt / wall-clock / difficulty budgets.
 * Cooperative cancel via AbortSignal. Yields the event loop every 1024 attempts.
 */
export async function solvePowChallenge(
  input: SolvePowInput,
): Promise<PowSolveResult> {
  const budget = resolveBudget(input.budget);
  const now = input.now ?? (() => Date.now());
  const started = now();

  const token = input.challenge.token;
  const challenge = input.challenge.challenge;
  const difficultyBits = input.challenge.difficultyBits;

  if (typeof token !== "string" || token.length === 0) {
    return {
      ok: false,
      reason: "invalidChallenge",
      attempts: 0,
      elapsedMs: 0,
      message: "challenge.token must be a non-empty string",
    };
  }
  if (typeof challenge !== "string" || challenge.length === 0) {
    return {
      ok: false,
      reason: "invalidChallenge",
      attempts: 0,
      elapsedMs: 0,
      message: "challenge.challenge must be a non-empty string",
    };
  }
  if (
    !Number.isInteger(difficultyBits) ||
    difficultyBits < 0 ||
    difficultyBits > 256
  ) {
    return {
      ok: false,
      reason: "invalidChallenge",
      attempts: 0,
      elapsedMs: 0,
      message: "difficultyBits must be an integer in [0, 256]",
    };
  }
  if (difficultyBits > budget.maxDifficultyBits) {
    return {
      ok: false,
      reason: "difficultyTooHard",
      attempts: 0,
      elapsedMs: 0,
      message: `difficultyBits ${difficultyBits} exceeds budget maxDifficultyBits ${budget.maxDifficultyBits}`,
    };
  }

  if (input.signal?.aborted) {
    return {
      ok: false,
      reason: "cancelled",
      attempts: 0,
      elapsedMs: 0,
      message: "solver aborted before start",
    };
  }

  let attempts = 0;
  let nonceCounter =
    typeof input.startNonce === "number" &&
    Number.isFinite(input.startNonce) &&
    input.startNonce >= 0
      ? Math.floor(input.startNonce)
      : 0;

  while (attempts < budget.maxAttempts) {
    if (input.signal?.aborted) {
      return {
        ok: false,
        reason: "cancelled",
        attempts,
        elapsedMs: now() - started,
        message: "solver aborted",
      };
    }
    const elapsed = now() - started;
    if (elapsed > budget.maxDurationMs) {
      return {
        ok: false,
        reason: "budgetExhausted",
        attempts,
        elapsedMs: elapsed,
        message: `exceeded maxDurationMs=${budget.maxDurationMs}`,
      };
    }

    const nonce = String(nonceCounter);
    nonceCounter += 1;
    attempts += 1;

    const digest = hashPowPreimage(challenge, nonce);
    if (countLeadingZeroBits(digest) >= difficultyBits) {
      const solution: PowSolution = {
        token,
        nonce,
        preimage: `${challenge}${POW_PREIMAGE_SEPARATOR}${nonce}`,
        digestHex: digest.toString("hex"),
        difficultyBits,
        attempts,
        elapsedMs: now() - started,
        headerValue: formatPowSolutionHeader(token, nonce),
      };
      return { ok: true, solution };
    }

    // Cooperative yield so cancel / UI remain responsive.
    if (attempts % 1024 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  return {
    ok: false,
    reason: "budgetExhausted",
    attempts,
    elapsedMs: now() - started,
    message: `exceeded maxAttempts=${budget.maxAttempts}`,
  };
}

export function powAlgorithmLabel(): typeof POW_ALGORITHM {
  return POW_ALGORITHM;
}

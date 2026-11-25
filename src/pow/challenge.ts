/**
 * Offline PoW challenge URL / body validation (D7.3).
 *
 * Live challenge JSON field names are not locked by a captured sample in this
 * prep — parser accepts documented aliases and records rawKeys for evidence.
 */

import { POW_CHALLENGE_URL, POW_SLUG, POW_SUBMIT_URL, type PowChallenge } from "./types.ts";

export type PowChallengeParseOk = {
  readonly ok: true;
  readonly challenge: PowChallenge;
};

export type PowChallengeParseFail = {
  readonly ok: false;
  readonly reason: string;
  readonly message: string;
};

export type PowChallengeParseResult = PowChallengeParseOk | PowChallengeParseFail;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isApprovedPowChallengeUrl(url: string): boolean {
  return url === POW_CHALLENGE_URL;
}

export function isApprovedPowSubmitUrl(url: string): boolean {
  return url === POW_SUBMIT_URL;
}

export function assertExactPowChallengeUrl(url: string): URL {
  if (!isApprovedPowChallengeUrl(url)) {
    throw new Error(
      `PoW challenge URL rejected (exact allowlist): got ${JSON.stringify(url)} expected ${POW_CHALLENGE_URL}`,
    );
  }
  return new URL(url);
}

export function assertExactPowSubmitUrl(url: string): URL {
  if (!isApprovedPowSubmitUrl(url)) {
    throw new Error(
      `PoW submit URL rejected (exact allowlist): got ${JSON.stringify(url)} expected ${POW_SUBMIT_URL}`,
    );
  }
  return new URL(url);
}

function pickString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickDifficultyBits(obj: Record<string, unknown>): number | null {
  const candidates = [
    obj.difficultyBits,
    obj.difficulty,
    obj.leadingZeroBits,
    obj.bits,
    obj.zeros,
  ];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 256) {
      return v;
    }
    if (typeof v === "string" && /^\d+$/.test(v)) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0 && n <= 256) return n;
    }
  }
  return null;
}

/**
 * Parse a PoW challenge JSON body into AgentHire's normalized shape.
 * Accepts aliases: token|id, challenge|puzzle|prefix, difficultyBits|difficulty|…
 */
export function parsePowChallengeJson(
  value: unknown,
  fixtureKind: PowChallenge["fixtureKind"] = "synthetic",
): PowChallengeParseResult {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reason: "invalidType",
      message: "PoW challenge body must be a JSON object",
    };
  }
  const rawKeys = Object.keys(value).sort();
  const token = pickString(value, ["token", "id", "challengeId", "challenge_id"]);
  const challenge = pickString(value, [
    "challenge",
    "puzzle",
    "prefix",
    "seed",
  ]);
  // Some APIs reuse token as the hash preimage seed.
  const challengeOrToken = challenge ?? token;
  const difficultyBits = pickDifficultyBits(value);
  if (token == null) {
    return {
      ok: false,
      reason: "missingToken",
      message: "PoW challenge missing token/id",
    };
  }
  if (challengeOrToken == null) {
    return {
      ok: false,
      reason: "missingChallenge",
      message: "PoW challenge missing challenge/puzzle/prefix",
    };
  }
  if (difficultyBits == null) {
    return {
      ok: false,
      reason: "missingDifficulty",
      message:
        "PoW challenge missing difficultyBits/difficulty/leadingZeroBits",
    };
  }

  let expiresAt: string | null = null;
  const exp = pickString(value, ["expiresAt", "expires_at", "expiry", "exp"]);
  if (exp != null) expiresAt = exp;

  // Optional slug consistency check when present.
  const slug = pickString(value, ["slug"]);
  if (slug != null && slug !== POW_SLUG) {
    return {
      ok: false,
      reason: "slugMismatch",
      message: `expected slug ${POW_SLUG}, got ${slug}`,
    };
  }

  return {
    ok: true,
    challenge: {
      token,
      challenge: challengeOrToken,
      difficultyBits,
      expiresAt,
      slug: POW_SLUG,
      rawKeys,
      fixtureKind,
    },
  };
}

export function parsePowChallengeBytes(
  body: Buffer,
  fixtureKind: PowChallenge["fixtureKind"] = "synthetic",
): PowChallengeParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return {
      ok: false,
      reason: "invalidJson",
      message: "PoW challenge body is not valid JSON",
    };
  }
  return parsePowChallengeJson(parsed, fixtureKind);
}

/**
 * Agent402 PoW challenge URL / body validation (D7.3 Stage B).
 *
 * Frames adapter schema + expiry-policy hardening against the Stage A
 * observed challenge API contract. Offline-safe: never requires live I/O.
 */

import {
  POW_CHALLENGE_URL,
  POW_CONTRACT_ALGORITHM,
  POW_CONTRACT_SUBMIT_FORMAT,
  POW_CONTRACT_SUBMIT_HEADER,
  POW_EXPIRY_SAFETY_MARGIN_MS,
  POW_SLUG,
  POW_SUBMIT_URL,
  type PowChallenge,
  type PowChallengeParseMode,
} from "./types.ts";

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

export type ParsePowChallengeOptions = {
  readonly fixtureKind?: PowChallenge["fixtureKind"];
  /**
   * `agent402-contract` — Stage A frozen live-path schema (fail-closed).
   * `compat` — looser aliases for synthetic offline fixtures.
   * Default: live → contract; otherwise compat.
   */
  readonly mode?: PowChallengeParseMode;
};

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
 * Normalize expiresAt to Unix seconds.
 * Accepts integer number (preferred Stage A shape) or numeric / ISO string.
 * Rejects non-finite, non-positive, fractional numbers, and unparsable strings.
 */
export function pickExpiresAtUnixSeconds(
  obj: Record<string, unknown>,
): { ok: true; value: number | null } | { ok: false; reason: string; message: string } {
  const keys = ["expiresAt", "expires_at", "expiry", "exp"] as const;
  let seen: unknown = undefined;
  let found = false;
  for (const key of keys) {
    if (key in obj) {
      seen = obj[key];
      found = true;
      break;
    }
  }
  if (!found) {
    return { ok: true, value: null };
  }
  if (typeof seen === "number") {
    if (!Number.isFinite(seen) || !Number.isInteger(seen) || seen <= 0) {
      return {
        ok: false,
        reason: "invalidExpiresAt",
        message:
          "expiresAt must be a positive integer Unix-seconds value when numeric",
      };
    }
    return { ok: true, value: seen };
  }
  if (typeof seen === "string" && seen.length > 0) {
    if (/^\d+$/.test(seen)) {
      const n = Number(seen);
      if (!Number.isSafeInteger(n) || n <= 0) {
        return {
          ok: false,
          reason: "invalidExpiresAt",
          message: "expiresAt numeric string is not a safe positive integer",
        };
      }
      return { ok: true, value: n };
    }
    const ms = Date.parse(seen);
    if (!Number.isFinite(ms)) {
      return {
        ok: false,
        reason: "invalidExpiresAt",
        message: "expiresAt string is not a valid ISO timestamp or Unix seconds",
      };
    }
    return { ok: true, value: Math.floor(ms / 1000) };
  }
  return {
    ok: false,
    reason: "invalidExpiresAt",
    message: `expiresAt has unsupported type ${seen === null ? "null" : typeof seen}`,
  };
}

function pickOptionalPositiveInt(
  obj: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
    if (typeof v === "string" && /^\d+$/.test(v)) {
      const n = Number(v);
      if (Number.isInteger(n) && n > 0) return n;
    }
  }
  return null;
}

export type ChallengeExpiryCheck = {
  readonly ok: true;
  readonly expiresAtUnixSeconds: number;
  readonly nowMs: number;
  readonly remainingMs: number;
  readonly marginMs: number;
} | {
  readonly ok: false;
  readonly reason: "missingExpiresAt" | "challengeExpired";
  readonly message: string;
  readonly expiresAtUnixSeconds: number | null;
  readonly nowMs: number;
  readonly remainingMs: number | null;
  readonly marginMs: number;
};

/**
 * Enforce challenge expiry with an injectable clock and safety margin.
 * Used before solve and before POST submit.
 */
export function checkChallengeExpiry(input: {
  readonly expiresAtUnixSeconds: number | null;
  readonly nowMs?: number;
  readonly marginMs?: number;
  readonly requireExpiresAt?: boolean;
}): ChallengeExpiryCheck {
  const nowMs = input.nowMs ?? Date.now();
  const marginMs = input.marginMs ?? POW_EXPIRY_SAFETY_MARGIN_MS;
  const requireExpiresAt = input.requireExpiresAt ?? true;
  const exp = input.expiresAtUnixSeconds;
  if (exp == null) {
    if (!requireExpiresAt) {
      return {
        ok: true,
        expiresAtUnixSeconds: Number.POSITIVE_INFINITY,
        nowMs,
        remainingMs: Number.POSITIVE_INFINITY,
        marginMs,
      };
    }
    return {
      ok: false,
      reason: "missingExpiresAt",
      message: "challenge expiresAt is required for expiry enforcement",
      expiresAtUnixSeconds: null,
      nowMs,
      remainingMs: null,
      marginMs,
    };
  }
  const expiresAtMs = exp * 1000;
  const remainingMs = expiresAtMs - nowMs;
  if (remainingMs <= marginMs) {
    return {
      ok: false,
      reason: "challengeExpired",
      message: `challenge expired or within safety margin (${remainingMs}ms remaining, margin ${marginMs}ms)`,
      expiresAtUnixSeconds: exp,
      nowMs,
      remainingMs,
      marginMs,
    };
  }
  return {
    ok: true,
    expiresAtUnixSeconds: exp,
    nowMs,
    remainingMs,
    marginMs,
  };
}

function resolveParseMode(
  fixtureKind: PowChallenge["fixtureKind"],
  mode: PowChallengeParseMode | undefined,
): PowChallengeParseMode {
  if (mode != null) return mode;
  return fixtureKind === "live" ? "agent402-contract" : "compat";
}

function parseCompat(
  value: Record<string, unknown>,
  fixtureKind: PowChallenge["fixtureKind"],
): PowChallengeParseResult {
  const rawKeys = Object.keys(value).sort();
  const token = pickString(value, ["token", "id", "challengeId", "challenge_id"]);
  const challenge = pickString(value, [
    "challenge",
    "puzzle",
    "prefix",
    "seed",
  ]);
  // Compat-only: some synthetic fixtures reuse token as the hash preimage seed.
  // Live/contract path never allows this fallback.
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

  const expPick = pickExpiresAtUnixSeconds(value);
  if (!expPick.ok) return expPick;

  const slug = pickString(value, ["slug"]);
  if (slug != null && slug !== POW_SLUG) {
    return {
      ok: false,
      reason: "slugMismatch",
      message: `expected slug ${POW_SLUG}, got ${slug}`,
    };
  }

  const algorithm = pickString(value, ["algorithm"]);
  const submitHeader = pickString(value, ["submitHeader", "submit_header"]);
  const submitFormat = pickString(value, ["submitFormat", "submit_format"]);
  const ttlSeconds = pickOptionalPositiveInt(value, ["ttlSeconds", "ttl"]);

  return {
    ok: true,
    challenge: {
      token,
      challenge: challengeOrToken,
      difficultyBits,
      expiresAtUnixSeconds: expPick.value,
      algorithm,
      submitHeader,
      submitFormat,
      ttlSeconds,
      slug: POW_SLUG,
      rawKeys,
      fixtureKind,
      parseMode: "compat",
    },
  };
}

/**
 * Strict Agent402 live-path contract parse (Stage A schema).
 * Fail-closed: numeric expiresAt, distinct challenge≠token, algorithm,
 * difficulty bits, slug, submitHeader/Format.
 */
function parseAgent402Contract(
  value: Record<string, unknown>,
  fixtureKind: PowChallenge["fixtureKind"],
): PowChallengeParseResult {
  const rawKeys = Object.keys(value).sort();

  const token = pickString(value, ["token"]);
  if (token == null) {
    return {
      ok: false,
      reason: "missingToken",
      message: "agent402-contract requires non-empty string field token",
    };
  }

  const challenge = pickString(value, ["challenge"]);
  if (challenge == null) {
    return {
      ok: false,
      reason: "missingChallenge",
      message:
        "agent402-contract requires distinct non-empty string field challenge (token-as-challenge fallback forbidden)",
    };
  }
  if (challenge === token) {
    return {
      ok: false,
      reason: "challengeTokenCollision",
      message:
        "agent402-contract requires challenge ≠ token (distinct credential vs hash seed)",
    };
  }

  // Difficulty: prefer `difficulty` (Stage A), accept difficultyBits alias only
  // when difficulty is absent — still must be integer bits in [0, 256].
  let difficultyBits: number | null = null;
  if ("difficulty" in value) {
    const d = value.difficulty;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 256) {
      return {
        ok: false,
        reason: "invalidDifficulty",
        message:
          "agent402-contract difficulty must be an integer bit count in [0, 256]",
      };
    }
    difficultyBits = d;
  } else if ("difficultyBits" in value) {
    const d = value.difficultyBits;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 256) {
      return {
        ok: false,
        reason: "invalidDifficulty",
        message:
          "agent402-contract difficultyBits must be an integer bit count in [0, 256]",
      };
    }
    difficultyBits = d;
  } else {
    return {
      ok: false,
      reason: "missingDifficulty",
      message: "agent402-contract requires numeric difficulty (leading-zero bits)",
    };
  }

  const expPick = pickExpiresAtUnixSeconds(value);
  if (!expPick.ok) return expPick;
  if (expPick.value == null) {
    return {
      ok: false,
      reason: "missingExpiresAt",
      message:
        "agent402-contract requires numeric expiresAt (Unix seconds); string-only silently-dropped expiry is rejected",
    };
  }
  // Contract requires the wire type to be number (Stage A observation).
  if (typeof value.expiresAt !== "number") {
    return {
      ok: false,
      reason: "invalidExpiresAt",
      message:
        "agent402-contract requires expiresAt as a JSON number (Unix seconds)",
    };
  }

  const algorithm = pickString(value, ["algorithm"]);
  if (algorithm == null) {
    return {
      ok: false,
      reason: "missingAlgorithm",
      message: "agent402-contract requires algorithm",
    };
  }
  if (algorithm.toLowerCase() !== POW_CONTRACT_ALGORITHM) {
    return {
      ok: false,
      reason: "algorithmMismatch",
      message: `agent402-contract expected algorithm ${POW_CONTRACT_ALGORITHM}, got ${algorithm}`,
    };
  }

  const slug = pickString(value, ["slug"]);
  if (slug == null) {
    return {
      ok: false,
      reason: "missingSlug",
      message: "agent402-contract requires slug",
    };
  }
  if (slug !== POW_SLUG) {
    return {
      ok: false,
      reason: "slugMismatch",
      message: `expected slug ${POW_SLUG}, got ${slug}`,
    };
  }

  const submitHeader = pickString(value, ["submitHeader"]);
  if (submitHeader == null) {
    return {
      ok: false,
      reason: "missingSubmitHeader",
      message: "agent402-contract requires submitHeader",
    };
  }
  if (submitHeader !== POW_CONTRACT_SUBMIT_HEADER) {
    return {
      ok: false,
      reason: "submitHeaderMismatch",
      message: `expected submitHeader ${POW_CONTRACT_SUBMIT_HEADER}, got ${submitHeader}`,
    };
  }

  const submitFormat = pickString(value, ["submitFormat"]);
  if (submitFormat == null) {
    return {
      ok: false,
      reason: "missingSubmitFormat",
      message: "agent402-contract requires submitFormat",
    };
  }
  if (submitFormat !== POW_CONTRACT_SUBMIT_FORMAT) {
    return {
      ok: false,
      reason: "submitFormatMismatch",
      message: `expected submitFormat ${POW_CONTRACT_SUBMIT_FORMAT}, got ${submitFormat}`,
    };
  }

  const ttlSeconds = pickOptionalPositiveInt(value, ["ttlSeconds"]);

  return {
    ok: true,
    challenge: {
      token,
      challenge,
      difficultyBits,
      expiresAtUnixSeconds: expPick.value,
      algorithm: POW_CONTRACT_ALGORITHM,
      submitHeader: POW_CONTRACT_SUBMIT_HEADER,
      submitFormat: POW_CONTRACT_SUBMIT_FORMAT,
      ttlSeconds,
      slug: POW_SLUG,
      rawKeys,
      fixtureKind,
      parseMode: "agent402-contract",
    },
  };
}

/**
 * Parse a PoW challenge JSON body into AgentHire's normalized shape.
 */
export function parsePowChallengeJson(
  value: unknown,
  fixtureKindOrOptions:
    | PowChallenge["fixtureKind"]
    | ParsePowChallengeOptions = "synthetic",
): PowChallengeParseResult {
  const options: ParsePowChallengeOptions =
    typeof fixtureKindOrOptions === "string"
      ? { fixtureKind: fixtureKindOrOptions }
      : fixtureKindOrOptions;
  const fixtureKind = options.fixtureKind ?? "synthetic";
  const mode = resolveParseMode(fixtureKind, options.mode);

  if (!isPlainObject(value)) {
    return {
      ok: false,
      reason: "invalidType",
      message: "PoW challenge body must be a JSON object",
    };
  }

  if (mode === "agent402-contract") {
    return parseAgent402Contract(value, fixtureKind);
  }
  return parseCompat(value, fixtureKind);
}

export function parsePowChallengeBytes(
  body: Buffer,
  fixtureKindOrOptions:
    | PowChallenge["fixtureKind"]
    | ParsePowChallengeOptions = "synthetic",
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
  return parsePowChallengeJson(parsed, fixtureKindOrOptions);
}

/** Build a sanitized Agent402-contract JSON body for offline tests (never real Stage A material). */
export function buildSanitizedAgent402ChallengeBody(input: {
  readonly token: string;
  readonly challenge: string;
  readonly difficulty: number;
  readonly expiresAtUnixSeconds: number;
  readonly ttlSeconds?: number;
  readonly slug?: string;
  readonly algorithm?: string;
  readonly submitHeader?: string;
  readonly submitFormat?: string;
  readonly rule?: string;
  readonly submitNote?: string;
}): Record<string, unknown> {
  return {
    algorithm: input.algorithm ?? POW_CONTRACT_ALGORITHM,
    challenge: input.challenge,
    difficulty: input.difficulty,
    expiresAt: input.expiresAtUnixSeconds,
    rule:
      input.rule ??
      `Find an integer nonce such that sha256("${input.challenge}:" + nonce) has the required leading zero bits.`,
    slug: input.slug ?? POW_SLUG,
    submitFormat: input.submitFormat ?? POW_CONTRACT_SUBMIT_FORMAT,
    submitHeader: input.submitHeader ?? POW_CONTRACT_SUBMIT_HEADER,
    submitNote:
      input.submitNote ??
      "Submit via X-Pow-Solution header as <token>:<nonce>. Offline sanitized fixture — not a live credential.",
    token: input.token,
    ttlSeconds: input.ttlSeconds ?? 300,
  };
}

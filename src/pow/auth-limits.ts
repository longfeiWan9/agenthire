/**
 * Stage B / D7.3 authorized PoW safety limits.
 *
 * Ceilings are hard: callers may tighten budgets but cannot raise them above
 * Product-Owner approved scope. Expiry margin has a hard floor (min 5s).
 */

import {
  POW_AUTHORIZED_CHALLENGE_MAX_BYTES,
  POW_AUTHORIZED_MAX_ATTEMPTS,
  POW_AUTHORIZED_MAX_CHALLENGE_GETS,
  POW_AUTHORIZED_MAX_DIFFICULTY_BITS,
  POW_AUTHORIZED_MAX_DURATION_MS,
  POW_AUTHORIZED_MAX_HTTP_TIMEOUT_MS,
  POW_AUTHORIZED_MAX_REDIRECTS,
  POW_AUTHORIZED_MAX_RETRIES,
  POW_AUTHORIZED_MAX_SUBMIT_POSTS,
  POW_AUTHORIZED_MIN_EXPIRY_MARGIN_MS,
  POW_AUTHORIZED_SUBMIT_MAX_BYTES,
  POW_CHALLENGE_GET_REQUEST_ID,
  POW_CHALLENGE_URL,
  POW_DEFAULT_MAX_ATTEMPTS,
  POW_DEFAULT_MAX_DIFFICULTY_BITS,
  POW_DEFAULT_MAX_DURATION_MS,
  POW_EXPIRY_SAFETY_MARGIN_MS,
  POW_SUBMIT_POST_REQUEST_ID,
  POW_SUBMIT_URL,
  type PowSolverBudget,
} from "./types.ts";

export type PowAuthorizedLimits = {
  readonly challengeGetMaxBytes: typeof POW_AUTHORIZED_CHALLENGE_MAX_BYTES;
  readonly submitPostMaxBytes: typeof POW_AUTHORIZED_SUBMIT_MAX_BYTES;
  readonly httpTimeoutMaxMs: typeof POW_AUTHORIZED_MAX_HTTP_TIMEOUT_MS;
  readonly difficultyMaxBits: typeof POW_AUTHORIZED_MAX_DIFFICULTY_BITS;
  readonly solverAttemptsMax: typeof POW_AUTHORIZED_MAX_ATTEMPTS;
  readonly solverDurationMaxMs: typeof POW_AUTHORIZED_MAX_DURATION_MS;
  readonly expiryMarginMinMs: typeof POW_AUTHORIZED_MIN_EXPIRY_MARGIN_MS;
  readonly maxChallengeGets: typeof POW_AUTHORIZED_MAX_CHALLENGE_GETS;
  readonly maxSubmitPosts: typeof POW_AUTHORIZED_MAX_SUBMIT_POSTS;
  readonly maxRedirects: typeof POW_AUTHORIZED_MAX_REDIRECTS;
  readonly maxRetries: typeof POW_AUTHORIZED_MAX_RETRIES;
  readonly challengeUrl: typeof POW_CHALLENGE_URL;
  readonly submitUrl: typeof POW_SUBMIT_URL;
  readonly getAuthId: typeof POW_CHALLENGE_GET_REQUEST_ID;
  readonly postAuthId: typeof POW_SUBMIT_POST_REQUEST_ID;
};

export const POW_AUTHORIZED_LIMITS: PowAuthorizedLimits = {
  challengeGetMaxBytes: POW_AUTHORIZED_CHALLENGE_MAX_BYTES,
  submitPostMaxBytes: POW_AUTHORIZED_SUBMIT_MAX_BYTES,
  httpTimeoutMaxMs: POW_AUTHORIZED_MAX_HTTP_TIMEOUT_MS,
  difficultyMaxBits: POW_AUTHORIZED_MAX_DIFFICULTY_BITS,
  solverAttemptsMax: POW_AUTHORIZED_MAX_ATTEMPTS,
  solverDurationMaxMs: POW_AUTHORIZED_MAX_DURATION_MS,
  expiryMarginMinMs: POW_AUTHORIZED_MIN_EXPIRY_MARGIN_MS,
  maxChallengeGets: POW_AUTHORIZED_MAX_CHALLENGE_GETS,
  maxSubmitPosts: POW_AUTHORIZED_MAX_SUBMIT_POSTS,
  maxRedirects: POW_AUTHORIZED_MAX_REDIRECTS,
  maxRetries: POW_AUTHORIZED_MAX_RETRIES,
  challengeUrl: POW_CHALLENGE_URL,
  submitUrl: POW_SUBMIT_URL,
  getAuthId: POW_CHALLENGE_GET_REQUEST_ID,
  postAuthId: POW_SUBMIT_POST_REQUEST_ID,
};

export type AuthorizedBudgetOk = {
  readonly ok: true;
  readonly budget: PowSolverBudget;
};

export type AuthorizedBudgetFail = {
  readonly ok: false;
  readonly reason: string;
};

export type AuthorizedBudgetResult = AuthorizedBudgetOk | AuthorizedBudgetFail;

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Resolve solver budget under hard authorized ceilings.
 * Lowering a limit is allowed; raising above Stage B scope fails closed.
 */
export function resolveAuthorizedSolverBudget(
  partial?: Partial<PowSolverBudget>,
): AuthorizedBudgetResult {
  const maxAttempts = isPositiveInt(partial?.maxAttempts)
    ? Math.floor(partial.maxAttempts)
    : POW_DEFAULT_MAX_ATTEMPTS;
  const maxDurationMs = isPositiveInt(partial?.maxDurationMs)
    ? Math.floor(partial.maxDurationMs)
    : POW_DEFAULT_MAX_DURATION_MS;
  const maxDifficultyBits = isPositiveInt(partial?.maxDifficultyBits)
    ? Math.floor(partial.maxDifficultyBits)
    : POW_DEFAULT_MAX_DIFFICULTY_BITS;

  if (maxAttempts > POW_AUTHORIZED_MAX_ATTEMPTS) {
    return {
      ok: false,
      reason: `maxAttempts ${maxAttempts} exceeds authorized ceiling ${POW_AUTHORIZED_MAX_ATTEMPTS}`,
    };
  }
  if (maxDurationMs > POW_AUTHORIZED_MAX_DURATION_MS) {
    return {
      ok: false,
      reason: `maxDurationMs ${maxDurationMs} exceeds authorized ceiling ${POW_AUTHORIZED_MAX_DURATION_MS}`,
    };
  }
  if (maxDifficultyBits > POW_AUTHORIZED_MAX_DIFFICULTY_BITS) {
    return {
      ok: false,
      reason: `maxDifficultyBits ${maxDifficultyBits} exceeds authorized ceiling ${POW_AUTHORIZED_MAX_DIFFICULTY_BITS}`,
    };
  }

  return {
    ok: true,
    budget: { maxAttempts, maxDurationMs, maxDifficultyBits },
  };
}

export type AuthorizedExpiryMarginResult =
  | { readonly ok: true; readonly marginMs: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Expiry safety margin must be ≥ authorized minimum (5s). Larger margins OK.
 */
export function resolveAuthorizedExpiryMargin(
  requestedMs?: number,
): AuthorizedExpiryMarginResult {
  const marginMs =
    typeof requestedMs === "number" && Number.isFinite(requestedMs)
      ? Math.floor(requestedMs)
      : POW_EXPIRY_SAFETY_MARGIN_MS;
  if (marginMs < POW_AUTHORIZED_MIN_EXPIRY_MARGIN_MS) {
    return {
      ok: false,
      reason: `expiryMarginMs ${marginMs} is below authorized minimum ${POW_AUTHORIZED_MIN_EXPIRY_MARGIN_MS}`,
    };
  }
  return { ok: true, marginMs };
}

/** Human-readable scope block for the operator CLI dry-run. */
export function formatAuthorizedScopeLines(): readonly string[] {
  const L = POW_AUTHORIZED_LIMITS;
  return [
    "Proposed request scope (Stage B / D7.3 authorized ceilings):",
    `  GET  ${L.challengeUrl}`,
    `  POST ${L.submitUrl}`,
    `  Auth markers: ${L.getAuthId} then ${L.postAuthId} (separate wx; POST only after solve+expiry)`,
    `  Challenge GET maxBytes ≤ ${L.challengeGetMaxBytes}`,
    `  Task POST maxBytes ≤ ${L.submitPostMaxBytes}`,
    `  HTTP timeout ≤ ${L.httpTimeoutMaxMs} ms / request`,
    `  Difficulty ≤ ${L.difficultyMaxBits} leading-zero bits`,
    `  Solver attempts ≤ ${L.solverAttemptsMax}`,
    `  Solver duration ≤ ${L.solverDurationMaxMs} ms`,
    `  Expiry margin ≥ ${L.expiryMarginMinMs} ms`,
    `  Max requests: ${L.maxChallengeGets} GET + ${L.maxSubmitPosts} conditional POST`,
    `  Redirects=${L.maxRedirects} · Retries=${L.maxRetries}`,
    "  No wallet / payment / signing / facilitator / RPC",
  ];
}

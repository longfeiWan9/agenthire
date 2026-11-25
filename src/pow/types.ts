/**
 * AgentHire D7.3 — Agent402 PoW preparation types.
 *
 * Mode: OFFLINE_PREP / NO_LIVE_POW / NO_SIGNING / NO_PAYMENT
 * Simulation outcomes are never ladder L3.
 */

export const POW_SCHEMA_VERSION = "1.0" as const;
export const POW_MODE =
  "OFFLINE_PREP / NO_LIVE_POW / NO_SIGNING / NO_PAYMENT" as const;

export const POW_ALGORITHM = "sha256-leading-zero-bits" as const;
export const POW_PREIMAGE_SEPARATOR = ":" as const;

/** Fixed Agent402 destinations (exact string match only). */
export const POW_CHALLENGE_URL =
  "https://agent402.tools/api/pow/challenge?slug=json-validate" as const;
export const POW_SUBMIT_URL =
  "https://agent402.tools/api/json-validate" as const;
export const POW_INFO_URL = "https://agent402.tools/api/pow" as const;

export const POW_SLUG = "json-validate" as const;
export const POW_CAPABILITY_ID = "cap:fe75bb2e25f2" as const;

/** Distinct one-time markers — GET challenge vs POST submit. */
export const POW_CHALLENGE_GET_MARKER_REL =
  "docs/day7/evidence/agent402-pow-challenge-get-001-live-attempt.marker" as const;
export const POW_SUBMIT_POST_MARKER_REL =
  "docs/day7/evidence/agent402-pow-submit-post-001-live-attempt.marker" as const;

export const POW_CHALLENGE_GET_REQUEST_ID =
  "POW-CHALLENGE-GET-001" as const;
export const POW_SUBMIT_POST_REQUEST_ID = "POW-SUBMIT-POST-001" as const;

/** Default solver budgets (offline / future live). */
export const POW_DEFAULT_MAX_ATTEMPTS = 2_000_000 as const;
export const POW_DEFAULT_MAX_DURATION_MS = 30_000 as const;
export const POW_DEFAULT_MAX_DIFFICULTY_BITS = 24 as const;
export const POW_CHALLENGE_TIMEOUT_MS = 5_000 as const;
export const POW_SUBMIT_TIMEOUT_MS = 5_000 as const;
export const POW_CHALLENGE_MAX_BYTES = 65_536 as const;
export const POW_SUBMIT_MAX_BYTES = 65_536 as const;

export type PowRunMode = "offline-simulation" | "approved-live";

/**
 * Success path:
 *   planned → requestingChallenge → challengeReceived → solving →
 *   solved → submitting → verified
 *
 * Failure terminals (any mid-state may enter):
 *   unauthorized | challengeRequestFailed | challengeInvalid |
 *   cancelled | budgetExhausted | solveFailed | submitFailed |
 *   responseInvalid | blocked
 */
export type PowStatus =
  | "planned"
  | "requestingChallenge"
  | "challengeReceived"
  | "solving"
  | "solved"
  | "submitting"
  | "verified"
  | "unauthorized"
  | "challengeRequestFailed"
  | "challengeInvalid"
  | "cancelled"
  | "budgetExhausted"
  | "solveFailed"
  | "submitFailed"
  | "responseInvalid"
  | "blocked";

export const POW_SUCCESS_TERMINAL: ReadonlySet<PowStatus> = new Set([
  "verified",
]);

export const POW_FAILURE_TERMINALS: ReadonlySet<PowStatus> = new Set([
  "unauthorized",
  "challengeRequestFailed",
  "challengeInvalid",
  "cancelled",
  "budgetExhausted",
  "solveFailed",
  "submitFailed",
  "responseInvalid",
  "blocked",
]);

export type PowSolverBudget = {
  readonly maxAttempts: number;
  readonly maxDurationMs: number;
  readonly maxDifficultyBits: number;
};

export type PowChallenge = {
  readonly token: string;
  readonly challenge: string;
  readonly difficultyBits: number;
  readonly expiresAt: string | null;
  readonly slug: typeof POW_SLUG;
  readonly rawKeys: readonly string[];
  readonly fixtureKind: "synthetic" | "captured" | "live";
};

export type PowSolution = {
  readonly token: string;
  readonly nonce: string;
  readonly preimage: string;
  readonly digestHex: string;
  readonly difficultyBits: number;
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly headerValue: string;
};

export type PowSolveOk = {
  readonly ok: true;
  readonly solution: PowSolution;
};

export type PowSolveFailReason =
  | "cancelled"
  | "budgetExhausted"
  | "invalidChallenge"
  | "difficultyTooHard";

export type PowSolveFail = {
  readonly ok: false;
  readonly reason: PowSolveFailReason;
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly message: string;
};

export type PowSolveResult = PowSolveOk | PowSolveFail;

export type PowExpectedEnvelope = {
  readonly valid: true;
  readonly errors: readonly [];
};

export const POW_EXPECTED_ENVELOPE: PowExpectedEnvelope = {
  valid: true,
  errors: [],
};

export type PowValidateEnvelope = {
  readonly valid: boolean;
  readonly errors: readonly unknown[];
  readonly extraKeys: readonly string[];
};

export type PowLadderLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export type PowLadderAssessment = {
  readonly priorLevel: PowLadderLevel;
  readonly observedLevel: PowLadderLevel;
  readonly providerExecutionVerified: boolean;
  readonly simulationOnly: boolean;
  readonly rationale: string;
};

export type PowSessionEvent = {
  readonly at: string;
  readonly from: PowStatus;
  readonly to: PowStatus;
  readonly transition: string;
  readonly note: string;
};

export type PowSession = {
  readonly schemaVersion: typeof POW_SCHEMA_VERSION;
  readonly mode: typeof POW_MODE;
  readonly sessionId: string;
  readonly runMode: PowRunMode;
  readonly status: PowStatus;
  readonly capabilityId: typeof POW_CAPABILITY_ID;
  readonly challengeUrl: typeof POW_CHALLENGE_URL;
  readonly submitUrl: typeof POW_SUBMIT_URL;
  readonly challenge: PowChallenge | null;
  readonly solution: PowSolution | null;
  readonly httpChallengeStatus: number | null;
  readonly httpSubmitStatus: number | null;
  readonly envelope: PowValidateEnvelope | null;
  readonly ladder: PowLadderAssessment;
  readonly networkChallengePerformed: boolean;
  readonly networkSubmitPerformed: boolean;
  readonly blockReason: string | null;
  readonly history: readonly PowSessionEvent[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

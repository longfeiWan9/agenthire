/**
 * Marketplace vertical-slice execution lifecycle (D8.1).
 *
 * Discover → Evaluate → Hire → Authorize → Execute → Verify
 *
 * Lifecycle status is independent of evidence ladder level (L0–L4).
 * An L0 capability may still progress through offline simulation phases.
 * Offline UI approval never grants live execution or payment authorization.
 *
 * STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT
 */

/** Re-exported ladder rung — kept local so marketplace does not import UI. */
export type LifecycleLadderLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export const EXECUTION_LIFECYCLE_SCHEMA_VERSION = "1.0" as const;
export const EXECUTION_LIFECYCLE_MODE =
  "STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT" as const;

/** Product journey phases (UX). Independent of HireJob machine states. */
export type MarketplacePhase =
  | "discover"
  | "evaluate"
  | "hire"
  | "authorize"
  | "execute"
  | "verify";

export const MARKETPLACE_PHASES: readonly MarketplacePhase[] = [
  "discover",
  "evaluate",
  "hire",
  "authorize",
  "execute",
  "verify",
] as const;

export const MARKETPLACE_PHASE_LABELS: Record<MarketplacePhase, string> = {
  discover: "Discover",
  evaluate: "Evaluate",
  hire: "Hire",
  authorize: "Authorize",
  execute: "Execute",
  verify: "Verify",
};

/**
 * Typed execution lifecycle for the guided console.
 * Never collapses into ladder level or "verified ready to hire".
 */
export type ExecutionLifecycleStatus =
  | "idle"
  | "inputsPending"
  | "inputsValidated"
  | "quoteUnavailable"
  | "quotePreviewed"
  | "awaitingSimulationAuth"
  | "simulationAuthorized"
  | "simulationRejected"
  | "authorizationInvalidated"
  | "executingOffline"
  | "verifiedSimulated"
  | "failedSimulated"
  | "blocked";

export type ExecutionLifecycleView = {
  readonly schemaVersion: typeof EXECUTION_LIFECYCLE_SCHEMA_VERSION;
  readonly mode: typeof EXECUTION_LIFECYCLE_MODE;
  readonly phase: MarketplacePhase;
  readonly status: ExecutionLifecycleStatus;
  /** Evidence ladder — orthogonal; never derived from lifecycle status. */
  readonly evidenceLadder: LifecycleLadderLevel;
  readonly liveExecutionAuthorized: false;
  readonly livePaymentAuthorized: false;
  readonly simulationOnly: true;
  readonly notes: readonly string[];
};

export type LifecycleDerivationInput = {
  readonly supported: boolean;
  readonly blockReason: string | null;
  readonly hasInput: boolean;
  readonly hasJob: boolean;
  readonly quoteUnavailable: boolean;
  readonly syntheticQuoteRevealed: boolean;
  readonly approvalState:
    | "none"
    | "notRequested"
    | "simulationApproved"
    | "simulationRejected"
    | "revoked"
    | "expired"
    | "blocked";
  readonly authorizationInvalidated: boolean;
  readonly hasFixtureResult: boolean;
  readonly fixtureOk: boolean | null;
  readonly evidenceLadder: LifecycleLadderLevel;
};

const PHASE_ORDER: Record<MarketplacePhase, number> = {
  discover: 0,
  evaluate: 1,
  hire: 2,
  authorize: 3,
  execute: 4,
  verify: 5,
};

export function phaseIndex(phase: MarketplacePhase): number {
  return PHASE_ORDER[phase];
}

/**
 * Derive lifecycle view from hire-session facts.
 * Ladder is passed in — never inferred from status.
 */
export function deriveExecutionLifecycle(
  input: LifecycleDerivationInput,
): ExecutionLifecycleView {
  const baseNotes: string[] = [
    "Lifecycle status is independent of evidence ladder level",
    "Offline UI approval ≠ live authorization",
  ];

  if (!input.supported) {
    return view("evaluate", "blocked", input.evidenceLadder, [
      ...baseNotes,
      input.blockReason ?? "Capability hire blocked offline",
    ]);
  }

  if (
    input.authorizationInvalidated &&
    !input.hasInput &&
    !input.hasJob &&
    !input.hasFixtureResult
  ) {
    return view("authorize", "authorizationInvalidated", input.evidenceLadder, [
      ...baseNotes,
      "Sensitive input or binding change invalidated prior simulation approval",
    ]);
  }

  if (input.hasFixtureResult) {
    if (input.fixtureOk === false) {
      return view("verify", "failedSimulated", input.evidenceLadder, [
        ...baseNotes,
        "SIMULATED failure — not a provider-verified outcome",
      ]);
    }
    return view("verify", "verifiedSimulated", input.evidenceLadder, [
      ...baseNotes,
      "SIMULATED verification — providerExecutionVerified=false",
    ]);
  }

  if (input.approvalState === "simulationRejected") {
    return view("authorize", "simulationRejected", input.evidenceLadder, [
      ...baseNotes,
      "Human rejected simulation approval",
    ]);
  }

  if (
    input.approvalState === "revoked" ||
    input.approvalState === "expired" ||
    input.approvalState === "blocked"
  ) {
    return view("authorize", "authorizationInvalidated", input.evidenceLadder, [
      ...baseNotes,
      `Approval terminal: ${input.approvalState}`,
    ]);
  }

  if (input.approvalState === "simulationApproved") {
    return view("execute", "simulationAuthorized", input.evidenceLadder, [
      ...baseNotes,
      "simulationApproved — executionAuthorization remains false",
    ]);
  }

  if (input.approvalState === "notRequested") {
    return view("authorize", "awaitingSimulationAuth", input.evidenceLadder, [
      ...baseNotes,
      "Awaiting simulation approve/reject — not live auth",
    ]);
  }

  if (input.syntheticQuoteRevealed) {
    return view("authorize", "quotePreviewed", input.evidenceLadder, [
      ...baseNotes,
      "SYNTHETIC quote preview — not a live provider quote",
    ]);
  }

  if (input.hasJob && input.quoteUnavailable) {
    return view("hire", "quoteUnavailable", input.evidenceLadder, [
      ...baseNotes,
      "Live quote unavailable — interface undocumented",
    ]);
  }

  if (input.hasJob) {
    return view("hire", "inputsValidated", input.evidenceLadder, baseNotes);
  }

  if (input.hasInput) {
    return view("hire", "inputsValidated", input.evidenceLadder, [
      ...baseNotes,
      "Input validated locally — create HireJob next",
    ]);
  }

  return view("hire", "inputsPending", input.evidenceLadder, [
    ...baseNotes,
    "Enter ticker or companyName to continue",
  ]);
}

function view(
  phase: MarketplacePhase,
  status: ExecutionLifecycleStatus,
  evidenceLadder: LifecycleLadderLevel,
  notes: readonly string[],
): ExecutionLifecycleView {
  return {
    schemaVersion: EXECUTION_LIFECYCLE_SCHEMA_VERSION,
    mode: EXECUTION_LIFECYCLE_MODE,
    phase,
    status,
    evidenceLadder,
    liveExecutionAuthorized: false,
    livePaymentAuthorized: false,
    simulationOnly: true,
    notes,
  };
}

/** Sensitive fields that must invalidate prior simulation approval. */
export const SENSITIVE_APPROVAL_FIELDS = [
  "ticker",
  "companyName",
  "kind",
  "amountAtomic",
  "asset",
  "network",
  "recipient",
  "quoteId",
  "endpointUrl",
  "method",
  "capabilityId",
  "hireJobId",
] as const;

export type SensitiveApprovalField = (typeof SENSITIVE_APPROVAL_FIELDS)[number];

export function describesSensitiveInvalidation(reason: string): boolean {
  const lower = reason.toLowerCase();
  return (
    /input change|cleared after input|invalidat|substitution|fingerprint|modified-binding|revok|expir/.test(
      lower,
    )
  );
}

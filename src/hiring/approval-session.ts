/**
 * Manual approval session (D5.3).
 *
 * Tracks notRequested → simulationApproved|simulationRejected|blocked|expired|revoked.
 * Fail closed on substitution, replay, and revocation.
 * simulationApproved ≠ live permission; both auth flags always false.
 */

import {
  ALWAYS_UNAUTHORIZED,
  APPROVAL_POLICY_VERSION,
  evaluateApprovalEligibility,
  fingerprintBinding,
  type ApprovalAuthorizationFlags,
  type ApprovalBinding,
  type ApprovalState,
} from "./approval-policy.ts";

export type ApprovalSessionEvent = {
  readonly at: string;
  readonly from: ApprovalState;
  readonly to: ApprovalState;
  readonly action: string;
  readonly note: string;
};

export type ApprovalSession = {
  readonly sessionId: string;
  readonly schemaVersion: typeof APPROVAL_POLICY_VERSION;
  readonly binding: ApprovalBinding;
  readonly fingerprint: string;
  readonly state: ApprovalState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly decidedAt: string | null;
  readonly flags: ApprovalAuthorizationFlags;
  readonly history: readonly ApprovalSessionEvent[];
  readonly blockReason: string | null;
};

export type ApprovalSessionResult =
  | { readonly ok: true; readonly session: ApprovalSession }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly session: ApprovalSession };

function event(
  from: ApprovalState,
  to: ApprovalState,
  action: string,
  note: string,
  at: string,
): ApprovalSessionEvent {
  return { at, from, to, action, note };
}

export function createApprovalSession(args: {
  readonly sessionId: string;
  readonly binding: ApprovalBinding;
  readonly createdAt: string;
}): ApprovalSession {
  return {
    sessionId: args.sessionId,
    schemaVersion: APPROVAL_POLICY_VERSION,
    binding: args.binding,
    fingerprint: fingerprintBinding(args.binding),
    state: "notRequested",
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
    decidedAt: null,
    flags: ALWAYS_UNAUTHORIZED,
    history: [],
    blockReason: null,
  };
}

function withState(
  session: ApprovalSession,
  next: ApprovalState,
  action: string,
  note: string,
  at: string,
  patch?: Partial<ApprovalSession>,
): ApprovalSession {
  const ev = event(session.state, next, action, note, at);
  return {
    ...session,
    ...patch,
    state: next,
    updatedAt: at,
    flags: ALWAYS_UNAUTHORIZED,
    history: [...session.history, ev],
  };
}

/**
 * Simulation-only approve. Never sets real execution/payment authorization.
 */
export function simulationApprove(
  session: ApprovalSession,
  args: {
    readonly binding: ApprovalBinding;
    readonly nowIso: string;
    readonly simulationOnly?: boolean;
  },
): ApprovalSessionResult {
  const simulationOnly = args.simulationOnly !== false;
  const check = evaluateApprovalEligibility({
    binding: args.binding,
    expectedFingerprint: session.fingerprint,
    state: session.state,
    nowIso: args.nowIso,
    simulationOnly,
  });

  if (!check.ok) {
    const blocked =
      check.code === "substitutionDetected" ||
      check.code === "replayDetected" ||
      check.code === "expired" ||
      check.code === "liveApprovalForbidden"
        ? withState(
            session,
            check.code === "expired" ? "expired" : "blocked",
            "simulationApprove",
            check.message,
            args.nowIso,
            { blockReason: check.message },
          )
        : session;
    return {
      ok: false,
      code: check.code,
      message: check.message,
      session: blocked,
    };
  }

  if (session.state !== "notRequested") {
    return {
      ok: false,
      code: "invalidState",
      message: `simulationApprove requires notRequested, got ${session.state}`,
      session,
    };
  }

  const next = withState(
    session,
    "simulationApproved",
    "simulationApprove",
    "SIMULATION approval only — executionAuthorization=false; paymentExecutionAuthorization=false; simulationApproved ≠ live permission",
    args.nowIso,
    { decidedAt: args.nowIso, blockReason: null },
  );

  return { ok: true, session: next };
}

export function simulationReject(
  session: ApprovalSession,
  args: { readonly nowIso: string; readonly reason: string },
): ApprovalSessionResult {
  if (session.state !== "notRequested" && session.state !== "simulationApproved") {
    return {
      ok: false,
      code: "invalidState",
      message: `simulationReject not allowed from ${session.state}`,
      session,
    };
  }
  const next = withState(
    session,
    "simulationRejected",
    "simulationReject",
    args.reason,
    args.nowIso,
    { decidedAt: args.nowIso, blockReason: args.reason },
  );
  return { ok: true, session: next };
}

export function revokeApproval(
  session: ApprovalSession,
  args: { readonly nowIso: string; readonly reason: string },
): ApprovalSessionResult {
  if (session.state !== "simulationApproved") {
    return {
      ok: false,
      code: "invalidState",
      message: `revoke requires simulationApproved, got ${session.state}`,
      session,
    };
  }
  const next = withState(
    session,
    "revoked",
    "revoke",
    args.reason,
    args.nowIso,
    { blockReason: args.reason },
  );
  return { ok: true, session: next };
}

export function expireApproval(
  session: ApprovalSession,
  args: { readonly nowIso: string },
): ApprovalSessionResult {
  if (
    session.state === "expired" ||
    session.state === "revoked" ||
    session.state === "blocked" ||
    session.state === "simulationRejected"
  ) {
    return {
      ok: false,
      code: "alreadyTerminal",
      message: `session already ${session.state}`,
      session,
    };
  }
  const next = withState(
    session,
    "expired",
    "expire",
    "Quote/approval freshness expired",
    args.nowIso,
    { blockReason: "expired" },
  );
  return { ok: true, session: next };
}

/**
 * Attempt to re-bind a mutated binding against an existing session.
 * Always fail-closed (substitution).
 */
export function assertBindingUnchanged(
  session: ApprovalSession,
  candidate: ApprovalBinding,
): ApprovalSessionResult {
  const actual = fingerprintBinding(candidate);
  if (actual !== session.fingerprint) {
    const blocked = withState(
      session,
      "blocked",
      "assertBinding",
      "Substitution detected — binding fingerprint mismatch; fail-closed",
      session.updatedAt,
      {
        blockReason:
          "Substitution detected — binding fingerprint mismatch; fail-closed",
      },
    );
    return {
      ok: false,
      code: "substitutionDetected",
      message: "Substitution detected — binding fingerprint mismatch; fail-closed",
      session: blocked,
    };
  }
  return { ok: true, session };
}

/**
 * Live permission check — always false in D5.3 regardless of simulationApproved.
 */
export function hasLiveExecutionPermission(session: ApprovalSession): false {
  void session;
  return false;
}

export function hasLivePaymentPermission(session: ApprovalSession): false {
  void session;
  return false;
}

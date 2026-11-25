/**
 * PoW execution state machine (D7.3).
 *
 * Offline only — transitions never perform network I/O.
 * Live network requires separate one-time GET + POST markers/auth.
 */

import {
  POW_CAPABILITY_ID,
  POW_CHALLENGE_URL,
  POW_FAILURE_TERMINALS,
  POW_MODE,
  POW_SCHEMA_VERSION,
  POW_SUBMIT_URL,
  POW_SUCCESS_TERMINAL,
  type PowChallenge,
  type PowLadderAssessment,
  type PowRunMode,
  type PowSession,
  type PowSessionEvent,
  type PowSolution,
  type PowStatus,
  type PowValidateEnvelope,
} from "./types.ts";

export type PowTransition =
  | { readonly type: "beginChallengeRequest" }
  | {
      readonly type: "receiveChallenge";
      readonly challenge: PowChallenge;
      readonly httpStatus: number;
      readonly networkPerformed: boolean;
    }
  | {
      readonly type: "failChallengeRequest";
      readonly reason: string;
      readonly httpStatus?: number | null;
      readonly networkPerformed?: boolean;
    }
  | { readonly type: "beginSolve" }
  | { readonly type: "recordSolution"; readonly solution: PowSolution }
  | {
      readonly type: "failSolve";
      readonly terminal: "cancelled" | "budgetExhausted" | "solveFailed";
      readonly reason: string;
    }
  | { readonly type: "beginSubmit" }
  | {
      readonly type: "verifySubmit";
      readonly httpStatus: number;
      readonly envelope: PowValidateEnvelope;
      readonly networkPerformed: boolean;
      readonly providerExecutionVerified: boolean;
      readonly simulationOnly: boolean;
    }
  | {
      readonly type: "failSubmit";
      readonly terminal: "submitFailed" | "responseInvalid";
      readonly reason: string;
      readonly httpStatus?: number | null;
      readonly networkPerformed?: boolean;
    }
  | {
      readonly type: "block";
      readonly reason: string;
      readonly terminal?: "blocked" | "unauthorized" | "challengeInvalid";
    };

export type PowTransitionResult =
  | { readonly ok: true; readonly session: PowSession }
  | { readonly ok: false; readonly code: string; readonly message: string };

function isTerminal(status: PowStatus): boolean {
  return POW_SUCCESS_TERMINAL.has(status) || POW_FAILURE_TERMINALS.has(status);
}

function event(
  from: PowStatus,
  to: PowStatus,
  transition: string,
  note: string,
  at: string,
): PowSessionEvent {
  return { at, from, to, transition, note };
}

function withUpdate(
  session: PowSession,
  patch: Partial<PowSession>,
  ev: PowSessionEvent,
): PowSession {
  return {
    ...session,
    ...patch,
    updatedAt: ev.at,
    history: [...session.history, ev],
  };
}

export function initialPowLadder(
  runMode: PowRunMode,
): PowLadderAssessment {
  return {
    priorLevel: "L2",
    observedLevel: "L2",
    providerExecutionVerified: false,
    simulationOnly: runMode === "offline-simulation",
    rationale:
      runMode === "offline-simulation"
        ? "Offline simulation — prior L1+L2 observation stands; simulation ≠ L3."
        : "Live PoW not yet verified — remains at prior L2 until genuine 2xx + envelope match.",
  };
}

export function createPowSession(input: {
  readonly sessionId: string;
  readonly runMode: PowRunMode;
  readonly createdAt?: string;
}): PowSession {
  const at = input.createdAt ?? new Date(0).toISOString();
  return {
    schemaVersion: POW_SCHEMA_VERSION,
    mode: POW_MODE,
    sessionId: input.sessionId,
    runMode: input.runMode,
    status: "planned",
    capabilityId: POW_CAPABILITY_ID,
    challengeUrl: POW_CHALLENGE_URL,
    submitUrl: POW_SUBMIT_URL,
    challenge: null,
    solution: null,
    httpChallengeStatus: null,
    httpSubmitStatus: null,
    envelope: null,
    ladder: initialPowLadder(input.runMode),
    networkChallengePerformed: false,
    networkSubmitPerformed: false,
    blockReason: null,
    history: [],
    createdAt: at,
    updatedAt: at,
  };
}

export function applyPowTransition(
  session: PowSession,
  transition: PowTransition,
  at: string = new Date(0).toISOString(),
): PowTransitionResult {
  if (isTerminal(session.status)) {
    return {
      ok: false,
      code: "terminal",
      message: `session ${session.sessionId} is terminal (${session.status})`,
    };
  }

  switch (transition.type) {
    case "beginChallengeRequest": {
      if (session.status !== "planned") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `beginChallengeRequest requires planned, got ${session.status}`,
        };
      }
      if (session.runMode === "approved-live") {
        // Live still needs explicit markers; state machine alone never authorizes.
      }
      const ev = event(
        "planned",
        "requestingChallenge",
        "beginChallengeRequest",
        "requesting PoW challenge (transport may be fake or live)",
        at,
      );
      return {
        ok: true,
        session: withUpdate(session, { status: "requestingChallenge" }, ev),
      };
    }

    case "receiveChallenge": {
      if (session.status !== "requestingChallenge") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `receiveChallenge requires requestingChallenge, got ${session.status}`,
        };
      }
      const ev = event(
        "requestingChallenge",
        "challengeReceived",
        "receiveChallenge",
        `challenge received (http=${transition.httpStatus}, network=${transition.networkPerformed})`,
        at,
      );
      return {
        ok: true,
        session: withUpdate(
          session,
          {
            status: "challengeReceived",
            challenge: transition.challenge,
            httpChallengeStatus: transition.httpStatus,
            networkChallengePerformed: transition.networkPerformed,
          },
          ev,
        ),
      };
    }

    case "failChallengeRequest": {
      if (session.status !== "requestingChallenge" && session.status !== "planned") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `failChallengeRequest not allowed from ${session.status}`,
        };
      }
      const from = session.status;
      const ev = event(
        from,
        "challengeRequestFailed",
        "failChallengeRequest",
        transition.reason,
        at,
      );
      return {
        ok: true,
        session: withUpdate(
          session,
          {
            status: "challengeRequestFailed",
            blockReason: transition.reason,
            httpChallengeStatus: transition.httpStatus ?? null,
            networkChallengePerformed: transition.networkPerformed ?? false,
          },
          ev,
        ),
      };
    }

    case "beginSolve": {
      if (session.status !== "challengeReceived") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `beginSolve requires challengeReceived, got ${session.status}`,
        };
      }
      if (session.challenge == null) {
        return {
          ok: false,
          code: "missingChallenge",
          message: "cannot solve without a challenge",
        };
      }
      const ev = event(
        "challengeReceived",
        "solving",
        "beginSolve",
        "starting bounded PoW solver",
        at,
      );
      return {
        ok: true,
        session: withUpdate(session, { status: "solving" }, ev),
      };
    }

    case "recordSolution": {
      if (session.status !== "solving") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `recordSolution requires solving, got ${session.status}`,
        };
      }
      const ev = event(
        "solving",
        "solved",
        "recordSolution",
        `solved in ${transition.solution.attempts} attempts (${transition.solution.elapsedMs}ms)`,
        at,
      );
      return {
        ok: true,
        session: withUpdate(
          session,
          { status: "solved", solution: transition.solution },
          ev,
        ),
      };
    }

    case "failSolve": {
      if (session.status !== "solving" && session.status !== "challengeReceived") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `failSolve not allowed from ${session.status}`,
        };
      }
      const ev = event(
        session.status,
        transition.terminal,
        "failSolve",
        transition.reason,
        at,
      );
      return {
        ok: true,
        session: withUpdate(
          session,
          { status: transition.terminal, blockReason: transition.reason },
          ev,
        ),
      };
    }

    case "beginSubmit": {
      if (session.status !== "solved") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `beginSubmit requires solved, got ${session.status}`,
        };
      }
      if (session.solution == null) {
        return {
          ok: false,
          code: "missingSolution",
          message: "cannot submit without a solution",
        };
      }
      const ev = event(
        "solved",
        "submitting",
        "beginSubmit",
        "submitting JSON validate with X-Pow-Solution (transport may be fake or live)",
        at,
      );
      return {
        ok: true,
        session: withUpdate(session, { status: "submitting" }, ev),
      };
    }

    case "verifySubmit": {
      if (session.status !== "submitting") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `verifySubmit requires submitting, got ${session.status}`,
        };
      }
      if (!transition.envelope.valid || transition.envelope.errors.length > 0) {
        return {
          ok: false,
          code: "envelopeNotVerified",
          message: "verifySubmit requires valid:true and empty errors",
        };
      }
      if (
        transition.providerExecutionVerified &&
        transition.simulationOnly
      ) {
        return {
          ok: false,
          code: "simulationContradiction",
          message:
            "simulationOnly=true cannot claim providerExecutionVerified=true",
        };
      }
      const ladder: PowLadderAssessment = {
        priorLevel: "L2",
        observedLevel:
          transition.providerExecutionVerified && !transition.simulationOnly
            ? "L3"
            : "L2",
        providerExecutionVerified: transition.providerExecutionVerified,
        simulationOnly: transition.simulationOnly,
        rationale: transition.simulationOnly
          ? "Offline fake-transport success — simulation ≠ L3; prior L2 retained."
          : transition.providerExecutionVerified
            ? "Live provider 2xx with expected envelope — L3 candidate (evidence required)."
            : "Submit observed without full provider verification criteria.",
      };
      const ev = event(
        "submitting",
        "verified",
        "verifySubmit",
        `submit verified (http=${transition.httpStatus}, sim=${transition.simulationOnly})`,
        at,
      );
      return {
        ok: true,
        session: withUpdate(
          session,
          {
            status: "verified",
            envelope: transition.envelope,
            httpSubmitStatus: transition.httpStatus,
            networkSubmitPerformed: transition.networkPerformed,
            ladder,
          },
          ev,
        ),
      };
    }

    case "failSubmit": {
      if (session.status !== "submitting" && session.status !== "solved") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `failSubmit not allowed from ${session.status}`,
        };
      }
      const ev = event(
        session.status,
        transition.terminal,
        "failSubmit",
        transition.reason,
        at,
      );
      return {
        ok: true,
        session: withUpdate(
          session,
          {
            status: transition.terminal,
            blockReason: transition.reason,
            httpSubmitStatus: transition.httpStatus ?? null,
            networkSubmitPerformed: transition.networkPerformed ?? false,
          },
          ev,
        ),
      };
    }

    case "block": {
      const terminal = transition.terminal ?? "blocked";
      if (!POW_FAILURE_TERMINALS.has(terminal)) {
        return {
          ok: false,
          code: "invalidTerminal",
          message: `block terminal ${terminal} is not a failure terminal`,
        };
      }
      const ev = event(
        session.status,
        terminal,
        "block",
        transition.reason,
        at,
      );
      return {
        ok: true,
        session: withUpdate(
          session,
          { status: terminal, blockReason: transition.reason },
          ev,
        ),
      };
    }

    default: {
      const _exhaustive: never = transition;
      return {
        ok: false,
        code: "unknownTransition",
        message: `unknown transition ${JSON.stringify(_exhaustive)}`,
      };
    }
  }
}

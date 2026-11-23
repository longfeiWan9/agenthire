/**
 * HireJob offline state machine (D5.2).
 *
 * Allowed transitions (no paidVerified / live success):
 *   draft → inputValidated | blocked | simulatedFailed
 *   inputValidated → quoteUnavailable | awaitingApproval | blocked
 *   quoteUnavailable → blocked | awaitingApproval
 *   awaitingApproval → blocked | simulatedSucceeded | simulatedFailed
 *   blocked / simulatedSucceeded / simulatedFailed → (terminal)
 *
 * STRICTLY_OFFLINE — transitions never perform network I/O.
 */

import { validateSecCompanyIdentityInput } from "../adapters/quantjourney-sec-identity.ts";
import type {
  HireJob,
  HireJobEvent,
  HireJobPaymentView,
  HireJobResultView,
  HireJobStatus,
  HireJobTransition,
} from "./types.ts";

export type TransitionResult =
  | { readonly ok: true; readonly job: HireJob }
  | { readonly ok: false; readonly code: string; readonly message: string };

const TERMINAL: ReadonlySet<HireJobStatus> = new Set([
  "blocked",
  "simulatedSucceeded",
  "simulatedFailed",
]);

function event(
  from: HireJobStatus,
  to: HireJobStatus,
  transition: HireJobTransition["type"],
  note: string,
  at: string,
): HireJobEvent {
  return { at, from, to, transition, note };
}

function withUpdate(
  job: HireJob,
  patch: Partial<HireJob>,
  ev: HireJobEvent,
): HireJob {
  return {
    ...job,
    ...patch,
    updatedAt: ev.at,
    history: [...job.history, ev],
  };
}

export function applyHireJobTransition(
  job: HireJob,
  transition: HireJobTransition,
  at: string = new Date(0).toISOString(),
): TransitionResult {
  if (TERMINAL.has(job.status)) {
    return {
      ok: false,
      code: "terminal",
      message: `job ${job.hireJobId} is terminal (${job.status})`,
    };
  }

  switch (transition.type) {
    case "validateInput": {
      if (job.status !== "draft") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `validateInput requires draft, got ${job.status}`,
        };
      }
      const validated = validateSecCompanyIdentityInput(job.rawInput);
      if (!validated.ok) {
        const ev = event(
          "draft",
          "simulatedFailed",
          "validateInput",
          `input validation failed: ${validated.code}`,
          at,
        );
        return {
          ok: true,
          job: withUpdate(
            job,
            {
              status: "simulatedFailed",
              blockReason: validated.message,
              result: {
                outcomeKind: "simulatedFixture",
                fixtureId: null,
                providerExecutionVerified: false,
                payload: { error: validated },
                warning:
                  "SIMULATED RESULT — NOT RETURNED BY AN EXTERNAL PROVIDER; validation failed locally",
              },
            },
            ev,
          ),
        };
      }
      const ev = event(
        "draft",
        "inputValidated",
        "validateInput",
        "input validated offline",
        at,
      );
      return {
        ok: true,
        job: withUpdate(
          job,
          {
            status: "inputValidated",
            validatedInput: validated.value,
            blockReason: null,
          },
          ev,
        ),
      };
    }

    case "markQuoteUnavailable": {
      if (job.status !== "inputValidated" && job.status !== "quoteUnavailable") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `markQuoteUnavailable not allowed from ${job.status}`,
        };
      }
      const from = job.status;
      const ev = event(
        from,
        "quoteUnavailable",
        "markQuoteUnavailable",
        transition.reason,
        at,
      );
      return {
        ok: true,
        job: withUpdate(
          job,
          {
            status: "quoteUnavailable",
            quoteReason: transition.reason,
          },
          ev,
        ),
      };
    }

    case "requestApproval": {
      if (
        job.status !== "inputValidated" &&
        job.status !== "quoteUnavailable"
      ) {
        return {
          ok: false,
          code: "invalidTransition",
          message: `requestApproval not allowed from ${job.status}`,
        };
      }
      const ev = event(
        job.status,
        "awaitingApproval",
        "requestApproval",
        "awaiting explicit human approval — network still unauthorized",
        at,
      );
      return {
        ok: true,
        job: withUpdate(job, { status: "awaitingApproval" }, ev),
      };
    }

    case "block": {
      if (TERMINAL.has(job.status) || job.status === "draft") {
        // draft uses validate/simulate paths; allow block from mid states
        if (job.status === "draft") {
          return {
            ok: false,
            code: "invalidTransition",
            message: "block from draft is unsupported; use validateInput failure path",
          };
        }
      }
      const allowed: HireJobStatus[] = [
        "inputValidated",
        "quoteUnavailable",
        "awaitingApproval",
      ];
      if (!allowed.includes(job.status)) {
        return {
          ok: false,
          code: "invalidTransition",
          message: `block not allowed from ${job.status}`,
        };
      }
      const ev = event(job.status, "blocked", "block", transition.reason, at);
      return {
        ok: true,
        job: withUpdate(
          job,
          {
            status: "blocked",
            blockReason: transition.reason,
            flags: {
              ...job.flags,
              approvedForNetworkExecution: false,
              paidVerified: false,
            },
          },
          ev,
        ),
      };
    }

    case "simulateSuccess": {
      if (job.status !== "awaitingApproval") {
        return {
          ok: false,
          code: "invalidTransition",
          message: `simulateSuccess requires awaitingApproval, got ${job.status}`,
        };
      }
      const result: HireJobResultView = {
        outcomeKind: "simulatedFixture",
        fixtureId: transition.fixtureId,
        providerExecutionVerified: false,
        payload: transition.result,
        warning:
          "SIMULATED RESULT — NOT RETURNED BY AN EXTERNAL PROVIDER; NO PAYMENT WAS MADE.",
      };
      const ev = event(
        "awaitingApproval",
        "simulatedSucceeded",
        "simulateSuccess",
        `offline fixture ${transition.fixtureId}`,
        at,
      );
      return {
        ok: true,
        job: withUpdate(
          job,
          {
            status: "simulatedSucceeded",
            result,
            flags: {
              approvedForNetworkExecution: false,
              executionMode: "offlineFixtureOnly",
              paidVerified: false,
            },
          },
          ev,
        ),
      };
    }

    case "simulateFailure": {
      const allowed: HireJobStatus[] = ["draft", "awaitingApproval"];
      if (!allowed.includes(job.status)) {
        return {
          ok: false,
          code: "invalidTransition",
          message: `simulateFailure not allowed from ${job.status}`,
        };
      }
      const result: HireJobResultView = {
        outcomeKind: "simulatedFixture",
        fixtureId: transition.fixtureId,
        providerExecutionVerified: false,
        payload: { reason: transition.reason },
        warning:
          "SIMULATED RESULT — NOT RETURNED BY AN EXTERNAL PROVIDER; NO PAYMENT WAS MADE.",
      };
      const ev = event(
        job.status,
        "simulatedFailed",
        "simulateFailure",
        transition.reason,
        at,
      );
      return {
        ok: true,
        job: withUpdate(
          job,
          {
            status: "simulatedFailed",
            blockReason: transition.reason,
            result,
          },
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

export function setHireJobPaymentView(
  job: HireJob,
  payment: HireJobPaymentView,
): HireJob {
  return {
    ...job,
    payment,
    flags: {
      ...job.flags,
      paidVerified: false,
    },
  };
}

export function isTerminalHireJobStatus(status: HireJobStatus): boolean {
  return TERMINAL.has(status);
}

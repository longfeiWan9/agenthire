/**
 * D7.3 Agent402 PoW — display-only adapter (D8.1 Task F).
 *
 * Read-only compatibility surface for marketplace UX.
 * Does NOT import D7.3 `src/pow/*` modules.
 * Does NOT solve, submit, call DNS/HTTP, or raise ladder above L0 offline.
 *
 * Merge of D7.3 remains a separate integration decision — see report.
 *
 * STRICTLY_OFFLINE / NO_LIVE_POW / NO_SIGNING / NO_PAYMENT
 */

export const D73_DISPLAY_ADAPTER_VERSION = "1.0" as const;
export const D73_DISPLAY_MODE =
  "DISPLAY_ONLY / NO_LIVE_POW / NO_IMPORT_OF_POW_RUNTIME" as const;

/** Mirror of D7.3 PowStatus labels for UI copy only. */
export type PowDisplayStatus =
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
  | "blocked"
  | "notIntegrated";

export type Agent402AuthDistinction = {
  readonly kind: "agent402-pow" | "x402-payment" | "simulation-ui-approval";
  readonly label: string;
  readonly meansLiveExecution: false;
  readonly meansLivePayment: false;
  readonly note: string;
};

export type D73PowDisplayView = {
  readonly adapterVersion: typeof D73_DISPLAY_ADAPTER_VERSION;
  readonly mode: typeof D73_DISPLAY_MODE;
  readonly capabilityId: "cap:fe75bb2e25f2";
  readonly status: PowDisplayStatus;
  readonly ladderCeilingOffline: "L0";
  readonly distinctions: readonly Agent402AuthDistinction[];
  readonly mergeIntegrated: false;
  readonly notes: readonly string[];
};

export const AGENT402_JSON_VALIDATE_CAPABILITY_ID =
  "cap:fe75bb2e25f2" as const;

/**
 * Static offline display for Agent402 JSON-validate.
 * Status stays notIntegrated until a future authorized D7.3 code merge.
 */
export function buildAgent402PowDisplayView(): D73PowDisplayView {
  return {
    adapterVersion: D73_DISPLAY_ADAPTER_VERSION,
    mode: D73_DISPLAY_MODE,
    capabilityId: AGENT402_JSON_VALIDATE_CAPABILITY_ID,
    status: "notIntegrated",
    ladderCeilingOffline: "L0",
    distinctions: [
      {
        kind: "simulation-ui-approval",
        label: "Offline UI simulation approval",
        meansLiveExecution: false,
        meansLivePayment: false,
        note: "Hire Console approve/reject is local UX only — never live auth.",
      },
      {
        kind: "agent402-pow",
        label: "Agent402 PoW gate (D7.3 prep)",
        meansLiveExecution: false,
        meansLivePayment: false,
        note: "PoW challenge/solve/submit is a separate authorization path; not payment settlement.",
      },
      {
        kind: "x402-payment",
        label: "x402 payment challenge",
        meansLiveExecution: false,
        meansLivePayment: false,
        note: "Payment-required offers are distinct from PoW; both stay unauthorized offline.",
      },
    ],
    mergeIntegrated: false,
    notes: [
      "D7.3 worktree inspected read-only — not merged into D8.1",
      "Display adapter only — no pow runtime import",
      "Offline ladder ceiling remains L0",
    ],
  };
}

export function formatPowDisplayStatus(status: PowDisplayStatus): string {
  if (status === "notIntegrated") {
    return "PoW runtime not integrated (display-only)";
  }
  return `PoW status: ${status} (display mirror)`;
}

/**
 * Declared merge dependencies if PO later authorizes integrating D7.3 into main.
 * Informational only — D8.1 does not merge.
 */
export const D73_MERGE_DEPENDENCIES = [
  {
    path: "src/pow/",
    role: "PoW types, state machine, solver, markers, operator CLI, fake transport",
  },
  {
    path: "src/scripts/pow-operator.ts",
    role: "Operator CLI entry",
  },
  {
    path: "src/scripts/observe-agent402-challenge-schema.ts",
    role: "Stage A schema observation helper",
  },
  {
    path: "src/erc8004/secure-https.ts",
    role: "Header/transport hardening delta from D7.3",
  },
  {
    path: "tests/pow-*.test.ts",
    role: "Offline PoW simulation and auth-gate tests",
  },
  {
    path: "package.json scripts",
    role: "pow operator / observe script wiring",
  },
] as const;

export type D73MergeDependency = (typeof D73_MERGE_DEPENDENCIES)[number];

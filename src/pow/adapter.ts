/**
 * Controlled Agent402 PoW adapter (D7.3).
 *
 * Fixed URLs only. JSONVALIDATE-002 body. Expected {valid:true,errors:[]}.
 * Reuses secure-HTTPS protections via injectable transport.
 *
 * Default runMode is offline-simulation. approved-live refuses unless
 * explicit liveAuthorizationGranted=true AND exclusive markers can be
 * written — D7.3 never enables live by default and does not call the network.
 *
 * Marker lifecycle (approved-live):
 *   POW-L3-GET-002  — immediately before first authorized network op
 *   POW-L3-POST-002 — only after challenge/solver/expiry gates, before POST
 */

import { createHash } from "node:crypto";
import {
  secureHttpsExchange,
  type SecureHttpsDeps,
  type SecureHttpsExchange,
} from "../erc8004/secure-https.ts";
import {
  JSONVALIDATE_001_REQUEST_BODY,
  requestBodySha256 as jsonValidateBodySha256,
  canonicalRequestBodyJson,
} from "../providers/agent402-jsonvalidate-observation.ts";
import {
  resolveAuthorizedExpiryMargin,
  resolveAuthorizedSolverBudget,
} from "./auth-limits.ts";
import {
  assertExactPowChallengeUrl,
  assertExactPowSubmitUrl,
  checkChallengeExpiry,
  parsePowChallengeBytes,
} from "./challenge.ts";
import { matchesExpectedPowEnvelope, parseValidateEnvelopeBytes } from "./envelope.ts";
import {
  absPowMarkerPath,
  powMarkerExists,
  writePowAttemptMarker,
} from "./markers.ts";
import { solvePowChallenge, type SolvePowInput } from "./solver.ts";
import {
  applyPowTransition,
  createPowSession,
} from "./state-machine.ts";
import {
  POW_CHALLENGE_MAX_BYTES,
  POW_CHALLENGE_TIMEOUT_MS,
  POW_CHALLENGE_URL,
  POW_EXPECTED_ENVELOPE,
  POW_SUBMIT_MAX_BYTES,
  POW_SUBMIT_TIMEOUT_MS,
  POW_SUBMIT_URL,
  type PowChallenge,
  type PowChallengeParseMode,
  type PowRunMode,
  type PowSession,
  type PowSolverBudget,
} from "./types.ts";

export const POW_ADAPTER_ID = "adapter:agent402-jsonvalidate-pow@prep" as const;

/** Same Alice/age fixture as JSONVALIDATE-001/002. */
export const POW_REQUEST_BODY = JSONVALIDATE_001_REQUEST_BODY;

export type PowTransport = (
  url: string,
  deps?: SecureHttpsDeps,
) => Promise<SecureHttpsExchange>;

export type RunPowPreparationInput = {
  readonly sessionId: string;
  readonly runMode?: PowRunMode;
  /**
   * Must be true for approved-live. D7.3 offline prep leaves this false.
   * Even when true, exclusive GET then POST markers are required around I/O.
   */
  readonly liveAuthorizationGranted?: boolean;
  readonly repoRoot?: string;
  readonly transport?: PowTransport;
  readonly solverBudget?: Partial<PowSolverBudget>;
  readonly signal?: AbortSignal;
  /** Injectable wall clock (ms since epoch) for expiry + solver budgets. */
  readonly now?: () => number;
  readonly clockIso?: string;
  /** Override challenge JSON parse mode (default: live→contract, else compat). */
  readonly challengeParseMode?: PowChallengeParseMode;
  /** Expiry safety margin in ms (default ≥ authorized minimum 5000). */
  readonly expiryMarginMs?: number;
  /** Test hook: skip marker writes even in approved-live (still requires auth flag). */
  readonly skipLiveMarkersForTest?: boolean;
};

export type RunPowPreparationResult = {
  readonly session: PowSession;
  readonly requestBodySha256: string;
  readonly simulationOnly: boolean;
  readonly providerExecutionVerified: boolean;
  readonly nonActions: readonly string[];
};

export const POW_NON_ACTIONS = [
  "No live Agent402 HTTP/DNS in offline-simulation",
  "No PoW challenge retrieve against production without approved-live + POW-L3-GET-002 marker",
  "No PoW submit against production without approved-live + POW-L3-POST-002 marker",
  "No wallet / signing / x402 payment / settlement / facilitator / RPC",
  "No Stage A / JSONVALIDATE-001/002 / prior dual-live marker reset",
  "Simulation success ≠ ladder L3",
] as const;

export function powRequestBodySha256(): string {
  return jsonValidateBodySha256();
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function fetchChallenge(input: {
  readonly transport: PowTransport;
  readonly networkLive: boolean;
  readonly parseMode: PowChallengeParseMode;
}): Promise<
  | {
      readonly ok: true;
      readonly challenge: PowChallenge;
      readonly httpStatus: number;
      readonly networkPerformed: boolean;
      readonly bodySha256: string;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly httpStatus: number | null;
      readonly networkPerformed: boolean;
    }
> {
  assertExactPowChallengeUrl(POW_CHALLENGE_URL);
  let exchange: SecureHttpsExchange;
  try {
    exchange = await input.transport(POW_CHALLENGE_URL, {
      method: "GET",
      timeoutMs: POW_CHALLENGE_TIMEOUT_MS,
      maxBytes: POW_CHALLENGE_MAX_BYTES,
      accept: "application/json",
      userAgent: "AgentHire-pow-prep/0.1 (OFFLINE_OR_AUTHORIZED)",
    });
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error ? error.message : "challenge transport error",
      httpStatus: null,
      networkPerformed: input.networkLive,
    };
  }

  if (exchange.statusCode < 200 || exchange.statusCode >= 300) {
    return {
      ok: false,
      reason: `challenge HTTP ${exchange.statusCode}`,
      httpStatus: exchange.statusCode,
      networkPerformed: input.networkLive,
    };
  }

  const parsed = parsePowChallengeBytes(exchange.body, {
    fixtureKind: input.networkLive ? "live" : "synthetic",
    mode: input.parseMode,
  });
  if (!parsed.ok) {
    return {
      ok: false,
      reason: `${parsed.reason}: ${parsed.message}`,
      httpStatus: exchange.statusCode,
      networkPerformed: input.networkLive,
    };
  }

  return {
    ok: true,
    challenge: parsed.challenge,
    httpStatus: exchange.statusCode,
    networkPerformed: input.networkLive,
    bodySha256: sha256Hex(exchange.body),
  };
}

async function submitWithSolution(input: {
  readonly transport: PowTransport;
  readonly headerValue: string;
  readonly networkLive: boolean;
}): Promise<
  | {
      readonly ok: true;
      readonly httpStatus: number;
      readonly networkPerformed: boolean;
      readonly body: Buffer;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly httpStatus: number | null;
      readonly networkPerformed: boolean;
      readonly body: Buffer | null;
    }
> {
  assertExactPowSubmitUrl(POW_SUBMIT_URL);
  const body = canonicalRequestBodyJson();
  let exchange: SecureHttpsExchange;
  try {
    exchange = await input.transport(POW_SUBMIT_URL, {
      method: "POST",
      body,
      contentType: "application/json",
      timeoutMs: POW_SUBMIT_TIMEOUT_MS,
      maxBytes: POW_SUBMIT_MAX_BYTES,
      accept: "application/json",
      userAgent: "AgentHire-pow-prep/0.1 (OFFLINE_OR_AUTHORIZED)",
      powSolution: input.headerValue,
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "submit transport error",
      httpStatus: null,
      networkPerformed: input.networkLive,
      body: null,
    };
  }
  return {
    ok: true,
    httpStatus: exchange.statusCode,
    networkPerformed: input.networkLive,
    body: exchange.body,
  };
}

/**
 * Run end-to-end PoW preparation.
 * offline-simulation: uses injected/fake transport, never claims L3.
 * approved-live: refused unless liveAuthorizationGranted and markers writable;
 * still uses transport injection (defaults to secureHttpsExchange) — D7.3
 * callers must not set approved-live without Product-Owner dual auth.
 */
export async function runPowPreparation(
  input: RunPowPreparationInput,
): Promise<RunPowPreparationResult> {
  const runMode: PowRunMode = input.runMode ?? "offline-simulation";
  const clock = input.clockIso ?? new Date(0).toISOString();
  let session = createPowSession({
    sessionId: input.sessionId,
    runMode,
    createdAt: clock,
  });
  const bodySha = powRequestBodySha256();

  const refuse = (
    statusSession: PowSession,
  ): RunPowPreparationResult => ({
    session: statusSession,
    requestBodySha256: bodySha,
    simulationOnly: true,
    providerExecutionVerified: false,
    nonActions: POW_NON_ACTIONS,
  });

  let writeLiveMarkers = false;
  let liveRepoRoot: string | null = null;

  if (runMode === "approved-live") {
    if (input.liveAuthorizationGranted !== true) {
      const blocked = applyPowTransition(
        session,
        {
          type: "block",
          terminal: "unauthorized",
          reason:
            "approved-live requires liveAuthorizationGranted=true (separate one-time auth)",
        },
        clock,
      );
      if (!blocked.ok) throw new Error(blocked.message);
      return refuse(blocked.session);
    }
    if (!input.skipLiveMarkersForTest) {
      if (input.repoRoot == null) {
        const blocked = applyPowTransition(
          session,
          {
            type: "block",
            terminal: "unauthorized",
            reason: "approved-live requires repoRoot for exclusive markers",
          },
          clock,
        );
        if (!blocked.ok) throw new Error(blocked.message);
        return refuse(blocked.session);
      }
      const getMarker = absPowMarkerPath(input.repoRoot, "challenge-get");
      const postMarker = absPowMarkerPath(input.repoRoot, "submit-post");
      if (powMarkerExists(getMarker) || powMarkerExists(postMarker)) {
        const blocked = applyPowTransition(
          session,
          {
            type: "block",
            terminal: "unauthorized",
            reason:
              "PoW live markers already exist — POW-L3-GET-002 and POW-L3-POST-002 each need fresh one-time auth (do not reset)",
          },
          clock,
        );
        if (!blocked.ok) throw new Error(blocked.message);
        return refuse(blocked.session);
      }
      writeLiveMarkers = true;
      liveRepoRoot = input.repoRoot;
    }
  }

  const authorizedBudget = resolveAuthorizedSolverBudget(input.solverBudget);
  if (!authorizedBudget.ok) {
    const blocked = applyPowTransition(
      session,
      {
        type: "block",
        terminal: "unauthorized",
        reason: authorizedBudget.reason,
      },
      clock,
    );
    if (!blocked.ok) throw new Error(blocked.message);
    return refuse(blocked.session);
  }

  const authorizedMargin = resolveAuthorizedExpiryMargin(input.expiryMarginMs);
  if (!authorizedMargin.ok) {
    const blocked = applyPowTransition(
      session,
      {
        type: "block",
        terminal: "unauthorized",
        reason: authorizedMargin.reason,
      },
      clock,
    );
    if (!blocked.ok) throw new Error(blocked.message);
    return refuse(blocked.session);
  }

  const networkLive = runMode === "approved-live";
  /** Injected transports (tests / fakes) cannot mint genuine L3 claims. */
  const injectedTransport = input.transport != null;
  const simulationOnlySession = !networkLive || injectedTransport;
  const parseMode: PowChallengeParseMode =
    input.challengeParseMode ??
    (networkLive && !injectedTransport ? "agent402-contract" : "compat");
  const expiryMarginMs = authorizedMargin.marginMs;
  const nowFn = input.now ?? (() => Date.now());
  // D7.3 hard gate: never default to live network transport without auth.
  const transport: PowTransport =
    input.transport ??
    (networkLive
      ? secureHttpsExchange
      : async () => {
          throw new Error(
            "offline-simulation requires an injected fake transport (no live DNS/HTTP)",
          );
        });

  // --- challenge ---
  let step = applyPowTransition(session, { type: "beginChallengeRequest" }, clock);
  if (!step.ok) throw new Error(step.message);
  session = step.session;

  // GET marker immediately before first authorized network op.
  if (writeLiveMarkers && liveRepoRoot != null) {
    writePowAttemptMarker({
      markerPath: absPowMarkerPath(liveRepoRoot, "challenge-get"),
      kind: "challenge-get",
      writtenAt: clock,
    });
  }

  const challengeResult = await fetchChallenge({
    transport,
    networkLive: networkLive && !injectedTransport,
    parseMode,
  });
  if (!challengeResult.ok) {
    step = applyPowTransition(
      session,
      {
        type: "failChallengeRequest",
        reason: challengeResult.reason,
        httpStatus: challengeResult.httpStatus,
        networkPerformed: challengeResult.networkPerformed,
      },
      clock,
    );
    if (!step.ok) throw new Error(step.message);
    return {
      session: step.session,
      requestBodySha256: bodySha,
      simulationOnly: simulationOnlySession,
      providerExecutionVerified: false,
      nonActions: POW_NON_ACTIONS,
    };
  }

  step = applyPowTransition(
    session,
    {
      type: "receiveChallenge",
      challenge: challengeResult.challenge,
      httpStatus: challengeResult.httpStatus,
      networkPerformed: challengeResult.networkPerformed,
    },
    clock,
  );
  if (!step.ok) throw new Error(step.message);
  session = step.session;

  // --- expiry before solve (contract always; compat when expiresAt present) ---
  const requireExpiresAt = parseMode === "agent402-contract";
  const expiryBeforeSolve = checkChallengeExpiry({
    expiresAtUnixSeconds: challengeResult.challenge.expiresAtUnixSeconds,
    nowMs: nowFn(),
    marginMs: expiryMarginMs,
    requireExpiresAt,
  });
  if (!expiryBeforeSolve.ok) {
    step = applyPowTransition(
      session,
      {
        type: "block",
        terminal: "challengeInvalid",
        reason: `${expiryBeforeSolve.reason}: ${expiryBeforeSolve.message}`,
      },
      clock,
    );
    if (!step.ok) throw new Error(step.message);
    return {
      session: step.session,
      requestBodySha256: bodySha,
      simulationOnly: simulationOnlySession,
      providerExecutionVerified: false,
      nonActions: POW_NON_ACTIONS,
    };
  }

  // --- solve ---
  step = applyPowTransition(session, { type: "beginSolve" }, clock);
  if (!step.ok) throw new Error(step.message);
  session = step.session;

  const solveInput: SolvePowInput = {
    challenge: challengeResult.challenge,
    budget: authorizedBudget.budget,
    signal: input.signal,
    now: nowFn,
  };
  const solved = await solvePowChallenge(solveInput);
  if (!solved.ok) {
    const terminal =
      solved.reason === "cancelled"
        ? "cancelled"
        : solved.reason === "budgetExhausted" ||
            solved.reason === "difficultyTooHard"
          ? "budgetExhausted"
          : "solveFailed";
    step = applyPowTransition(
      session,
      { type: "failSolve", terminal, reason: solved.message },
      clock,
    );
    if (!step.ok) throw new Error(step.message);
    return {
      session: step.session,
      requestBodySha256: bodySha,
      simulationOnly: simulationOnlySession,
      providerExecutionVerified: false,
      nonActions: POW_NON_ACTIONS,
    };
  }

  step = applyPowTransition(
    session,
    { type: "recordSolution", solution: solved.solution },
    clock,
  );
  if (!step.ok) throw new Error(step.message);
  session = step.session;

  // --- expiry before POST ---
  const expiryBeforePost = checkChallengeExpiry({
    expiresAtUnixSeconds: challengeResult.challenge.expiresAtUnixSeconds,
    nowMs: nowFn(),
    marginMs: expiryMarginMs,
    requireExpiresAt,
  });
  if (!expiryBeforePost.ok) {
    step = applyPowTransition(
      session,
      {
        type: "block",
        terminal: "challengeInvalid",
        reason: `${expiryBeforePost.reason}: ${expiryBeforePost.message}`,
      },
      clock,
    );
    if (!step.ok) throw new Error(step.message);
    return {
      session: step.session,
      requestBodySha256: bodySha,
      simulationOnly: simulationOnlySession,
      providerExecutionVerified: false,
      nonActions: POW_NON_ACTIONS,
    };
  }

  // --- submit ---
  step = applyPowTransition(session, { type: "beginSubmit" }, clock);
  if (!step.ok) throw new Error(step.message);
  session = step.session;

  // POST marker only after challenge/solver/expiry gates — immediately before POST.
  if (writeLiveMarkers && liveRepoRoot != null) {
    writePowAttemptMarker({
      markerPath: absPowMarkerPath(liveRepoRoot, "submit-post"),
      kind: "submit-post",
      writtenAt: clock,
    });
  }

  const submitted = await submitWithSolution({
    transport,
    headerValue: solved.solution.headerValue,
    networkLive: networkLive && !injectedTransport,
  });
  if (!submitted.ok) {
    step = applyPowTransition(
      session,
      {
        type: "failSubmit",
        terminal: "submitFailed",
        reason: submitted.reason,
        httpStatus: submitted.httpStatus,
        networkPerformed: submitted.networkPerformed,
      },
      clock,
    );
    if (!step.ok) throw new Error(step.message);
    return {
      session: step.session,
      requestBodySha256: bodySha,
      simulationOnly: simulationOnlySession,
      providerExecutionVerified: false,
      nonActions: POW_NON_ACTIONS,
    };
  }

  if (submitted.httpStatus < 200 || submitted.httpStatus >= 300) {
    step = applyPowTransition(
      session,
      {
        type: "failSubmit",
        terminal: "submitFailed",
        reason: `submit HTTP ${submitted.httpStatus}`,
        httpStatus: submitted.httpStatus,
        networkPerformed: submitted.networkPerformed,
      },
      clock,
    );
    if (!step.ok) throw new Error(step.message);
    return {
      session: step.session,
      requestBodySha256: bodySha,
      simulationOnly: simulationOnlySession,
      providerExecutionVerified: false,
      nonActions: POW_NON_ACTIONS,
    };
  }

  const envelopeParsed = parseValidateEnvelopeBytes(submitted.body);
  if (!envelopeParsed.ok || !matchesExpectedPowEnvelope(envelopeParsed.envelope)) {
    step = applyPowTransition(
      session,
      {
        type: "failSubmit",
        terminal: "responseInvalid",
        reason: envelopeParsed.ok
          ? `envelope mismatch; expected ${JSON.stringify(POW_EXPECTED_ENVELOPE)}`
          : envelopeParsed.message,
        httpStatus: submitted.httpStatus,
        networkPerformed: submitted.networkPerformed,
      },
      clock,
    );
    if (!step.ok) throw new Error(step.message);
    return {
      session: step.session,
      requestBodySha256: bodySha,
      simulationOnly: simulationOnlySession,
      providerExecutionVerified: false,
      nonActions: POW_NON_ACTIONS,
    };
  }

  // Genuine L3 only when approved-live uses the default secure HTTPS transport.
  const simulationOnly = simulationOnlySession;
  const providerExecutionVerified = networkLive && !simulationOnly;

  step = applyPowTransition(
    session,
    {
      type: "verifySubmit",
      httpStatus: submitted.httpStatus,
      envelope: envelopeParsed.envelope,
      networkPerformed: submitted.networkPerformed,
      providerExecutionVerified,
      simulationOnly,
    },
    clock,
  );
  if (!step.ok) throw new Error(step.message);

  return {
    session: step.session,
    requestBodySha256: bodySha,
    simulationOnly,
    providerExecutionVerified,
    nonActions: POW_NON_ACTIONS,
  };
}

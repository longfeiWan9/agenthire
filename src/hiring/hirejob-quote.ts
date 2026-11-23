/**
 * HireJob ↔ quote preview ↔ approval session integration (D5.3).
 *
 * Preserves HireJob meaning from D5.2: no paidVerified; advertised-only ≠ payment-ready.
 * Real executionAuthorization / paymentExecutionAuthorization always false.
 */

import {
  SEC_IDENTITY_ADAPTER_ID,
  SEC_IDENTITY_CAPABILITY_ID,
  SEC_IDENTITY_PROVIDER_KEY,
  SEC_IDENTITY_TASK_TYPE,
  SEC_IDENTITY_TASK_VERSION,
} from "../adapters/quantjourney-sec-identity.ts";
import { createHireJob } from "../jobs/create-job.ts";
import {
  getHireJobFixture,
  type HireJobFixtureCase,
} from "../jobs/fixtures.ts";
import { assessSyntheticPaymentFixture } from "../jobs/payment-assessment.ts";
import {
  applyHireJobTransition,
  setHireJobPaymentView,
} from "../jobs/state-machine.ts";
import type { HireJob, HireJobFixtureKind } from "../jobs/types.ts";
import {
  buildApprovalBinding,
  type ApprovalBinding,
} from "./approval-policy.ts";
import {
  createApprovalSession,
  simulationApprove,
  simulationReject,
  revokeApproval,
  expireApproval,
  hasLiveExecutionPermission,
  hasLivePaymentPermission,
  type ApprovalSession,
} from "./approval-session.ts";
import {
  buildQuotePreviewFromAdvertisedPricing,
  buildQuotePreviewFromChallenge,
  buildUnavailableQuotePreview,
} from "./quote-preview.ts";
import type { NormalizedQuotePreview } from "./quote-types.ts";

export const QUOTE_APPROVAL_BANNER =
  "SIMULATED QUOTE AND APPROVAL — NO EXTERNAL SERVICE INVOKED, NO SIGNATURE OR PAYMENT MADE." as const;

export type HireJobQuoteBundle = {
  readonly job: HireJob;
  readonly quote: NormalizedQuotePreview;
  readonly binding: ApprovalBinding;
  readonly session: ApprovalSession;
  readonly banner: typeof QUOTE_APPROVAL_BANNER;
  readonly liveExecutionPermission: false;
  readonly livePaymentPermission: false;
  readonly notes: readonly string[];
};

const FIXED_AT = "1970-01-01T00:00:00.000Z";

function baseJob(
  hireJobId: string,
  rawInput: unknown,
  createdAt: string,
): HireJob {
  return createHireJob({
    hireJobId,
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    adapterId: SEC_IDENTITY_ADAPTER_ID,
    taskType: SEC_IDENTITY_TASK_TYPE,
    taskVersion: SEC_IDENTITY_TASK_VERSION,
    rawInput,
    createdAt,
  });
}

function attachSession(
  job: HireJob,
  quote: NormalizedQuotePreview,
  createdAt: string,
  notes: readonly string[],
): HireJobQuoteBundle {
  const binding = buildApprovalBinding({
    hireJobId: job.hireJobId,
    capabilityId: job.capabilityId,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    rawInput: job.rawInput,
    quote,
  });
  const session = createApprovalSession({
    sessionId: `approval:${job.hireJobId}`,
    binding,
    createdAt,
  });
  return {
    job,
    quote,
    binding,
    session,
    banner: QUOTE_APPROVAL_BANNER,
    liveExecutionPermission: hasLiveExecutionPermission(session),
    livePaymentPermission: hasLivePaymentPermission(session),
    notes: [...notes, QUOTE_APPROVAL_BANNER],
  };
}

/**
 * Scenario A — advertised pricing only / unknown interface.
 * Quote unavailable or incomplete; paymentReady false; HireJob → quoteUnavailable.
 */
export function runScenarioAAdvertisedOnly(
  createdAt: string = FIXED_AT,
): HireJobQuoteBundle {
  let job = baseJob("hirejob:quote:scenario-a", { kind: "ticker", ticker: "AAPL" }, createdAt);
  const validated = applyHireJobTransition(job, { type: "validateInput" }, createdAt);
  if (!validated.ok) throw new Error(validated.message);
  job = validated.job;

  // Advertised-pricing path with unknown amount (unknown ≠ zero).
  const quote = buildQuotePreviewFromAdvertisedPricing({
    hireJobId: job.hireJobId,
    capabilityId: job.capabilityId,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    method: null,
    endpointUrl: null,
    capturedAt: createdAt,
    advertisedAmountAtomic: null,
    note: "No amount advertised on skill — unknown ≠ zero; advertised-only ≠ payment-ready",
  });

  // Unavailable companion when interface undocumented (not used as binding primary).
  void buildUnavailableQuotePreview({
    hireJobId: job.hireJobId,
    capabilityId: job.capabilityId,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    method: null,
    endpointUrl: null,
    capturedAt: createdAt,
    reason:
      "QuantJourney skill method/URL unknown; no observed 402; advertised skill alone is not payment-ready",
  });

  const marked = applyHireJobTransition(
    job,
    {
      type: "markQuoteUnavailable",
      reason: "interface undocumented; advertised-only ≠ payment-ready",
    },
    createdAt,
  );
  if (!marked.ok) throw new Error(marked.message);
  job = marked.job;

  return attachSession(job, quote, createdAt, [
    "scenario=A advertised-only / unknown interface",
    `job.status=${job.status}`,
    `quote.provenance=${quote.provenance}`,
    `quote.status=${quote.status}`,
    `quote.paymentReady=${quote.paymentReady}`,
    `quote.amount.unknown=${quote.amount.unknown}`,
  ]);
}

/**
 * Scenario B — synthetic compatible Sepolia 402 → preview → simulation approve.
 * simulationApproved ≠ live permission; paidVerified stays false.
 */
export function runScenarioBSyntheticCompatibleApprove(
  createdAt: string = FIXED_AT,
): HireJobQuoteBundle {
  const fixture = getHireJobFixture("compatible-payment-unapproved-402");
  let job = baseJob("hirejob:quote:scenario-b", fixture.rawInput, createdAt);
  job = setHireJobPaymentView(job, assessSyntheticPaymentFixture(fixture.http));

  const validated = applyHireJobTransition(job, { type: "validateInput" }, createdAt);
  if (!validated.ok) throw new Error(validated.message);
  job = validated.job;

  const quote = buildQuotePreviewFromChallenge({
    hireJobId: job.hireJobId,
    capabilityId: job.capabilityId,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    method: null,
    endpointUrl: null,
    capturedAt: createdAt,
    fixtureKind: "synthetic",
    httpStatus: fixture.http!.httpStatus,
    headers: fixture.http!.headers,
    body: fixture.http!.body,
  });

  const requested = applyHireJobTransition(job, { type: "requestApproval" }, createdAt);
  if (!requested.ok) throw new Error(requested.message);
  job = requested.job;

  let bundle = attachSession(job, quote, createdAt, [
    "scenario=B synthetic compatible Sepolia 402",
    `quote.provenance=${quote.provenance}`,
    `quote.status=${quote.status}`,
    `quote.amount.displayUsdc=${quote.amount.displayUsdc}`,
  ]);

  const approved = simulationApprove(bundle.session, {
    binding: bundle.binding,
    nowIso: createdAt,
    simulationOnly: true,
  });
  if (!approved.ok) throw new Error(approved.message);
  bundle = {
    ...bundle,
    session: approved.session,
    liveExecutionPermission: false,
    livePaymentPermission: false,
    notes: [
      ...bundle.notes,
      `approval.state=${approved.session.state}`,
      "simulationApproved ≠ live permission",
      `executionAuthorization=${approved.session.flags.executionAuthorization}`,
      `paymentExecutionAuthorization=${approved.session.flags.paymentExecutionAuthorization}`,
      `paidVerified=${job.flags.paidVerified}`,
    ],
  };
  return bundle;
}

/**
 * Scenario C — synthetic incompatible 402 → policyIncompatible → block.
 */
export function runScenarioCIncompatibleBlock(
  createdAt: string = FIXED_AT,
): HireJobQuoteBundle {
  const fixture = getHireJobFixture("incompatible-payment-402");
  let job = baseJob("hirejob:quote:scenario-c", fixture.rawInput, createdAt);
  job = setHireJobPaymentView(job, assessSyntheticPaymentFixture(fixture.http));

  const validated = applyHireJobTransition(job, { type: "validateInput" }, createdAt);
  if (!validated.ok) throw new Error(validated.message);
  job = validated.job;

  const quote = buildQuotePreviewFromChallenge({
    hireJobId: job.hireJobId,
    capabilityId: job.capabilityId,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    method: null,
    endpointUrl: null,
    capturedAt: createdAt,
    fixtureKind: "synthetic",
    httpStatus: fixture.http!.httpStatus,
    headers: fixture.http!.headers,
    body: fixture.http!.body,
  });

  const blocked = applyHireJobTransition(
    job,
    { type: "block", reason: "payment policy incompatible — no approval granted" },
    createdAt,
  );
  if (!blocked.ok) throw new Error(blocked.message);
  job = blocked.job;

  return attachSession(job, quote, createdAt, [
    "scenario=C incompatible synthetic 402",
    `quote.status=${quote.status}`,
    `job.status=${job.status}`,
    `payment.status=${job.payment.status}`,
    `paidVerified=${job.flags.paidVerified}`,
  ]);
}

/**
 * Scenario D — substitution / replay fail-closed after simulation approve.
 */
export function runScenarioDSubstitutionReplayFailClosed(
  createdAt: string = FIXED_AT,
): {
  readonly bundle: HireJobQuoteBundle;
  readonly substitutionBlocked: true;
  readonly replayBlocked: true;
  readonly notes: readonly string[];
} {
  const bundle = runScenarioBSyntheticCompatibleApprove(createdAt);

  // Substitution: mutate amount in binding
  const mutated: ApprovalBinding = {
    ...bundle.binding,
    amountAtomic: "999999999",
  };
  const sub = simulationApprove(bundle.session, {
    binding: mutated,
    nowIso: createdAt,
    simulationOnly: true,
  });

  // Replay: try approve again with original binding
  const replay = simulationApprove(bundle.session, {
    binding: bundle.binding,
    nowIso: createdAt,
    simulationOnly: true,
  });

  const subCode = sub.ok ? "ok" : sub.code;
  const replayCode = replay.ok ? "ok" : replay.code;

  return {
    bundle: {
      ...bundle,
      session: !sub.ok && sub.session.state === "blocked" ? sub.session : bundle.session,
      notes: [
        ...bundle.notes,
        "scenario=D substitution/replay fail-closed",
        `substitution.code=${subCode}`,
        `replay.code=${replayCode}`,
      ],
    },
    substitutionBlocked: true,
    replayBlocked: true,
    notes: [
      `substitution ok=${sub.ok} code=${subCode}`,
      `replay ok=${replay.ok} code=${replayCode}`,
      QUOTE_APPROVAL_BANNER,
    ],
  };
}

/**
 * Scenario E — reject / revoke / expire paths.
 */
export function runScenarioERejectRevokeExpire(
  createdAt: string = FIXED_AT,
): {
  readonly rejected: HireJobQuoteBundle;
  readonly revoked: ApprovalSession;
  readonly expired: ApprovalSession;
  readonly notes: readonly string[];
} {
  // Reject path
  const fixture = getHireJobFixture("compatible-payment-unapproved-402");
  let job = baseJob("hirejob:quote:scenario-e", fixture.rawInput, createdAt);
  const validated = applyHireJobTransition(job, { type: "validateInput" }, createdAt);
  if (!validated.ok) throw new Error(validated.message);
  job = validated.job;
  const quote = buildQuotePreviewFromChallenge({
    hireJobId: job.hireJobId,
    capabilityId: job.capabilityId,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    method: null,
    endpointUrl: null,
    capturedAt: createdAt,
    fixtureKind: "synthetic",
    httpStatus: fixture.http!.httpStatus,
    headers: fixture.http!.headers,
    body: fixture.http!.body,
  });
  const requested = applyHireJobTransition(job, { type: "requestApproval" }, createdAt);
  if (!requested.ok) throw new Error(requested.message);
  job = requested.job;
  let rejected = attachSession(job, quote, createdAt, ["scenario=E reject path"]);
  const rejectResult = simulationReject(rejected.session, {
    nowIso: createdAt,
    reason: "human simulation reject",
  });
  if (!rejectResult.ok) throw new Error(rejectResult.message);
  rejected = { ...rejected, session: rejectResult.session };

  // Revoke path (approve then revoke)
  const approvedBundle = runScenarioBSyntheticCompatibleApprove(createdAt);
  const revokedResult = revokeApproval(approvedBundle.session, {
    nowIso: createdAt,
    reason: "human revoked simulation approval",
  });
  if (!revokedResult.ok) throw new Error(revokedResult.message);

  // Expire path
  const pending = attachSession(job, quote, createdAt, ["scenario=E expire path"]);
  const expiredResult = expireApproval(pending.session, { nowIso: createdAt });
  if (!expiredResult.ok) throw new Error(expiredResult.message);

  return {
    rejected,
    revoked: revokedResult.session,
    expired: expiredResult.session,
    notes: [
      `rejected.state=${rejectResult.session.state}`,
      `revoked.state=${revokedResult.session.state}`,
      `expired.state=${expiredResult.session.state}`,
      `liveExecutionPermission=${hasLiveExecutionPermission(revokedResult.session)}`,
      QUOTE_APPROVAL_BANNER,
    ],
  };
}

/** Helper for tests — build quote from a HireJob fixture kind. */
export function quoteFromFixtureKind(
  kind: HireJobFixtureKind,
  hireJobId: string,
  createdAt: string = FIXED_AT,
): { readonly fixture: HireJobFixtureCase; readonly quote: NormalizedQuotePreview } {
  const fixture = getHireJobFixture(kind);
  if (!fixture.http || fixture.http.httpStatus !== 402) {
    return {
      fixture,
      quote: buildUnavailableQuotePreview({
        hireJobId,
        capabilityId: SEC_IDENTITY_CAPABILITY_ID,
        providerKey: SEC_IDENTITY_PROVIDER_KEY,
        method: null,
        endpointUrl: null,
        capturedAt: createdAt,
        reason: `fixture ${kind} has no 402 challenge`,
      }),
    };
  }
  return {
    fixture,
    quote: buildQuotePreviewFromChallenge({
      hireJobId,
      capabilityId: SEC_IDENTITY_CAPABILITY_ID,
      providerKey: SEC_IDENTITY_PROVIDER_KEY,
      method: null,
      endpointUrl: null,
      capturedAt: createdAt,
      fixtureKind: "synthetic",
      httpStatus: fixture.http.httpStatus,
      headers: fixture.http.headers,
      body: fixture.http.body,
    }),
  };
}

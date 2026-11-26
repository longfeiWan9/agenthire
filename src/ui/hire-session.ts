/**
 * Offline SEC hire console orchestration (D5.6).
 * Reuses adapters / jobs / hiring — no provider network.
 */

import {
  SEC_IDENTITY_ADAPTER_ID,
  SEC_IDENTITY_CAPABILITY_ID,
  SEC_IDENTITY_PROVIDER_KEY,
  SEC_IDENTITY_TASK_TYPE,
  SEC_IDENTITY_TASK_VERSION,
  validateSecCompanyIdentityInput,
  type SecCompanyIdentityDraftInput,
} from "../adapters/quantjourney-sec-identity.ts";
import { createHireJob } from "../jobs/create-job.ts";
import {
  getHireJobFixture,
  type HireJobFixtureCase,
} from "../jobs/fixtures.ts";
import { runOfflineHireJobFixture } from "../jobs/offline-fixture-runner.ts";
import {
  applyHireJobTransition,
} from "../jobs/state-machine.ts";
import type { HireJob, HireJobFixtureKind } from "../jobs/types.ts";
import {
  buildApprovalBinding,
  type ApprovalBinding,
} from "../hiring/approval-policy.ts";
import {
  createApprovalSession,
  simulationApprove,
  simulationReject,
  revokeApproval,
  hasLiveExecutionPermission,
  hasLivePaymentPermission,
  type ApprovalSession,
} from "../hiring/approval-session.ts";
import {
  buildQuotePreviewFromAdvertisedPricing,
  buildQuotePreviewFromChallenge,
  buildUnavailableQuotePreview,
} from "../hiring/quote-preview.ts";
import type { NormalizedQuotePreview } from "../hiring/quote-types.ts";
import {
  deriveExecutionLifecycle,
  type ExecutionLifecycleView,
} from "../marketplace/execution-lifecycle.ts";
import {
  formatSanitizedJson,
  sanitizeEvidencePayload,
  type SanitizedEvidenceView,
} from "./evidence-sanitizer.ts";
import { SIMULATION_RESULT_BANNER } from "./trust-labels.ts";

export type HireKind = "ticker" | "companyName";

export type HireSessionSnapshot = {
  readonly capabilityId: string;
  readonly supported: boolean;
  readonly blockReason: string | null;
  readonly input: SecCompanyIdentityDraftInput | null;
  readonly validationError: string | null;
  readonly job: HireJob | null;
  readonly liveQuote: NormalizedQuotePreview | null;
  readonly syntheticQuote: NormalizedQuotePreview | null;
  readonly syntheticQuoteRevealed: boolean;
  readonly binding: ApprovalBinding | null;
  readonly session: ApprovalSession | null;
  readonly fixtureResult: {
    readonly kind: HireJobFixtureKind;
    readonly job: HireJob;
    readonly banner: string;
    readonly ok: boolean;
    readonly notes: readonly string[];
  } | null;
  readonly banner: string | null;
  /** Latest user-visible action outcome (not buried in collapsed notes). */
  readonly actionFeedback: string | null;
  readonly notes: readonly string[];
  /** D8.1: typed lifecycle independent of evidence ladder. */
  readonly lifecycle: ExecutionLifecycleView;
  /** True when a sensitive input change cleared a prior approval. */
  readonly authorizationInvalidated: boolean;
  /** D8.1: sanitized evidence viewer payload (no secrets). */
  readonly evidenceView: SanitizedEvidenceView | null;
  readonly evidenceJson: string | null;
};

const FIXED_AT = "1970-01-01T00:00:00.000Z";

function approvalStateOf(
  session: ApprovalSession | null,
):
  | "none"
  | "notRequested"
  | "simulationApproved"
  | "simulationRejected"
  | "revoked"
  | "expired"
  | "blocked" {
  if (!session) return "none";
  return session.state;
}

function withLifecycle(
  snap: Omit<
    HireSessionSnapshot,
    "lifecycle" | "evidenceView" | "evidenceJson"
  > & {
    readonly lifecycle?: ExecutionLifecycleView;
    readonly evidenceView?: SanitizedEvidenceView | null;
    readonly evidenceJson?: string | null;
  },
): HireSessionSnapshot {
  const lifecycle = deriveExecutionLifecycle({
    supported: snap.supported,
    blockReason: snap.blockReason,
    hasInput: snap.input != null,
    hasJob: snap.job != null,
    quoteUnavailable: snap.job?.status === "quoteUnavailable",
    syntheticQuoteRevealed: snap.syntheticQuoteRevealed,
    approvalState: approvalStateOf(snap.session),
    authorizationInvalidated: snap.authorizationInvalidated,
    hasFixtureResult: snap.fixtureResult != null,
    fixtureOk: snap.fixtureResult?.ok ?? null,
    evidenceLadder: "L0",
  });

  let evidenceView = snap.evidenceView ?? null;
  let evidenceJson = snap.evidenceJson ?? null;
  if (snap.fixtureResult && evidenceView == null) {
    evidenceView = sanitizeEvidencePayload(
      snap.fixtureResult.job.result.payload,
      snap.fixtureResult.banner || SIMULATION_RESULT_BANNER,
    );
    evidenceJson = formatSanitizedJson(evidenceView);
  }

  return {
    ...snap,
    lifecycle,
    evidenceView,
    evidenceJson,
  };
}

function emptySnapshot(
  capabilityId: string,
  extras?: {
    readonly authorizationInvalidated?: boolean;
    readonly actionFeedback?: string | null;
    readonly notes?: readonly string[];
    readonly validationError?: string | null;
  },
): HireSessionSnapshot {
  const supported = capabilityId === SEC_IDENTITY_CAPABILITY_ID;
  const baseNotes = supported
    ? [
        "Offline fixture mode only",
        "Live quote unavailable — interface undocumented",
        "Payment unverified / unavailable",
      ]
    : ["Discoverable only — hiring not authorized"];
  return withLifecycle({
    capabilityId,
    supported,
    blockReason: supported
      ? null
      : "Live hire blocked — offline SEC demo is available only for cap:79da211975c2 (QuantJourney SEC Company Identity). No generic executor.",
    input: null,
    validationError: extras?.validationError ?? null,
    job: null,
    liveQuote: null,
    syntheticQuote: null,
    syntheticQuoteRevealed: false,
    binding: null,
    session: null,
    fixtureResult: null,
    banner: null,
    actionFeedback: extras?.actionFeedback ?? null,
    notes: extras?.notes ?? baseNotes,
    authorizationInvalidated: extras?.authorizationInvalidated ?? false,
  });
}

/** In-memory demo store (single Node process). */
const sessions = new Map<string, HireSessionSnapshot>();

export function resetHireSessionsForTests(): void {
  sessions.clear();
}

export function getOrCreateHireSession(
  capabilityId: string,
): HireSessionSnapshot {
  const existing = sessions.get(capabilityId);
  if (existing) return existing;
  const snap = emptySnapshot(capabilityId);
  sessions.set(capabilityId, snap);
  return snap;
}

function save(
  snap: Omit<
    HireSessionSnapshot,
    "lifecycle" | "evidenceView" | "evidenceJson"
  > &
    Partial<
      Pick<HireSessionSnapshot, "lifecycle" | "evidenceView" | "evidenceJson">
    >,
): HireSessionSnapshot {
  const next = withLifecycle(snap);
  sessions.set(next.capabilityId, next);
  return next;
}

export function configureHireInput(
  capabilityId: string,
  kind: HireKind,
  value: string,
): HireSessionSnapshot {
  const base = getOrCreateHireSession(capabilityId);
  if (!base.supported) return base;

  const raw: SecCompanyIdentityDraftInput =
    kind === "ticker"
      ? { kind: "ticker", ticker: value }
      : { kind: "companyName", companyName: value };

  const hadPriorApproval =
    base.session != null ||
    base.binding != null ||
    base.syntheticQuoteRevealed ||
    base.job != null;

  const validated = validateSecCompanyIdentityInput(raw);
  if (!validated.ok) {
    const msg = `${validated.code}: ${validated.message}`;
    return save(
      emptySnapshot(capabilityId, {
        authorizationInvalidated: hadPriorApproval,
        validationError: msg,
        actionFeedback: msg,
        notes: [
          "Offline fixture mode only",
          "Live quote unavailable — interface undocumented",
          "Payment unverified / unavailable",
          "input validation failed locally",
          ...(hadPriorApproval
            ? [
                "Prior HireJob / quote / approval state cleared after input change",
              ]
            : []),
        ],
      }),
    );
  }

  // Full reset: changing input must drop job/quote/approval and not keep
  // stale note lines like approval.state=simulationApproved.
  const cleared = emptySnapshot(capabilityId, {
    authorizationInvalidated: hadPriorApproval,
  });
  return save({
    ...cleared,
    input: validated.value,
    validationError: null,
    actionFeedback: hadPriorApproval
      ? `Input accepted (${kind}) — prior approval invalidated; Create HireJob enabled`
      : `Input accepted (${kind}) — Create HireJob enabled`,
    notes: [
      "Offline fixture mode only",
      "Live quote unavailable — interface undocumented",
      "Payment unverified / unavailable",
      `configured kind=${kind}`,
      "Prior HireJob / quote / approval state cleared after input change",
    ],
    authorizationInvalidated: hadPriorApproval,
  });
}

export function createValidatedHireJob(
  capabilityId: string,
): HireSessionSnapshot {
  const base = getOrCreateHireSession(capabilityId);
  if (!base.supported) return base;
  if (!base.input) {
    return save({
      ...base,
      validationError: "Configure ticker or companyName before creating a HireJob",
    });
  }

  let job = createHireJob({
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    adapterId: SEC_IDENTITY_ADAPTER_ID,
    taskType: SEC_IDENTITY_TASK_TYPE,
    taskVersion: SEC_IDENTITY_TASK_VERSION,
    rawInput: base.input,
    createdAt: FIXED_AT,
  });

  const validated = applyHireJobTransition(
    job,
    { type: "validateInput" },
    FIXED_AT,
  );
  if (!validated.ok) {
    return save({
      ...base,
      validationError: validated.message,
      job,
    });
  }
  job = validated.job;

  const liveQuote = buildUnavailableQuotePreview({
    hireJobId: job.hireJobId,
    capabilityId: job.capabilityId,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    method: null,
    endpointUrl: null,
    capturedAt: FIXED_AT,
    reason:
      "QuantJourney skill method/URL unknown; live quote unavailable; offline simulation only",
  });

  const marked = applyHireJobTransition(
    job,
    {
      type: "markQuoteUnavailable",
      reason: "interface undocumented; live quote unavailable",
    },
    FIXED_AT,
  );
  if (marked.ok) job = marked.job;

  return save({
    ...base,
    job,
    liveQuote,
    validationError: null,
    authorizationInvalidated: false,
    fixtureResult: null,
    banner: null,
    evidenceView: null,
    evidenceJson: null,
    actionFeedback:
      "HireJob created — live quote unavailable; simulation only",
    notes: [
      ...base.notes,
      `hireJobId=${job.hireJobId}`,
      `status=${job.status}`,
      "live quote unavailable",
    ],
  });
}

export function revealSyntheticQuote(
  capabilityId: string,
): HireSessionSnapshot {
  const base = getOrCreateHireSession(capabilityId);
  if (!base.supported || !base.job) return base;

  const fixture = getHireJobFixture("compatible-payment-unapproved-402");
  const quote = buildQuotePreviewFromChallenge({
    hireJobId: base.job.hireJobId,
    capabilityId: base.job.capabilityId,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    method: null,
    endpointUrl: null,
    capturedAt: FIXED_AT,
    fixtureKind: "synthetic",
    httpStatus: fixture.http!.httpStatus,
    headers: fixture.http!.headers,
    body: fixture.http!.body,
  });

  // Also keep an advertised-pricing companion for honesty (unknown ≠ zero).
  void buildQuotePreviewFromAdvertisedPricing({
    hireJobId: base.job.hireJobId,
    capabilityId: base.job.capabilityId,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    method: null,
    endpointUrl: null,
    capturedAt: FIXED_AT,
    advertisedAmountAtomic: null,
    note: "No amount advertised on skill — unknown ≠ zero",
  });

  const binding = buildApprovalBinding({
    hireJobId: base.job.hireJobId,
    capabilityId: base.job.capabilityId,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    rawInput: base.job.rawInput,
    quote,
  });

  let job = base.job;
  if (job.status === "quoteUnavailable" || job.status === "inputValidated") {
    const requested = applyHireJobTransition(
      job,
      { type: "requestApproval" },
      FIXED_AT,
    );
    if (requested.ok) job = requested.job;
  }

  const session = createApprovalSession({
    sessionId: `approval:${job.hireJobId}`,
    binding,
    createdAt: FIXED_AT,
  });

  return save({
    ...base,
    job,
    syntheticQuote: quote,
    syntheticQuoteRevealed: true,
    binding,
    session,
    actionFeedback:
      "SYNTHETIC quote revealed — not a live provider quote; paymentReady=false",
    notes: [
      ...base.notes,
      "SYNTHETIC quote revealed — not a live provider quote",
      `quote.status=${quote.status}`,
      `paymentReady=${quote.paymentReady}`,
      `liveExecutionPermission=${hasLiveExecutionPermission(session)}`,
      `livePaymentPermission=${hasLivePaymentPermission(session)}`,
    ],
  });
}

export function simulateApproveHire(
  capabilityId: string,
): HireSessionSnapshot {
  const base = getOrCreateHireSession(capabilityId);
  if (!base.session || !base.binding) return base;

  const result = simulationApprove(base.session, {
    binding: base.binding,
    nowIso: FIXED_AT,
    simulationOnly: true,
  });
  if (!result.ok) {
    return save({
      ...base,
      session: result.session,
      actionFeedback: `Simulation approve failed: ${result.code}`,
      notes: [...base.notes, `approve failed: ${result.code}`],
    });
  }
  return save({
    ...base,
    session: result.session,
    actionFeedback:
      "Simulation approved — executionAuthorization=false; paymentExecutionAuthorization=false",
    notes: [
      ...base.notes,
      `approval.state=${result.session.state}`,
      "simulationApproved ≠ live permission",
      `executionAuthorization=${result.session.flags.executionAuthorization}`,
      `paymentExecutionAuthorization=${result.session.flags.paymentExecutionAuthorization}`,
    ],
  });
}

export function simulateRejectHire(
  capabilityId: string,
): HireSessionSnapshot {
  const base = getOrCreateHireSession(capabilityId);
  if (!base.session) return base;
  const result = simulationReject(base.session, {
    nowIso: FIXED_AT,
    reason: "human simulation reject",
  });
  if (!result.ok) {
    return save({
      ...base,
      session: result.session,
      actionFeedback: `Simulation reject failed: ${result.code}`,
      notes: [...base.notes, `reject failed: ${result.code}`],
    });
  }
  return save({
    ...base,
    session: result.session,
    actionFeedback: `Simulation rejected — state=${result.session.state}`,
    notes: [...base.notes, `approval.state=${result.session.state}`],
  });
}

/** Fingerprint invalidation: mutate amount then attempt approve → fail-closed. */
export function attemptModifiedBindingApprove(
  capabilityId: string,
): HireSessionSnapshot {
  const base = getOrCreateHireSession(capabilityId);
  if (!base.session || !base.binding) return base;
  const mutated: ApprovalBinding = {
    ...base.binding,
    amountAtomic: "999999999",
  };
  const result = simulationApprove(base.session, {
    binding: mutated,
    nowIso: FIXED_AT,
    simulationOnly: true,
  });
  const feedback = result.ok
    ? "modified-binding approve ok=true (unexpected)"
    : `modified-binding approve ok=false; code=${result.code}`;
  return save({
    ...base,
    session: result.ok ? result.session : result.session,
    actionFeedback: feedback,
    notes: [
      ...base.notes,
      `modified-binding approve ok=${result.ok}`,
      result.ok ? "unexpected" : `code=${result.code}`,
    ],
  });
}

export function revokeHireApproval(
  capabilityId: string,
): HireSessionSnapshot {
  const base = getOrCreateHireSession(capabilityId);
  if (!base.session) return base;
  const result = revokeApproval(base.session, {
    nowIso: FIXED_AT,
    reason: "human revoked simulation approval",
  });
  if (!result.ok) {
    return save({
      ...base,
      session: result.session,
      actionFeedback: `Revoke failed: ${result.code}`,
      notes: [...base.notes, `revoke failed: ${result.code}`],
    });
  }
  return save({
    ...base,
    session: result.session,
    authorizationInvalidated: true,
    actionFeedback: `Approval revoked — state=${result.session.state}`,
    notes: [...base.notes, `approval.state=${result.session.state}`],
  });
}

export function runNamedOfflineFixture(
  capabilityId: string,
  kind: HireJobFixtureKind = "success-aapl",
): HireSessionSnapshot {
  const base = getOrCreateHireSession(capabilityId);
  if (!base.supported) return base;

  const run = runOfflineHireJobFixture(kind, FIXED_AT);
  // Inject a secret-like key into a copy for sanitizer coverage (never real secrets).
  const rawPayload = run.job.result.payload;
  const payloadWithTrap =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? { ...(rawPayload as Record<string, unknown>), apiKey: "trap-should-redact" }
      : rawPayload;
  const evidenceView = sanitizeEvidencePayload(
    payloadWithTrap,
    run.banner || SIMULATION_RESULT_BANNER,
  );
  return save({
    ...base,
    fixtureResult: {
      kind,
      job: run.job,
      banner: run.banner,
      ok: run.ok,
      notes: run.notes,
    },
    banner: SIMULATION_RESULT_BANNER,
    evidenceView,
    evidenceJson: formatSanitizedJson(evidenceView),
    authorizationInvalidated: false,
    actionFeedback: `Fixture ${kind} finished — providerExecutionVerified=false`,
    notes: [
      ...base.notes,
      SIMULATION_RESULT_BANNER,
      `fixture=${kind}`,
      `terminal=${run.job.status}`,
      "providerExecutionVerified=false",
      `secretsRedacted=${evidenceView.secretsRedacted}`,
    ],
  });
}

export function listOfflineFixtureKinds(): readonly HireJobFixtureKind[] {
  return [
    "success-aapl",
    "invalid-input-empty",
    "invalid-input-url",
    "provider-error-4xx",
    "provider-error-5xx",
    "incompatible-payment-402",
    "compatible-payment-unapproved-402",
  ];
}

export function describeFixture(kind: HireJobFixtureKind): HireJobFixtureCase {
  return getHireJobFixture(kind);
}

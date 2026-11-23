/**
 * Offline HireJob fixture runner (D5.2).
 *
 * Named deliberately — NOT executePaidTask / runLiveAgent.
 * Runs synthetic fixtures only; never presents results as provider returns.
 * executionMode: offlineFixtureOnly
 */

import {
  SEC_IDENTITY_ADAPTER_ID,
  SEC_IDENTITY_CAPABILITY_ID,
  SEC_IDENTITY_TASK_TYPE,
  SEC_IDENTITY_TASK_VERSION,
  validateSecCompanyIdentityOutput,
} from "../adapters/quantjourney-sec-identity.ts";
import { createHireJob } from "./create-job.ts";
import {
  getHireJobFixture,
  type HireJobFixtureCase,
  HIREJOB_FIXTURE_CASES,
} from "./fixtures.ts";
import { assessSyntheticPaymentFixture } from "./payment-assessment.ts";
import {
  applyHireJobTransition,
  setHireJobPaymentView,
} from "./state-machine.ts";
import type { HireJob, HireJobFixtureKind } from "./types.ts";

export const SIMULATION_BANNER =
  "SIMULATED RESULT — NOT RETURNED BY AN EXTERNAL PROVIDER; NO PAYMENT WAS MADE." as const;

export type OfflineFixtureRunResult = {
  readonly fixture: HireJobFixtureCase;
  readonly job: HireJob;
  readonly ok: boolean;
  readonly banner: typeof SIMULATION_BANNER;
  readonly notes: readonly string[];
};

function baseJob(fixture: HireJobFixtureCase, createdAt: string): HireJob {
  return createHireJob({
    hireJobId: `hirejob:fixture:${fixture.fixtureId}`,
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    adapterId: SEC_IDENTITY_ADAPTER_ID,
    taskType: SEC_IDENTITY_TASK_TYPE,
    taskVersion: SEC_IDENTITY_TASK_VERSION,
    rawInput: fixture.rawInput,
    createdAt,
  });
}

/**
 * Simulate one HireJob fixture end-to-end offline.
 * Does not contact providers, wallets, facilitators, or signers.
 */
export function runOfflineHireJobFixture(
  kind: HireJobFixtureKind,
  createdAt: string = new Date(0).toISOString(),
): OfflineFixtureRunResult {
  const fixture = getHireJobFixture(kind);
  const notes: string[] = [
    `fixtureKind=${fixture.fixtureKind}`,
    `expectedPath=${fixture.expectedPath}`,
    SIMULATION_BANNER,
  ];

  let job = baseJob(fixture, createdAt);
  const payment = assessSyntheticPaymentFixture(fixture.http);
  job = setHireJobPaymentView(job, payment);

  // 1) Always validate input first
  const validated = applyHireJobTransition(job, { type: "validateInput" }, createdAt);
  if (!validated.ok) {
    return {
      fixture,
      job,
      ok: false,
      banner: SIMULATION_BANNER,
      notes: [...notes, validated.message],
    };
  }
  job = validated.job;

  if (fixture.expectedPath === "inputRejected") {
    const ok = job.status === "simulatedFailed";
    return {
      fixture,
      job,
      ok,
      banner: SIMULATION_BANNER,
      notes: [
        ...notes,
        ok
          ? "input rejected locally before any network"
          : `expected simulatedFailed, got ${job.status}`,
      ],
    };
  }

  // Mid-path: mark quote unavailable when payment challenge present / interface unknown
  if (
    fixture.expectedPath === "paymentIncompatible" ||
    fixture.expectedPath === "paymentCompatibleUnapproved"
  ) {
    const quoted = applyHireJobTransition(
      job,
      {
        type: "markQuoteUnavailable",
        reason:
          fixture.expectedPath === "paymentIncompatible"
            ? "synthetic 402 structurally incompatible with Sepolia policy"
            : "synthetic 402 structurally compatible but paymentApprovalGranted=false; quote not payable",
      },
      createdAt,
    );
    if (!quoted.ok) {
      return { fixture, job, ok: false, banner: SIMULATION_BANNER, notes: [...notes, quoted.message] };
    }
    job = quoted.job;

    const blocked = applyHireJobTransition(
      job,
      {
        type: "block",
        reason:
          fixture.expectedPath === "paymentIncompatible"
            ? `payment status=${job.payment.status}; live payment unauthorized`
            : `payment status=${job.payment.status}; NO PAYMENT WAS MADE`,
      },
      createdAt,
    );
    if (!blocked.ok) {
      return { fixture, job, ok: false, banner: SIMULATION_BANNER, notes: [...notes, blocked.message] };
    }
    job = blocked.job;
    const ok =
      job.status === "blocked" &&
      job.payment.paymentApprovalGranted === false &&
      job.flags.paidVerified === false;
    return {
      fixture,
      job,
      ok,
      banner: SIMULATION_BANNER,
      notes: [...notes, `terminal=${job.status}`, `payment=${job.payment.status}`],
    };
  }

  // Quote unavailable due to unknown interface, then await approval for simulation only
  const quote = applyHireJobTransition(
    job,
    {
      type: "markQuoteUnavailable",
      reason:
        "Exact QuantJourney method/URL unknown — live quote unavailable; offline simulation only",
    },
    createdAt,
  );
  if (!quote.ok) {
    return { fixture, job, ok: false, banner: SIMULATION_BANNER, notes: [...notes, quote.message] };
  }
  job = quote.job;

  const awaiting = applyHireJobTransition(job, { type: "requestApproval" }, createdAt);
  if (!awaiting.ok) {
    return { fixture, job, ok: false, banner: SIMULATION_BANNER, notes: [...notes, awaiting.message] };
  }
  job = awaiting.job;

  if (fixture.expectedPath === "simulateProviderError") {
    const failed = applyHireJobTransition(
      job,
      {
        type: "simulateFailure",
        fixtureId: fixture.fixtureId,
        reason: `synthetic HTTP ${fixture.http?.httpStatus ?? "error"} — not a provider return`,
      },
      createdAt,
    );
    if (!failed.ok) {
      return { fixture, job, ok: false, banner: SIMULATION_BANNER, notes: [...notes, failed.message] };
    }
    job = failed.job;
    return {
      fixture,
      job,
      ok: job.status === "simulatedFailed",
      banner: SIMULATION_BANNER,
      notes: [...notes, `terminal=${job.status}`],
    };
  }

  // simulateSuccess path
  const body = fixture.http?.body ?? null;
  const outputCheck = validateSecCompanyIdentityOutput(body);
  if (!outputCheck.ok) {
    const failed = applyHireJobTransition(
      job,
      {
        type: "simulateFailure",
        fixtureId: fixture.fixtureId,
        reason: `synthetic output failed structural validation: ${outputCheck.code}`,
      },
      createdAt,
    );
    if (!failed.ok) {
      return { fixture, job, ok: false, banner: SIMULATION_BANNER, notes: [...notes, failed.message] };
    }
    return {
      fixture,
      job: failed.job,
      ok: false,
      banner: SIMULATION_BANNER,
      notes: [...notes, outputCheck.message],
    };
  }

  const success = applyHireJobTransition(
    job,
    {
      type: "simulateSuccess",
      fixtureId: fixture.fixtureId,
      result: outputCheck.value,
    },
    createdAt,
  );
  if (!success.ok) {
    return { fixture, job, ok: false, banner: SIMULATION_BANNER, notes: [...notes, success.message] };
  }
  job = success.job;

  const ok =
    job.status === "simulatedSucceeded" &&
    job.result.providerExecutionVerified === false &&
    job.result.outcomeKind === "simulatedFixture" &&
    job.flags.approvedForNetworkExecution === false &&
    job.flags.paidVerified === false;

  return {
    fixture,
    job,
    ok,
    banner: SIMULATION_BANNER,
    notes: [...notes, `terminal=${job.status}`, "providerExecutionVerified=false"],
  };
}

/** Run every synthetic fixture case offline. */
export function runAllOfflineHireJobFixtures(
  createdAt: string = new Date(0).toISOString(),
): readonly OfflineFixtureRunResult[] {
  return HIREJOB_FIXTURE_CASES.map((c) =>
    runOfflineHireJobFixture(c.kind, createdAt),
  );
}

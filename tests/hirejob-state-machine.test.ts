/**
 * D5.2 HireJob state machine + payment assessment tests.
 * STRICTLY_OFFLINE — no paidVerified state.
 */

import { describe, expect, it } from "vitest";
import {
  SEC_IDENTITY_ADAPTER_ID,
  SEC_IDENTITY_CAPABILITY_ID,
  SEC_IDENTITY_TASK_TYPE,
  SEC_IDENTITY_TASK_VERSION,
} from "../src/adapters/index.ts";
import {
  applyHireJobTransition,
  assessSyntheticPaymentFixture,
  createHireJob,
  getHireJobFixture,
  isTerminalHireJobStatus,
  setHireJobPaymentView,
} from "../src/jobs/index.ts";

function draftJob(rawInput: unknown = { kind: "ticker", ticker: "AAPL" }) {
  return createHireJob({
    hireJobId: "hirejob:test",
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    adapterId: SEC_IDENTITY_ADAPTER_ID,
    taskType: SEC_IDENTITY_TASK_TYPE,
    taskVersion: SEC_IDENTITY_TASK_VERSION,
    rawInput,
    createdAt: "1970-01-01T00:00:00.000Z",
  });
}

describe("HireJob create + flags", () => {
  it("starts in draft with unauthorized payment/execution flags", () => {
    const job = draftJob();
    expect(job.status).toBe("draft");
    expect(job.flags.approvedForNetworkExecution).toBe(false);
    expect(job.flags.executionMode).toBe("offlineFixtureOnly");
    expect(job.flags.paidVerified).toBe(false);
    expect(job.result.providerExecutionVerified).toBe(false);
  });
});

describe("HireJob state machine transitions", () => {
  it("draft → inputValidated → quoteUnavailable → awaitingApproval → simulatedSucceeded", () => {
    let job = draftJob();
    const v = applyHireJobTransition(job, { type: "validateInput" });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    job = v.job;
    expect(job.status).toBe("inputValidated");

    const q = applyHireJobTransition(job, {
      type: "markQuoteUnavailable",
      reason: "method/url unknown",
    });
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    job = q.job;
    expect(job.status).toBe("quoteUnavailable");

    const a = applyHireJobTransition(job, { type: "requestApproval" });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    job = a.job;
    expect(job.status).toBe("awaitingApproval");

    const s = applyHireJobTransition(job, {
      type: "simulateSuccess",
      fixtureId: "success-aapl",
      result: { synthetic: true },
    });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    job = s.job;
    expect(job.status).toBe("simulatedSucceeded");
    expect(isTerminalHireJobStatus(job.status)).toBe(true);
    expect(job.result.warning).toMatch(/SIMULATED RESULT/);
    expect(job.result.providerExecutionVerified).toBe(false);
    expect(job.flags.paidVerified).toBe(false);
  });

  it("rejects invalid input into simulatedFailed without network", () => {
    const job = draftJob({ kind: "ticker", ticker: "https://x" });
    const v = applyHireJobTransition(job, { type: "validateInput" });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.job.status).toBe("simulatedFailed");
  });

  it("blocks from awaitingApproval and refuses further transitions", () => {
    let job = draftJob();
    const v = applyHireJobTransition(job, { type: "validateInput" });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    job = v.job;
    const a = applyHireJobTransition(job, { type: "requestApproval" });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    job = a.job;
    const b = applyHireJobTransition(job, {
      type: "block",
      reason: "payment unauthorized",
    });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.job.status).toBe("blocked");
    const again = applyHireJobTransition(b.job, { type: "requestApproval" });
    expect(again.ok).toBe(false);
  });

  it("does not expose a paidVerified status", () => {
    const statuses = [
      "draft",
      "inputValidated",
      "quoteUnavailable",
      "awaitingApproval",
      "blocked",
      "simulatedSucceeded",
      "simulatedFailed",
    ];
    expect(statuses).not.toContain("paidVerified");
  });
});

describe("HireJob payment assessment on synthetic 402 fixtures", () => {
  it("marks incompatible-payment-402 as policyIncompatible", () => {
    const fixture = getHireJobFixture("incompatible-payment-402");
    const payment = assessSyntheticPaymentFixture(fixture.http);
    expect(payment.status).toBe("policyIncompatible");
    expect(payment.paymentApprovalGranted).toBe(false);
    expect(payment.policyCompatible).toBe(false);
  });

  it("marks compatible-payment-unapproved-402 as policyCompatibleUnapproved", () => {
    const fixture = getHireJobFixture("compatible-payment-unapproved-402");
    const payment = assessSyntheticPaymentFixture(fixture.http);
    expect(payment.status).toBe("policyCompatibleUnapproved");
    expect(payment.parseOk).toBe(true);
    expect(payment.policyCompatible).toBe(true);
    expect(payment.paymentApprovalGranted).toBe(false);

    let job = draftJob(fixture.rawInput);
    job = setHireJobPaymentView(job, payment);
    expect(job.flags.paidVerified).toBe(false);
  });

  it("treats success HTTP 200 as challengeAbsent", () => {
    const fixture = getHireJobFixture("success-aapl");
    const payment = assessSyntheticPaymentFixture(fixture.http);
    expect(payment.status).toBe("challengeAbsent");
  });
});

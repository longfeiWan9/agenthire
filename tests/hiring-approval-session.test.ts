/**
 * D5.3 approval session tests — simulationApproved ≠ live permission.
 */

import { describe, expect, it } from "vitest";
import { buildApprovalBinding } from "../src/hiring/approval-policy.ts";
import {
  assertBindingUnchanged,
  createApprovalSession,
  expireApproval,
  hasLiveExecutionPermission,
  hasLivePaymentPermission,
  revokeApproval,
  simulationApprove,
  simulationReject,
} from "../src/hiring/approval-session.ts";
import { buildQuotePreviewFromChallenge } from "../src/hiring/quote-preview.ts";
import { getHireJobFixture } from "../src/jobs/fixtures.ts";

function makeSession() {
  const fixture = getHireJobFixture("compatible-payment-unapproved-402");
  const quote = buildQuotePreviewFromChallenge({
    hireJobId: "hirejob:sess",
    capabilityId: "cap:79da211975c2",
    providerKey: "skill-provider:QuantJourney",
    method: null,
    endpointUrl: null,
    capturedAt: "1970-01-01T00:00:00.000Z",
    fixtureKind: "synthetic",
    httpStatus: fixture.http!.httpStatus,
    headers: fixture.http!.headers,
    body: fixture.http!.body,
  });
  const binding = buildApprovalBinding({
    hireJobId: "hirejob:sess",
    capabilityId: "cap:79da211975c2",
    providerKey: "skill-provider:QuantJourney",
    rawInput: { kind: "ticker", ticker: "AAPL" },
    quote,
  });
  const session = createApprovalSession({
    sessionId: "approval:sess",
    binding,
    createdAt: "1970-01-01T00:00:00.000Z",
  });
  return { session, binding, quote };
}

describe("approval session", () => {
  it("starts notRequested with unauthorized flags", () => {
    const { session } = makeSession();
    expect(session.state).toBe("notRequested");
    expect(session.flags.executionAuthorization).toBe(false);
    expect(session.flags.paymentExecutionAuthorization).toBe(false);
    expect(session.flags.simulationOnly).toBe(true);
    expect(hasLiveExecutionPermission(session)).toBe(false);
    expect(hasLivePaymentPermission(session)).toBe(false);
  });

  it("simulationApprove does not grant live permission", () => {
    const { session, binding } = makeSession();
    const result = simulationApprove(session, {
      binding,
      nowIso: "1970-01-01T00:00:00.000Z",
      simulationOnly: true,
    });
    expect(result.ok).toBe(true);
    expect(result.session.state).toBe("simulationApproved");
    expect(result.session.flags.executionAuthorization).toBe(false);
    expect(result.session.flags.paymentExecutionAuthorization).toBe(false);
    expect(hasLiveExecutionPermission(result.session)).toBe(false);
    expect(hasLivePaymentPermission(result.session)).toBe(false);
  });

  it("fail-closes substitution and replay", () => {
    const { session, binding } = makeSession();
    const approved = simulationApprove(session, {
      binding,
      nowIso: "1970-01-01T00:00:00.000Z",
    });
    expect(approved.ok).toBe(true);

    const sub = simulationApprove(approved.session, {
      binding: { ...binding, amountAtomic: "999" },
      nowIso: "1970-01-01T00:00:00.000Z",
    });
    expect(sub.ok).toBe(false);
    if (sub.ok) throw new Error("expected substitution failure");
    expect(sub.code).toBe("substitutionDetected");
    expect(sub.session.state).toBe("blocked");

    const replay = simulationApprove(approved.session, {
      binding,
      nowIso: "1970-01-01T00:00:00.000Z",
    });
    expect(replay.ok).toBe(false);
    if (replay.ok) throw new Error("expected replay failure");
    expect(replay.code).toBe("replayDetected");
  });

  it("supports reject, revoke, expire", () => {
    const rejectBase = makeSession();
    const rejected = simulationReject(rejectBase.session, {
      nowIso: "1970-01-01T00:00:00.000Z",
      reason: "no",
    });
    expect(rejected.ok).toBe(true);
    expect(rejected.session.state).toBe("simulationRejected");

    const approveBase = makeSession();
    const ok = simulationApprove(approveBase.session, {
      binding: approveBase.binding,
      nowIso: "1970-01-01T00:00:00.000Z",
    });
    expect(ok.ok).toBe(true);
    const revoked = revokeApproval(ok.session, {
      nowIso: "1970-01-01T00:00:00.000Z",
      reason: "revoke",
    });
    expect(revoked.ok).toBe(true);
    expect(revoked.session.state).toBe("revoked");

    const pending = makeSession();
    const expired = expireApproval(pending.session, {
      nowIso: "1970-01-01T00:00:00.000Z",
    });
    expect(expired.ok).toBe(true);
    expect(expired.session.state).toBe("expired");
  });

  it("assertBindingUnchanged detects substitution", () => {
    const { session, binding } = makeSession();
    const ok = assertBindingUnchanged(session, binding);
    expect(ok.ok).toBe(true);
    const bad = assertBindingUnchanged(session, {
      ...binding,
      network: "eip155:8453",
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("expected substitution failure");
    expect(bad.code).toBe("substitutionDetected");
    expect(bad.session.state).toBe("blocked");
  });

  it("refuses non-simulationOnly approve", () => {
    const { session, binding } = makeSession();
    const result = simulationApprove(session, {
      binding,
      nowIso: "1970-01-01T00:00:00.000Z",
      simulationOnly: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected liveApprovalForbidden");
    expect(result.code).toBe("liveApprovalForbidden");
  });
});

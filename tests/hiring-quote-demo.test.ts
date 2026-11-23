/**
 * D5.3 offline quote/approval demo + HireJob integration + discovery plan.
 */

import { describe, expect, it } from "vitest";
import {
  buildQuantJourneyInterfaceDiscoveryPlan,
  QUOTE_APPROVAL_BANNER,
  runScenarioAAdvertisedOnly,
  runScenarioBSyntheticCompatibleApprove,
  runScenarioCIncompatibleBlock,
  runScenarioDSubstitutionReplayFailClosed,
  runScenarioERejectRevokeExpire,
} from "../src/hiring/index.ts";
import {
  formatDemoHireJobQuoteOffline,
  runDemoHireJobQuoteOffline,
} from "../src/scripts/demo-hirejob-quote-offline.ts";

describe("QuantJourney interface-discovery plan", () => {
  it("returns empty proposals when no source-declared OpenAPI/skill URL exists", () => {
    const plan = buildQuantJourneyInterfaceDiscoveryPlan();
    expect(plan.proposals).toEqual([]);
    expect(plan.proposals.length).toBe(0);
    expect(plan.maxProposals).toBe(2);
    expect(plan.fetchPerformed).toBe(false);
    expect(plan.approvedForNetworkExecution).toBe(false);
    expect(plan.agentCardEvidenceId).toBe("DISC-004");
  });
});

describe("HireJob quote scenarios A–E", () => {
  it("A: advertised-only ≠ payment-ready; unknown amount", () => {
    const a = runScenarioAAdvertisedOnly();
    expect(a.quote.provenance).toBe("advertisedPricing");
    expect(a.quote.paymentReady).toBe(false);
    expect(a.quote.amount.unknown).toBe(true);
    expect(a.job.status).toBe("quoteUnavailable");
    expect(a.job.flags.paidVerified).toBe(false);
    expect(a.banner).toBe(QUOTE_APPROVAL_BANNER);
  });

  it("B: synthetic approve stays unauthorized for live exec/payment", () => {
    const b = runScenarioBSyntheticCompatibleApprove();
    expect(b.quote.provenance).toBe("syntheticFixture");
    expect(b.quote.status).toBe("policyCompatibleUnapproved");
    expect(b.session.state).toBe("simulationApproved");
    expect(b.session.flags.executionAuthorization).toBe(false);
    expect(b.session.flags.paymentExecutionAuthorization).toBe(false);
    expect(b.liveExecutionPermission).toBe(false);
    expect(b.livePaymentPermission).toBe(false);
    expect(b.job.flags.paidVerified).toBe(false);
  });

  it("C: incompatible challenge blocks without paidVerified", () => {
    const c = runScenarioCIncompatibleBlock();
    expect(c.quote.status).toBe("policyIncompatible");
    expect(c.job.status).toBe("blocked");
    expect(c.job.flags.paidVerified).toBe(false);
  });

  it("D: substitution and replay fail closed", () => {
    const d = runScenarioDSubstitutionReplayFailClosed();
    expect(d.substitutionBlocked).toBe(true);
    expect(d.replayBlocked).toBe(true);
    expect(d.notes.some((n) => n.includes("substitution ok=false"))).toBe(true);
    expect(d.notes.some((n) => n.includes("replay ok=false"))).toBe(true);
  });

  it("E: reject / revoke / expire", () => {
    const e = runScenarioERejectRevokeExpire();
    expect(e.rejected.session.state).toBe("simulationRejected");
    expect(e.revoked.state).toBe("revoked");
    expect(e.expired.state).toBe("expired");
  });
});

describe("demo:hirejob:quote:offline", () => {
  it("passes all scenarios with banner and empty proposals", () => {
    const report = runDemoHireJobQuoteOffline();
    expect(report.ok).toBe(true);
    expect(report.scenariosPassed).toBe(5);
    expect(report.scenariosFailed).toBe(0);
    expect(report.proposalCount).toBe(0);
    expect(report.banner).toBe(QUOTE_APPROVAL_BANNER);
    const text = formatDemoHireJobQuoteOffline(report);
    expect(text).toContain(QUOTE_APPROVAL_BANNER);
    expect(text).toContain("Demo OK");
  });

  it("is deterministic across two runs", () => {
    const a = runDemoHireJobQuoteOffline();
    const b = runDemoHireJobQuoteOffline();
    expect(a.determinismKey).toBe(b.determinismKey);
    expect(formatDemoHireJobQuoteOffline(a)).toBe(formatDemoHireJobQuoteOffline(b));
  });
});

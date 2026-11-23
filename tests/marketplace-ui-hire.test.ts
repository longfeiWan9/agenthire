/**
 * D5.6 hire console offline vertical slice — STRICTLY_OFFLINE.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { SEC_IDENTITY_CAPABILITY_ID } from "../src/adapters/quantjourney-sec-identity.ts";
import {
  configureHireInput,
  createValidatedHireJob,
  getOrCreateHireSession,
  resetHireSessionsForTests,
  revealSyntheticQuote,
  runNamedOfflineFixture,
  simulateApproveHire,
  simulateRejectHire,
} from "../src/ui/hire-session.ts";
import { SIMULATION_RESULT_BANNER } from "../src/ui/trust-labels.ts";

describe("D5.6 UI hire console", () => {
  beforeEach(() => {
    resetHireSessionsForTests();
  });

  it("blocks unsupported capabilities", () => {
    const snap = getOrCreateHireSession("cap:not-sec");
    expect(snap.supported).toBe(false);
    expect(snap.blockReason).toMatch(/Live hire blocked/);
  });

  it("validates ticker input and rejects invalid", () => {
    const bad = configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "   ");
    expect(bad.validationError).toBeTruthy();
    expect(bad.input).toBeNull();

    const good = configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    expect(good.validationError).toBeNull();
    expect(good.input).toEqual({ kind: "ticker", ticker: "AAPL" });
  });

  it("creates HireJob after valid configure", () => {
    configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    const snap = createValidatedHireJob(SEC_IDENTITY_CAPABILITY_ID);
    expect(snap.job).not.toBeNull();
    expect(snap.job!.status).toBe("quoteUnavailable");
    expect(snap.liveQuote?.status).toBe("unavailable");
    expect(snap.liveQuote?.paymentReady).toBe(false);
  });

  it("runs success fixture with mandatory banner", () => {
    const snap = runNamedOfflineFixture(SEC_IDENTITY_CAPABILITY_ID, "success-aapl");
    expect(snap.banner).toBe(SIMULATION_RESULT_BANNER);
    expect(snap.fixtureResult?.ok).toBe(true);
    expect(snap.fixtureResult?.job.result.providerExecutionVerified).toBe(false);
    expect(snap.fixtureResult?.job.flags.paidVerified).toBe(false);
  });

  it("rejects URL-shaped companyName via fixture path", () => {
    const snap = runNamedOfflineFixture(
      SEC_IDENTITY_CAPABILITY_ID,
      "invalid-input-url",
    );
    expect(snap.fixtureResult?.ok).toBe(true);
    expect(snap.fixtureResult?.job.status).toBe("simulatedFailed");
    expect(snap.banner).toBe(SIMULATION_RESULT_BANNER);
  });

  it("synthetic quote + sim approve never grants live payment", () => {
    configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    createValidatedHireJob(SEC_IDENTITY_CAPABILITY_ID);
    const quoted = revealSyntheticQuote(SEC_IDENTITY_CAPABILITY_ID);
    expect(quoted.syntheticQuoteRevealed).toBe(true);
    expect(quoted.syntheticQuote?.paymentReady).toBe(false);

    const approved = simulateApproveHire(SEC_IDENTITY_CAPABILITY_ID);
    expect(approved.session?.state).toBe("simulationApproved");
    expect(approved.session?.flags.executionAuthorization).toBe(false);
    expect(approved.session?.flags.paymentExecutionAuthorization).toBe(false);

    const rejected = (() => {
      resetHireSessionsForTests();
      configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
      createValidatedHireJob(SEC_IDENTITY_CAPABILITY_ID);
      revealSyntheticQuote(SEC_IDENTITY_CAPABILITY_ID);
      return simulateRejectHire(SEC_IDENTITY_CAPABILITY_ID);
    })();
    expect(rejected.session?.state).toBe("simulationRejected");
  });
});

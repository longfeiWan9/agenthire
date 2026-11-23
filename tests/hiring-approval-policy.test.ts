/**
 * D5.3 manual approval policy / fingerprint tests.
 */

import { describe, expect, it } from "vitest";
import {
  ALWAYS_UNAUTHORIZED,
  buildApprovalBinding,
  canonicalSerialize,
  digestInput,
  evaluateApprovalEligibility,
  fingerprintBinding,
  fingerprintOffer,
} from "../src/hiring/approval-policy.ts";
import { buildQuotePreviewFromChallenge } from "../src/hiring/quote-preview.ts";
import { getHireJobFixture } from "../src/jobs/fixtures.ts";

function sampleQuote() {
  const fixture = getHireJobFixture("compatible-payment-unapproved-402");
  return buildQuotePreviewFromChallenge({
    hireJobId: "hirejob:pol",
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
}

describe("canonicalSerialize + fingerprint", () => {
  it("is key-order independent", () => {
    const a = canonicalSerialize({ b: 1, a: 2 });
    const b = canonicalSerialize({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("binds job/capability/provider/input/offer fields", () => {
    const quote = sampleQuote();
    const binding = buildApprovalBinding({
      hireJobId: "hirejob:pol",
      capabilityId: "cap:79da211975c2",
      providerKey: "skill-provider:QuantJourney",
      rawInput: { kind: "ticker", ticker: "AAPL" },
      quote,
    });
    expect(binding.inputDigest).toBe(
      digestInput({ kind: "ticker", ticker: "AAPL" }),
    );
    expect(binding.offerFingerprint).toBe(fingerprintOffer(quote));
    expect(binding.amountAtomic).toBe("25000");
    expect(binding.method).toBeNull();
    expect(binding.endpointUrl).toBeNull();
    expect(binding.policyVersion).toBe(quote.policyVersion);

    const fp = fingerprintBinding(binding);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
    expect(fp).toBe(fingerprintBinding({ ...binding }));
  });

  it("changes fingerprint when amount is substituted", () => {
    const quote = sampleQuote();
    const binding = buildApprovalBinding({
      hireJobId: "hirejob:pol",
      capabilityId: "cap:79da211975c2",
      providerKey: "skill-provider:QuantJourney",
      rawInput: { kind: "ticker", ticker: "AAPL" },
      quote,
    });
    const mutated = { ...binding, amountAtomic: "1" };
    expect(fingerprintBinding(mutated)).not.toBe(fingerprintBinding(binding));
  });
});

describe("evaluateApprovalEligibility", () => {
  it("requires simulationOnly and matching fingerprint", () => {
    const quote = sampleQuote();
    const binding = buildApprovalBinding({
      hireJobId: "hirejob:pol",
      capabilityId: "cap:79da211975c2",
      providerKey: "skill-provider:QuantJourney",
      rawInput: { kind: "ticker", ticker: "AAPL" },
      quote,
    });
    const fp = fingerprintBinding(binding);

    expect(
      evaluateApprovalEligibility({
        binding,
        expectedFingerprint: fp,
        state: "notRequested",
        nowIso: "1970-01-01T00:00:00.000Z",
        simulationOnly: true,
      }).ok,
    ).toBe(true);

    expect(
      evaluateApprovalEligibility({
        binding,
        expectedFingerprint: fp,
        state: "notRequested",
        nowIso: "1970-01-01T00:00:00.000Z",
        simulationOnly: false,
      }),
    ).toMatchObject({ ok: false, code: "liveApprovalForbidden" });

    expect(
      evaluateApprovalEligibility({
        binding: { ...binding, recipient: "0x0000000000000000000000000000000000000001" },
        expectedFingerprint: fp,
        state: "notRequested",
        nowIso: "1970-01-01T00:00:00.000Z",
        simulationOnly: true,
      }),
    ).toMatchObject({ ok: false, code: "substitutionDetected" });
  });

  it("fail-closes on replay and revocation states", () => {
    const quote = sampleQuote();
    const binding = buildApprovalBinding({
      hireJobId: "hirejob:pol",
      capabilityId: "cap:79da211975c2",
      providerKey: "skill-provider:QuantJourney",
      rawInput: { kind: "ticker", ticker: "AAPL" },
      quote,
    });
    const fp = fingerprintBinding(binding);

    expect(
      evaluateApprovalEligibility({
        binding,
        expectedFingerprint: fp,
        state: "simulationApproved",
        nowIso: "1970-01-01T00:00:00.000Z",
        simulationOnly: true,
      }),
    ).toMatchObject({ ok: false, code: "replayDetected" });

    expect(
      evaluateApprovalEligibility({
        binding,
        expectedFingerprint: fp,
        state: "revoked",
        nowIso: "1970-01-01T00:00:00.000Z",
        simulationOnly: true,
      }),
    ).toMatchObject({ ok: false, code: "stateNotApprovable" });
  });

  it("keeps authorization flags permanently false", () => {
    expect(ALWAYS_UNAUTHORIZED.executionAuthorization).toBe(false);
    expect(ALWAYS_UNAUTHORIZED.paymentExecutionAuthorization).toBe(false);
    expect(ALWAYS_UNAUTHORIZED.simulationOnly).toBe(true);
  });
});

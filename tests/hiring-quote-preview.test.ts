/**
 * D5.3 hiring quote preview tests.
 * STRICTLY_OFFLINE — provenance classes never interchangeable; unknown ≠ zero.
 */

import { describe, expect, it } from "vitest";
import {
  buildQuoteAmountView,
  buildQuotePreviewFromAdvertisedPricing,
  buildQuotePreviewFromChallenge,
  buildUnavailableQuotePreview,
  CONTROLLED_PAYMENT_POLICY,
  formatUsdcDisplay6,
} from "../src/hiring/quote-preview.ts";
import { getHireJobFixture } from "../src/jobs/fixtures.ts";
import {
  APPROVED_PAYMENT_NETWORK,
  APPROVED_SEPOLIA_TEST_USDC,
} from "../src/x402/challenge-types.ts";

describe("formatUsdcDisplay6", () => {
  it("formats integer-safe atomic amounts with 6 decimals", () => {
    expect(formatUsdcDisplay6("25000")).toBe("0.025000");
    expect(formatUsdcDisplay6("0")).toBe("0.000000");
    expect(formatUsdcDisplay6("1000000")).toBe("1.000000");
    expect(formatUsdcDisplay6("9007199254740993")).toBe("9007199254.740993");
  });

  it("rejects non-integer strings", () => {
    expect(formatUsdcDisplay6("")).toBeNull();
    expect(formatUsdcDisplay6("1.5")).toBeNull();
    expect(formatUsdcDisplay6("-1")).toBeNull();
  });
});

describe("buildQuoteAmountView", () => {
  it("treats unknown amount as unknown ≠ zero", () => {
    const v = buildQuoteAmountView({ atomicAmount: null, asset: null });
    expect(v.unknown).toBe(true);
    expect(v.atomicAmount).toBeNull();
    expect(v.displayUsdc).toBeNull();
    expect(v.decimalsConfirmed).toBe(false);
  });

  it("confirms USDC display only when asset matches approved Sepolia USDC", () => {
    const ok = buildQuoteAmountView({
      atomicAmount: "25000",
      asset: APPROVED_SEPOLIA_TEST_USDC,
    });
    expect(ok.decimalsConfirmed).toBe(true);
    expect(ok.displayUsdc).toBe("0.025000");

    const other = buildQuoteAmountView({
      atomicAmount: "25000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    });
    expect(other.decimalsConfirmed).toBe(false);
    expect(other.displayUsdc).toBeNull();
    expect(other.atomicAmount).toBe("25000");
  });
});

describe("quote provenance separation", () => {
  it("advertisedPricing never becomes observedChallenge or syntheticFixture", () => {
    const q = buildQuotePreviewFromAdvertisedPricing({
      hireJobId: "hirejob:t",
      capabilityId: "cap:79da211975c2",
      providerKey: "skill-provider:QuantJourney",
      method: null,
      endpointUrl: null,
      capturedAt: "1970-01-01T00:00:00.000Z",
      advertisedAmountAtomic: null,
    });
    expect(q.provenance).toBe("advertisedPricing");
    expect(q.paymentReady).toBe(false);
    expect(q.executionAuthorization).toBe(false);
    expect(q.paymentExecutionAuthorization).toBe(false);
    expect(q.amount.unknown).toBe(true);
    expect(q.status).toBe("incomplete");
  });

  it("synthetic 402 fixture uses syntheticFixture provenance", () => {
    const fixture = getHireJobFixture("compatible-payment-unapproved-402");
    const q = buildQuotePreviewFromChallenge({
      hireJobId: "hirejob:t",
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
    expect(q.provenance).toBe("syntheticFixture");
    expect(q.status).toBe("policyCompatibleUnapproved");
    expect(q.amount.displayUsdc).toBe("0.025000");
    expect(q.network).toBe(APPROVED_PAYMENT_NETWORK);
    expect(q.asset?.toLowerCase()).toBe(APPROVED_SEPOLIA_TEST_USDC.toLowerCase());
    expect(q.paymentReady).toBe(false);
    // Status must not be approved/paid from parser alone
    expect(q.status).not.toBe("approved" as typeof q.status);
  });

  it("captured fixtureKind maps to observedChallenge provenance", () => {
    const fixture = getHireJobFixture("compatible-payment-unapproved-402");
    const q = buildQuotePreviewFromChallenge({
      hireJobId: "hirejob:t",
      capabilityId: "cap:x",
      providerKey: "p",
      method: null,
      endpointUrl: null,
      capturedAt: "1970-01-01T00:00:00.000Z",
      fixtureKind: "captured",
      httpStatus: fixture.http!.httpStatus,
      headers: fixture.http!.headers,
      body: fixture.http!.body,
    });
    expect(q.provenance).toBe("observedChallenge");
    expect(q.provenance).not.toBe("syntheticFixture");
    expect(q.provenance).not.toBe("advertisedPricing");
  });

  it("incompatible challenge yields policyIncompatible", () => {
    const fixture = getHireJobFixture("incompatible-payment-402");
    const q = buildQuotePreviewFromChallenge({
      hireJobId: "hirejob:t",
      capabilityId: "cap:x",
      providerKey: "p",
      method: null,
      endpointUrl: null,
      capturedAt: "1970-01-01T00:00:00.000Z",
      fixtureKind: "synthetic",
      httpStatus: fixture.http!.httpStatus,
      headers: fixture.http!.headers,
      body: fixture.http!.body,
    });
    expect(q.status).toBe("policyIncompatible");
    expect(q.structurallyCompatible).toBe(false);
    expect(q.paymentReady).toBe(false);
  });

  it("unavailable quote keeps amount unknown", () => {
    const q = buildUnavailableQuotePreview({
      hireJobId: "hirejob:t",
      capabilityId: "cap:x",
      providerKey: "p",
      method: null,
      endpointUrl: null,
      capturedAt: "1970-01-01T00:00:00.000Z",
      reason: "no challenge",
    });
    expect(q.status).toBe("unavailable");
    expect(q.amount.unknown).toBe(true);
    expect(q.amount.atomicAmount).not.toBe("0");
  });

  it("exposes controlled payment policy constants", () => {
    expect(CONTROLLED_PAYMENT_POLICY.x402Version).toBe(2);
    expect(CONTROLLED_PAYMENT_POLICY.scheme).toBe("exact");
    expect(CONTROLLED_PAYMENT_POLICY.network).toBe("eip155:84532");
    expect(CONTROLLED_PAYMENT_POLICY.decimals).toBe(6);
  });
});

/**
 * Synthetic HireJob fixtures (D5.2).
 *
 * Labels: fixtureKind "synthetic" — NEVER observed QuantJourney responses.
 * From docs/day5/first-adapter-spec.md offline fixture table.
 */

import {
  encodePaymentRequiredBase64,
} from "../x402/challenge-parser.ts";
import {
  APPROVED_PAYMENT_NETWORK,
  APPROVED_SEPOLIA_TEST_USDC,
  APPROVED_X402_SCHEME,
  APPROVED_X402_VERSION,
} from "../x402/challenge-types.ts";
import { buildSyntheticSecIdentitySuccess } from "../adapters/quantjourney-sec-identity.ts";
import type { HireJobFixtureKind } from "./types.ts";

export const FIXTURE_KIND = "synthetic" as const;

export type SyntheticHttpFixture = {
  readonly fixtureId: string;
  readonly fixtureKind: typeof FIXTURE_KIND;
  readonly httpStatus: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly note: string;
};

export type HireJobFixtureCase = {
  readonly kind: HireJobFixtureKind;
  readonly fixtureId: string;
  readonly fixtureKind: typeof FIXTURE_KIND;
  readonly description: string;
  readonly rawInput: unknown;
  /** When present, synthetic provider-shaped HTTP envelope (not a live response). */
  readonly http: SyntheticHttpFixture | null;
  readonly expectedPath:
    | "inputRejected"
    | "simulateSuccess"
    | "simulateProviderError"
    | "paymentIncompatible"
    | "paymentCompatibleUnapproved";
};

const SEPOLIA_PAY_TO = "0x00000000000000000000000000000000000000Aa";
const MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function sepoliaExactOffer(
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    scheme: APPROVED_X402_SCHEME,
    network: APPROVED_PAYMENT_NETWORK,
    maxAmountRequired: "25000",
    resource: "https://example.test/synthetic/sec-company-identity",
    description: "synthetic fixture — not a QuantJourney offer",
    mimeType: "application/json",
    payTo: SEPOLIA_PAY_TO,
    maxTimeoutSeconds: 60,
    asset: APPROVED_SEPOLIA_TEST_USDC,
    ...overrides,
  };
}

function paymentRequiredEnvelope(
  accepts: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    x402Version: APPROVED_X402_VERSION,
    error: "Payment required",
    accepts,
  };
}

export function buildSyntheticAaplSuccessResult() {
  return buildSyntheticSecIdentitySuccess({
    input: { kind: "ticker", ticker: "AAPL" },
    fixtureId: "success-aapl",
    cik: "320193",
    ticker: "AAPL",
    companyName: "Apple Inc.",
    exchange: "NASDAQ",
  });
}

export const HIREJOB_FIXTURE_CASES: readonly HireJobFixtureCase[] = [
  {
    kind: "success-aapl",
    fixtureId: "success-aapl",
    fixtureKind: FIXTURE_KIND,
    description:
      "Synthetic success envelope with plausible public identity fields for AAPL",
    rawInput: { kind: "ticker", ticker: "AAPL" },
    http: {
      fixtureId: "success-aapl",
      fixtureKind: FIXTURE_KIND,
      httpStatus: 200,
      headers: { "content-type": "application/json" },
      body: buildSyntheticAaplSuccessResult(),
      note: "synthetic — not an observed QuantJourney response",
    },
    expectedPath: "simulateSuccess",
  },
  {
    kind: "invalid-input-empty",
    fixtureId: "invalid-input-empty",
    fixtureKind: FIXTURE_KIND,
    description: "Empty/whitespace query rejected by AgentHire validation before network",
    rawInput: { kind: "ticker", ticker: "   " },
    http: null,
    expectedPath: "inputRejected",
  },
  {
    kind: "invalid-input-url",
    fixtureId: "invalid-input-url",
    fixtureKind: FIXTURE_KIND,
    description: "URL-shaped query rejected locally",
    rawInput: { kind: "companyName", companyName: "https://evil.example/ssrf" },
    http: null,
    expectedPath: "inputRejected",
  },
  {
    kind: "provider-error-4xx",
    fixtureId: "provider-error-4xx",
    fixtureKind: FIXTURE_KIND,
    description: "Synthetic provider client error body",
    rawInput: { kind: "ticker", ticker: "AAPL" },
    http: {
      fixtureId: "provider-error-4xx",
      fixtureKind: FIXTURE_KIND,
      httpStatus: 400,
      headers: { "content-type": "application/json" },
      body: {
        error: "synthetic_client_error",
        message: "Synthetic 4xx — not observed from QuantJourney",
      },
      note: "synthetic provider-error-4xx",
    },
    expectedPath: "simulateProviderError",
  },
  {
    kind: "provider-error-5xx",
    fixtureId: "provider-error-5xx",
    fixtureKind: FIXTURE_KIND,
    description: "Synthetic provider server error",
    rawInput: { kind: "ticker", ticker: "AAPL" },
    http: {
      fixtureId: "provider-error-5xx",
      fixtureKind: FIXTURE_KIND,
      httpStatus: 503,
      headers: { "content-type": "application/json" },
      body: {
        error: "synthetic_server_error",
        message: "Synthetic 5xx — not observed from QuantJourney",
      },
      note: "synthetic provider-error-5xx",
    },
    expectedPath: "simulateProviderError",
  },
  {
    kind: "incompatible-payment-402",
    fixtureId: "incompatible-payment-402",
    fixtureKind: FIXTURE_KIND,
    description:
      "Synthetic HTTP 402 + cross-network USDC substitution (Sepolia net + Mainnet USDC)",
    rawInput: { kind: "ticker", ticker: "AAPL" },
    http: (() => {
      const envelope = paymentRequiredEnvelope([
        sepoliaExactOffer({
          // D8.7: both networks approved, but asset must match offer network
          network: APPROVED_PAYMENT_NETWORK,
          asset: MAINNET_USDC,
          description: "synthetic cross-network-incompatible offer",
        }),
      ]);
      return {
        fixtureId: "incompatible-payment-402",
        fixtureKind: FIXTURE_KIND,
        httpStatus: 402,
        headers: {
          "PAYMENT-REQUIRED": encodePaymentRequiredBase64(envelope),
        },
        body: envelope,
        note: "synthetic incompatible 402 — not observed from QuantJourney",
      };
    })(),
    expectedPath: "paymentIncompatible",
  },
  {
    kind: "compatible-payment-unapproved-402",
    fixtureId: "compatible-payment-unapproved-402",
    fixtureKind: FIXTURE_KIND,
    description:
      "Synthetic Sepolia exact USDC offer that still fails without payment approval",
    rawInput: { kind: "ticker", ticker: "AAPL" },
    http: (() => {
      const envelope = paymentRequiredEnvelope([sepoliaExactOffer()]);
      return {
        fixtureId: "compatible-payment-unapproved-402",
        fixtureKind: FIXTURE_KIND,
        httpStatus: 402,
        headers: {
          "PAYMENT-REQUIRED": encodePaymentRequiredBase64(envelope),
        },
        body: envelope,
        note: "synthetic compatible-unapproved 402 — not observed from QuantJourney",
      };
    })(),
    expectedPath: "paymentCompatibleUnapproved",
  },
];

export function getHireJobFixture(
  kind: HireJobFixtureKind,
): HireJobFixtureCase {
  const found = HIREJOB_FIXTURE_CASES.find((c) => c.kind === kind);
  if (!found) {
    throw new Error(`unknown fixture kind: ${kind}`);
  }
  return found;
}

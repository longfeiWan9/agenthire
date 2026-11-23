/**
 * Offline quote preview builder (D5.3).
 *
 * Reuses x402 challenge-parser + offer-policy.
 * Controlled policy: x402 v2 · exact · eip155:84532 · USDC 0x036C…CF7e · decimals 6.
 * Integer-safe amounts; USDC display only when decimals confirmed; unknown ≠ zero.
 * STRICTLY_OFFLINE — no network, signing, or payment.
 */

import { createHash } from "node:crypto";
import { parseHttp402Challenge } from "../x402/challenge-parser.ts";
import { evaluateOfferPolicy, OFFER_POLICY_VERSION } from "../x402/offer-policy.ts";
import {
  APPROVED_PAYMENT_NETWORK,
  APPROVED_SEPOLIA_TEST_USDC,
  APPROVED_X402_SCHEME,
  APPROVED_X402_VERSION,
} from "../x402/challenge-types.ts";
import type { ChallengeParseResult } from "../x402/challenge-types.ts";
import type {
  AdvertisedPricingInput,
  NormalizedQuotePreview,
  QuoteAmountView,
  QuoteProvenance,
  QuoteStatus,
} from "./quote-types.ts";
import {
  HIRING_QUOTE_MODE,
  HIRING_QUOTE_SCHEMA_VERSION,
} from "./quote-types.ts";

export const CONTROLLED_PAYMENT_POLICY = {
  x402Version: APPROVED_X402_VERSION,
  scheme: APPROVED_X402_SCHEME,
  network: APPROVED_PAYMENT_NETWORK,
  asset: APPROVED_SEPOLIA_TEST_USDC,
  decimals: 6 as const,
} as const;

const USDC_DECIMALS = 6 as const;

function isUnsignedIntegerString(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

/**
 * Format atomic USDC amount with exactly 6 fractional digits.
 * Returns null when amount is not a safe unsigned integer string.
 * Uses BigInt — never Number — for integer safety.
 */
export function formatUsdcDisplay6(atomicAmount: string): string | null {
  if (!isUnsignedIntegerString(atomicAmount)) return null;
  const bi = BigInt(atomicAmount);
  const scale = 10n ** BigInt(USDC_DECIMALS);
  const whole = bi / scale;
  const frac = bi % scale;
  return `${whole.toString()}.${frac.toString().padStart(USDC_DECIMALS, "0")}`;
}

export function buildQuoteAmountView(args: {
  readonly atomicAmount: string | null | undefined;
  readonly asset: string | null | undefined;
}): QuoteAmountView {
  const raw = args.atomicAmount;
  if (raw === null || raw === undefined || raw === "") {
    return {
      atomicAmount: null,
      decimalsConfirmed: false,
      decimals: null,
      displayUsdc: null,
      unknown: true,
    };
  }
  if (!isUnsignedIntegerString(raw)) {
    return {
      atomicAmount: null,
      decimalsConfirmed: false,
      decimals: null,
      displayUsdc: null,
      unknown: true,
    };
  }
  const assetOk =
    typeof args.asset === "string" &&
    args.asset.toLowerCase() === APPROVED_SEPOLIA_TEST_USDC.toLowerCase();
  if (!assetOk) {
    // Amount known as integer string but decimals not confirmed for this asset.
    return {
      atomicAmount: raw,
      decimalsConfirmed: false,
      decimals: null,
      displayUsdc: null,
      unknown: false,
    };
  }
  return {
    atomicAmount: raw,
    decimalsConfirmed: true,
    decimals: USDC_DECIMALS,
    displayUsdc: formatUsdcDisplay6(raw),
    unknown: false,
  };
}

function quoteIdFrom(parts: readonly string[]): string {
  const digest = createHash("sha256")
    .update(parts.join("|"), "utf8")
    .digest("hex")
    .slice(0, 16);
  return `quote:${digest}`;
}

function expiresAtFrom(
  capturedAt: string,
  maxTimeoutSeconds: number | null,
): string | null {
  if (maxTimeoutSeconds === null || maxTimeoutSeconds < 0) return null;
  const base = Date.parse(capturedAt);
  if (!Number.isFinite(base)) return null;
  return new Date(base + maxTimeoutSeconds * 1000).toISOString();
}

function basePreview(args: {
  readonly quoteId: string;
  readonly provenance: QuoteProvenance;
  readonly status: QuoteStatus;
  readonly hireJobId: string;
  readonly capabilityId: string;
  readonly providerKey: string;
  readonly method: string | null;
  readonly endpointUrl: string | null;
  readonly amount: QuoteAmountView;
  readonly asset: string | null;
  readonly network: string | null;
  readonly recipient: string | null;
  readonly scheme: string | null;
  readonly x402Version: number | null;
  readonly transferKind: "exact" | "unknown";
  readonly capturedAt: string;
  readonly maxTimeoutSeconds: number | null;
  readonly structurallyCompatible: boolean | null;
  readonly notes: readonly string[];
  readonly warnings: readonly string[];
}): NormalizedQuotePreview {
  return {
    schemaVersion: HIRING_QUOTE_SCHEMA_VERSION,
    mode: HIRING_QUOTE_MODE,
    quoteId: args.quoteId,
    provenance: args.provenance,
    status: args.status,
    hireJobId: args.hireJobId,
    capabilityId: args.capabilityId,
    providerKey: args.providerKey,
    method: args.method,
    endpointUrl: args.endpointUrl,
    amount: args.amount,
    asset: args.asset,
    network: args.network,
    recipient: args.recipient,
    scheme: args.scheme,
    x402Version: args.x402Version,
    transferKind: args.transferKind,
    freshness: {
      capturedAt: args.capturedAt,
      maxTimeoutSeconds: args.maxTimeoutSeconds,
      expiresAt: expiresAtFrom(args.capturedAt, args.maxTimeoutSeconds),
    },
    policyVersion: OFFER_POLICY_VERSION,
    structurallyCompatible: args.structurallyCompatible,
    paymentReady: false,
    executionAuthorization: false,
    paymentExecutionAuthorization: false,
    notes: args.notes,
    warnings: args.warnings,
  };
}

/**
 * Build a quote from advertised pricing alone.
 * Advertised-only ≠ payment-ready; never upgrades to observedChallenge.
 */
export function buildQuotePreviewFromAdvertisedPricing(
  input: AdvertisedPricingInput,
): NormalizedQuotePreview {
  const amount = buildQuoteAmountView({
    atomicAmount: input.advertisedAmountAtomic ?? null,
    asset: input.advertisedAsset ?? null,
  });
  const incomplete =
    amount.unknown ||
    !input.advertisedAsset ||
    !input.advertisedNetwork ||
    !input.advertisedRecipient;

  const status: QuoteStatus = incomplete ? "incomplete" : "previewReady";
  const warnings = [
    "provenance=advertisedPricing — not an observed HTTP 402 challenge",
    "advertised-only ≠ payment-ready; paymentReady remains false",
    "executionAuthorization=false; paymentExecutionAuthorization=false",
  ];
  if (amount.unknown) {
    warnings.push("amount unknown — unknown ≠ zero; displayUsdc withheld");
  }

  return basePreview({
    quoteId: quoteIdFrom([
      "advertised",
      input.hireJobId,
      input.capabilityId,
      String(input.advertisedAmountAtomic ?? "unknown"),
    ]),
    provenance: "advertisedPricing",
    status,
    hireJobId: input.hireJobId,
    capabilityId: input.capabilityId,
    providerKey: input.providerKey,
    method: input.method,
    endpointUrl: input.endpointUrl,
    amount,
    asset: input.advertisedAsset ?? null,
    network: input.advertisedNetwork ?? null,
    recipient: input.advertisedRecipient ?? null,
    scheme: null,
    x402Version: null,
    transferKind: "unknown",
    capturedAt: input.capturedAt,
    maxTimeoutSeconds: null,
    structurallyCompatible: null,
    notes: [
      input.note ?? "Advertised pricing preview only",
      `controlledPolicy=${CONTROLLED_PAYMENT_POLICY.scheme}/${CONTROLLED_PAYMENT_POLICY.network}/decimals=${CONTROLLED_PAYMENT_POLICY.decimals}`,
    ],
    warnings,
  });
}

export type ChallengeQuoteInput = {
  readonly hireJobId: string;
  readonly capabilityId: string;
  readonly providerKey: string;
  readonly method: string | null;
  readonly endpointUrl: string | null;
  readonly capturedAt: string;
  readonly fixtureKind: "synthetic" | "captured";
  readonly httpStatus: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: unknown;
};

function provenanceFromFixtureKind(
  fixtureKind: "synthetic" | "captured",
): QuoteProvenance {
  return fixtureKind === "synthetic" ? "syntheticFixture" : "observedChallenge";
}

/**
 * Build a quote from an HTTP 402 challenge fixture (synthetic or captured).
 * Reuses parser + offer policy. Never sets approved/paid from parse alone.
 */
export function buildQuotePreviewFromChallenge(
  input: ChallengeQuoteInput,
): NormalizedQuotePreview {
  const provenance = provenanceFromFixtureKind(input.fixtureKind);
  const parseResult: ChallengeParseResult = parseHttp402Challenge({
    fixtureKind: input.fixtureKind,
    httpStatus: input.httpStatus,
    headers: input.headers,
    body: input.body,
  });

  // Explicitly unapproved — structural compatibility ≠ payment authorization.
  const policy = evaluateOfferPolicy(parseResult, {
    paymentApprovalGranted: false,
  });

  if (!parseResult.ok) {
    return basePreview({
      quoteId: quoteIdFrom([
        provenance,
        input.hireJobId,
        "parseFailed",
        parseResult.reason,
      ]),
      provenance,
      status: "unavailable",
      hireJobId: input.hireJobId,
      capabilityId: input.capabilityId,
      providerKey: input.providerKey,
      method: input.method,
      endpointUrl: input.endpointUrl,
      amount: buildQuoteAmountView({ atomicAmount: null, asset: null }),
      asset: null,
      network: null,
      recipient: null,
      scheme: null,
      x402Version: null,
      transferKind: "unknown",
      capturedAt: input.capturedAt,
      maxTimeoutSeconds: null,
      structurallyCompatible: false,
      notes: [`challenge parse failed: ${parseResult.reason}`],
      warnings: [
        `provenance=${provenance}`,
        "parser alone cannot approve or mark paid",
        "paymentReady=false",
      ],
    });
  }

  const requirement =
    parseResult.challenge.accepts.find((_, i) =>
      policy.evaluations.some(
        (e) => e.index === i && e.structurallyCompatible,
      ),
    ) ?? parseResult.challenge.accepts[0]!;

  const amount = buildQuoteAmountView({
    atomicAmount: requirement.amount,
    asset: requirement.asset,
  });

  let status: QuoteStatus;
  if (!policy.anyStructurallyCompatible) {
    status = "policyIncompatible";
  } else {
    // Structurally compatible but unapproved — preview ready for human review.
    status = "policyCompatibleUnapproved";
  }

  const transferKind: "exact" | "unknown" =
    requirement.scheme === APPROVED_X402_SCHEME ? "exact" : "unknown";

  return basePreview({
    quoteId: quoteIdFrom([
      provenance,
      input.hireJobId,
      requirement.amount,
      requirement.asset,
      requirement.network,
      requirement.payTo,
    ]),
    provenance,
    status,
    hireJobId: input.hireJobId,
    capabilityId: input.capabilityId,
    providerKey: input.providerKey,
    method: input.method,
    endpointUrl: input.endpointUrl,
    amount,
    asset: requirement.asset,
    network: requirement.network,
    recipient: requirement.payTo,
    scheme: requirement.scheme,
    x402Version: parseResult.challenge.x402Version,
    transferKind,
    capturedAt: input.capturedAt,
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
    structurallyCompatible: policy.anyStructurallyCompatible,
    notes: [
      `parseOk=true; policy anyStructurallyCompatible=${policy.anyStructurallyCompatible}`,
      `controlledPolicy x402 v${CONTROLLED_PAYMENT_POLICY.x402Version} ${CONTROLLED_PAYMENT_POLICY.scheme} ${CONTROLLED_PAYMENT_POLICY.network} decimals=${CONTROLLED_PAYMENT_POLICY.decimals}`,
      policy.notes,
    ],
    warnings: [
      `provenance=${provenance}`,
      "QuoteStatus excludes approved/paid — human approval required separately",
      "paymentApprovalGranted=false; paymentReady=false",
      "executionAuthorization=false; paymentExecutionAuthorization=false",
      "simulationApproved ≠ live permission",
    ],
  });
}

/**
 * Unavailable quote when interface/method/URL unknown and no challenge present.
 */
export function buildUnavailableQuotePreview(args: {
  readonly hireJobId: string;
  readonly capabilityId: string;
  readonly providerKey: string;
  readonly method: string | null;
  readonly endpointUrl: string | null;
  readonly capturedAt: string;
  readonly reason: string;
}): NormalizedQuotePreview {
  return basePreview({
    quoteId: quoteIdFrom(["unavailable", args.hireJobId, args.reason]),
    provenance: "advertisedPricing",
    status: "unavailable",
    hireJobId: args.hireJobId,
    capabilityId: args.capabilityId,
    providerKey: args.providerKey,
    method: args.method,
    endpointUrl: args.endpointUrl,
    amount: buildQuoteAmountView({ atomicAmount: null, asset: null }),
    asset: null,
    network: null,
    recipient: null,
    scheme: null,
    x402Version: null,
    transferKind: "unknown",
    capturedAt: args.capturedAt,
    maxTimeoutSeconds: null,
    structurallyCompatible: null,
    notes: [args.reason],
    warnings: [
      "No payable challenge observed; advertised skill alone is not a quote",
      "amount unknown ≠ zero",
      "paymentReady=false",
    ],
  });
}

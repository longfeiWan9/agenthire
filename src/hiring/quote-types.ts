/**
 * Hiring quote preview types (D5.3).
 *
 * STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_SERVICE_EXECUTION
 *
 * QuoteProvenance values are never interchangeable.
 * QuoteStatus must not include approved/paid from the parser alone.
 */

export const HIRING_QUOTE_SCHEMA_VERSION = "1.0" as const;
export const HIRING_QUOTE_MODE =
  "STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_SERVICE_EXECUTION" as const;

/**
 * How the quote was obtained. These are distinct evidence classes —
 * never treat advertisedPricing as observedChallenge or syntheticFixture.
 */
export type QuoteProvenance =
  | "advertisedPricing"
  | "observedChallenge"
  | "syntheticFixture";

/**
 * Quote lifecycle statuses visible to the hiring UI.
 * Intentionally excludes approved / paid / settled — those require
 * separate human approval + (future) payment execution auth.
 */
export type QuoteStatus =
  | "unavailable"
  | "incomplete"
  | "parsed"
  | "policyIncompatible"
  | "policyCompatibleUnapproved"
  | "previewReady";

export type QuoteAmountView = {
  /** Atomic integer string, or null when unknown. Unknown ≠ "0". */
  readonly atomicAmount: string | null;
  /** True only when asset decimals are confirmed (USDC = 6). */
  readonly decimalsConfirmed: boolean;
  readonly decimals: 6 | null;
  /**
   * Human display with exactly 6 fractional digits.
   * Present only when atomicAmount is known AND decimalsConfirmed.
   */
  readonly displayUsdc: string | null;
  /** True when amount is unknown (must not be coerced to zero). */
  readonly unknown: boolean;
};

export type QuoteFreshness = {
  readonly capturedAt: string;
  readonly maxTimeoutSeconds: number | null;
  readonly expiresAt: string | null;
};

/**
 * Normalized quote preview for HireJob approval binding.
 * paymentReady and both authorization flags stay false in D5.3.
 */
export type NormalizedQuotePreview = {
  readonly schemaVersion: typeof HIRING_QUOTE_SCHEMA_VERSION;
  readonly mode: typeof HIRING_QUOTE_MODE;
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
  readonly freshness: QuoteFreshness;
  readonly policyVersion: string;
  readonly structurallyCompatible: boolean | null;
  /** Advertised-only quotes are never payment-ready. */
  readonly paymentReady: false;
  readonly executionAuthorization: false;
  readonly paymentExecutionAuthorization: false;
  readonly notes: readonly string[];
  readonly warnings: readonly string[];
};

export type AdvertisedPricingInput = {
  readonly hireJobId: string;
  readonly capabilityId: string;
  readonly providerKey: string;
  readonly method: string | null;
  readonly endpointUrl: string | null;
  readonly capturedAt: string;
  /** Optional free-text / numeric advertisement — never treated as verified. */
  readonly advertisedAmountAtomic?: string | null;
  readonly advertisedAsset?: string | null;
  readonly advertisedNetwork?: string | null;
  readonly advertisedRecipient?: string | null;
  readonly note?: string;
};

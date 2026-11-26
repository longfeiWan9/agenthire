/**
 * Offline x402 v2 challenge types (D4.3b / D8.7).
 *
 * Minimal isolated shapes for unsigned HTTP 402 Payment Required payloads.
 * Not a full SDK. No signing / settlement / network I/O.
 *
 * Field names follow the public x402 v2 Payment Required / PaymentRequirements
 * envelope commonly carried as JSON or base64 in the PAYMENT-REQUIRED header.
 * Local uncertainty is documented where upstream docs are not pinned in-repo.
 *
 * D8.7: approved payment networks are Base Mainnet + Base Sepolia with
 * per-network USDC addresses. Registration network ≠ payment network.
 */

export const X402_CHALLENGE_TYPES_VERSION = "1.0" as const;

/** AgentHire approved payment networks (D8.7). */
export const APPROVED_PAYMENT_NETWORKS = [
  "eip155:8453",
  "eip155:84532",
] as const;

export type ApprovedPaymentNetwork =
  (typeof APPROVED_PAYMENT_NETWORKS)[number];

/**
 * Per-network approved USDC (checksummed). Quotes/assets must match the
 * offer network — cross-network substitution is rejected.
 */
export const APPROVED_USDC_BY_NETWORK = {
  "eip155:8453": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "eip155:84532": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as const satisfies Record<ApprovedPaymentNetwork, `0x${string}`>;

/** Official exact/EVM transfer methods (x402 scheme_exact_evm). */
export const APPROVED_ASSET_TRANSFER_METHODS = [
  "eip3009",
  "permit2",
  "erc7710",
] as const;

export type ApprovedAssetTransferMethod =
  (typeof APPROVED_ASSET_TRANSFER_METHODS)[number];

/**
 * @deprecated Prefer APPROVED_PAYMENT_NETWORKS. Sepolia alias retained for
 * offline POC fixtures (D8.2-B) that still label local mocks as Sepolia.
 */
export const APPROVED_PAYMENT_NETWORK = "eip155:84532" as const;

/** @deprecated Prefer APPROVED_USDC_BY_NETWORK["eip155:84532"]. */
export const APPROVED_SEPOLIA_TEST_USDC =
  APPROVED_USDC_BY_NETWORK["eip155:84532"];

/** Convenience alias for Base Mainnet USDC. */
export const APPROVED_MAINNET_USDC =
  APPROVED_USDC_BY_NETWORK["eip155:8453"];

export const APPROVED_X402_VERSION = 2 as const;
export const APPROVED_X402_SCHEME = "exact" as const;

/** Canonical hire task — not required for agent/x402 seller discovery. */
export const MVP_TASK_ID = "wallet-activity-summary@1.0" as const;

/**
 * One accepted payment alternative inside a Payment Required envelope.
 * Optional / unknown fields stay optional — do not invent protocol fields.
 */
export type ParsedPaymentRequirement = {
  readonly scheme: string;
  readonly network: string;
  readonly asset: string;
  /** Atomic amount string from `maxAmountRequired` (or equivalent). */
  readonly amount: string;
  readonly payTo: string;
  readonly resource: string | null;
  readonly description: string | null;
  readonly mimeType: string | null;
  readonly maxTimeoutSeconds: number | null;
  readonly outputSchemaPresent: boolean;
  /**
   * `extra.assetTransferMethod` when present; null when absent
   * (exact/EVM defaults to eip3009 per scheme docs — not auto-granted).
   */
  readonly assetTransferMethod: string | null;
  readonly extraKeys: readonly string[];
  readonly rawKeys: readonly string[];
};

export type ParsedPaymentRequired = {
  readonly x402Version: number;
  readonly error: string | null;
  readonly accepts: readonly ParsedPaymentRequirement[];
  readonly rawTopLevelKeys: readonly string[];
  /** How the envelope was located. */
  readonly source: "header" | "body" | "object";
};

export type ChallengeParseFailureReason =
  | "notHttp402"
  | "missingPaymentRequired"
  | "invalidBase64"
  | "invalidJson"
  | "notObject"
  | "missingX402Version"
  | "unsupportedX402Version"
  | "missingAccepts"
  | "emptyAccepts"
  | "malformedAcceptsEntry"
  | "invalidAmount"
  | "invalidPayTo"
  | "invalidAsset"
  | "invalidNetwork"
  | "invalidScheme"
  | "noEvmAcceptsParsed";

/**
 * Per-accept diagnostic for multi-entry envelopes.
 * Failures are retained; a single ok entry never authorizes payment.
 */
export type AcceptEntryDiagnostic = {
  readonly index: number;
  readonly ok: boolean;
  readonly reason: ChallengeParseFailureReason | null;
  readonly message: string | null;
  readonly scheme: string | null;
  readonly network: string | null;
  /** Coarse family hint from network / asset shape — not a payment grant. */
  readonly assetFamily:
    | "evm"
    | "solana"
    | "stellar"
    | "algorand"
    | "unknown"
    | null;
};

export type ChallengeParseResult =
  | {
      readonly ok: true;
      readonly fixtureKind: "synthetic" | "captured";
      readonly httpStatus: number | null;
      readonly challenge: ParsedPaymentRequired;
      readonly warnings: readonly string[];
      readonly entryDiagnostics: readonly AcceptEntryDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly fixtureKind: "synthetic" | "captured";
      readonly httpStatus: number | null;
      readonly reason: ChallengeParseFailureReason;
      readonly message: string;
      readonly entryDiagnostics?: readonly AcceptEntryDiagnostic[];
    };

export type OfferPolicyReasonCode =
  | "protocolParseFailed"
  | "unsupportedX402Version"
  | "unsupportedScheme"
  | "networkNotApproved"
  | "assetNotApprovedUsdcForNetwork"
  | "unsupportedTransferMethod"
  | "amountMissingOrInvalid"
  | "payToMissingOrInvalid"
  | "maxTimeoutInvalid"
  | "structurallyCompatible"
  | "paymentApprovalRequired"
  | "paymentApprovalNotGranted"
  | "taskNotBound"
  | "facilitatorCompatibilityUnverified"
  | "multipleAlternativesEvaluated"
  /** @deprecated D8.7 — replaced by networkNotApproved */
  | "networkNotSepolia"
  /** @deprecated D8.7 — Mainnet is an approved payment network */
  | "networkMainnetRejected"
  /** @deprecated D8.7 — replaced by assetNotApprovedUsdcForNetwork */
  | "assetNotApprovedSepoliaUsdc";

export type OfferPolicyEvaluation = {
  readonly index: number;
  readonly requirement: ParsedPaymentRequirement | null;
  readonly structurallyCompatible: boolean;
  readonly policyPass: false | true;
  readonly reasonCodes: readonly OfferPolicyReasonCode[];
  readonly notes: string;
};

/**
 * Policy evaluation is separate from protocol parse.
 * `policyPass` additionally requires explicit paymentApprovalGranted.
 * Task schema binding is NOT required for structural / offer eligibility.
 */
export type OfferPolicyResult = {
  readonly policyVersion: "1.0";
  readonly parseOk: boolean;
  readonly fixtureKind: "synthetic" | "captured" | "none";
  readonly approvedNetworks: typeof APPROVED_PAYMENT_NETWORKS;
  readonly approvedUsdcByNetwork: typeof APPROVED_USDC_BY_NETWORK;
  /** @deprecated Prefer approvedNetworks — Sepolia alias for fixture compat */
  readonly approvedNetwork: typeof APPROVED_PAYMENT_NETWORK;
  /** @deprecated Prefer approvedUsdcByNetwork — Sepolia alias */
  readonly approvedAsset: typeof APPROVED_SEPOLIA_TEST_USDC;
  readonly approvedScheme: typeof APPROVED_X402_SCHEME;
  readonly approvedX402Version: typeof APPROVED_X402_VERSION;
  readonly mvpTaskId: typeof MVP_TASK_ID;
  readonly paymentApprovalGranted: boolean;
  readonly evaluations: readonly OfferPolicyEvaluation[];
  readonly anyStructurallyCompatible: boolean;
  /** Always false unless parse ok + structural match + explicit approval. */
  readonly anyPolicyPass: boolean;
  readonly notes: string;
};

export function isApprovedPaymentNetwork(
  network: string,
): network is ApprovedPaymentNetwork {
  return (APPROVED_PAYMENT_NETWORKS as readonly string[]).includes(network);
}

export function approvedUsdcForNetwork(
  network: string,
): `0x${string}` | null {
  if (!isApprovedPaymentNetwork(network)) return null;
  return APPROVED_USDC_BY_NETWORK[network];
}

export function isApprovedAssetTransferMethod(
  method: string,
): method is ApprovedAssetTransferMethod {
  return (APPROVED_ASSET_TRANSFER_METHODS as readonly string[]).includes(
    method,
  );
}

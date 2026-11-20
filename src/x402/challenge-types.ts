/**
 * Offline x402 v2 challenge types (D4.3b).
 *
 * Minimal isolated shapes for unsigned HTTP 402 Payment Required payloads.
 * Not a full SDK. No signing / settlement / network I/O.
 *
 * Field names follow the public x402 v2 Payment Required / PaymentRequirements
 * envelope commonly carried as JSON or base64 in the PAYMENT-REQUIRED header.
 * Local uncertainty is documented where upstream docs are not pinned in-repo.
 */

export const X402_CHALLENGE_TYPES_VERSION = "1.0" as const;

/** AgentHire approved payment network (MVP §1.2). */
export const APPROVED_PAYMENT_NETWORK = "eip155:84532" as const;

/** Base Sepolia test USDC (MVP §1.2). */
export const APPROVED_SEPOLIA_TEST_USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export const APPROVED_X402_VERSION = 2 as const;
export const APPROVED_X402_SCHEME = "exact" as const;

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
  | "invalidScheme";

export type ChallengeParseResult =
  | {
      readonly ok: true;
      readonly fixtureKind: "synthetic" | "captured";
      readonly httpStatus: number | null;
      readonly challenge: ParsedPaymentRequired;
      readonly warnings: readonly string[];
    }
  | {
      readonly ok: false;
      readonly fixtureKind: "synthetic" | "captured";
      readonly httpStatus: number | null;
      readonly reason: ChallengeParseFailureReason;
      readonly message: string;
    };

export type OfferPolicyReasonCode =
  | "protocolParseFailed"
  | "unsupportedX402Version"
  | "unsupportedScheme"
  | "networkNotSepolia"
  | "networkMainnetRejected"
  | "assetNotApprovedSepoliaUsdc"
  | "amountMissingOrInvalid"
  | "payToMissingOrInvalid"
  | "maxTimeoutInvalid"
  | "structurallyCompatible"
  | "paymentApprovalRequired"
  | "paymentApprovalNotGranted"
  | "taskNotBound"
  | "multipleAlternativesEvaluated";

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
 */
export type OfferPolicyResult = {
  readonly policyVersion: "1.0";
  readonly parseOk: boolean;
  readonly fixtureKind: "synthetic" | "captured" | "none";
  readonly approvedNetwork: typeof APPROVED_PAYMENT_NETWORK;
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

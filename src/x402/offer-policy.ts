/**
 * Offline x402 offer policy evaluation (D4.3b).
 *
 * Separates protocol parse success from AgentHire Sepolia payment policy.
 * Parser ≠ policy pass. Mainnet ≠ Sepolia. No signing / settlement.
 */

import { getAddress, isAddressEqual } from "viem";
import type { ChallengeParseResult } from "./challenge-types.ts";
import {
  APPROVED_PAYMENT_NETWORK,
  APPROVED_SEPOLIA_TEST_USDC,
  APPROVED_X402_SCHEME,
  APPROVED_X402_VERSION,
  MVP_TASK_ID,
  type OfferPolicyEvaluation,
  type OfferPolicyReasonCode,
  type OfferPolicyResult,
  type ParsedPaymentRequirement,
} from "./challenge-types.ts";

export const OFFER_POLICY_VERSION = "1.0" as const;

export type OfferPolicyOptions = {
  /**
   * Explicit human/payment authorization. Defaults to false.
   * Structural Sepolia compatibility never implies payment approval.
   */
  readonly paymentApprovalGranted?: boolean;
  /**
   * Optional expected resource binding (exact string). When set, mismatch
   * is noted but does not invent task compatibility.
   */
  readonly expectedResource?: string | null;
  /**
   * Optional declared service task. Policy never upgrades B4 from this alone.
   */
  readonly declaredTaskId?: string | null;
};

function assetEqualsApproved(asset: string): boolean {
  try {
    return isAddressEqual(getAddress(asset), getAddress(APPROVED_SEPOLIA_TEST_USDC));
  } catch {
    return false;
  }
}

function evaluateRequirement(
  requirement: ParsedPaymentRequirement,
  index: number,
  options: OfferPolicyOptions,
): OfferPolicyEvaluation {
  const reasonCodes: OfferPolicyReasonCode[] = [];
  const notes: string[] = [];

  if (requirement.scheme !== APPROVED_X402_SCHEME) {
    reasonCodes.push("unsupportedScheme");
    notes.push(
      `scheme "${requirement.scheme}" ≠ approved "${APPROVED_X402_SCHEME}"`,
    );
  }

  if (requirement.network === "eip155:8453") {
    reasonCodes.push("networkMainnetRejected");
    notes.push("network eip155:8453 (Base Mainnet) is not an approved payment network");
  } else if (requirement.network !== APPROVED_PAYMENT_NETWORK) {
    reasonCodes.push("networkNotSepolia");
    notes.push(
      `network "${requirement.network}" ≠ approved "${APPROVED_PAYMENT_NETWORK}"`,
    );
  }

  if (!assetEqualsApproved(requirement.asset)) {
    reasonCodes.push("assetNotApprovedSepoliaUsdc");
    notes.push(
      `asset ${requirement.asset} ≠ approved Sepolia test USDC ${APPROVED_SEPOLIA_TEST_USDC}`,
    );
  }

  if (!/^[0-9]+$/.test(requirement.amount)) {
    reasonCodes.push("amountMissingOrInvalid");
    notes.push("amount is not an unsigned integer string");
  }

  if (!requirement.payTo) {
    reasonCodes.push("payToMissingOrInvalid");
    notes.push("payTo missing");
  }

  if (
    requirement.maxTimeoutSeconds !== null &&
    (requirement.maxTimeoutSeconds < 0 ||
      !Number.isInteger(requirement.maxTimeoutSeconds))
  ) {
    reasonCodes.push("maxTimeoutInvalid");
    notes.push("maxTimeoutSeconds invalid");
  }

  const declared = options.declaredTaskId ?? null;
  if (declared && declared !== MVP_TASK_ID) {
    reasonCodes.push("taskNotBound");
    notes.push(
      `declared task "${declared}" is not ${MVP_TASK_ID} — keyword similarity is not a match`,
    );
  } else if (!declared) {
    reasonCodes.push("taskNotBound");
    notes.push(
      `no verified binding to ${MVP_TASK_ID}; docs/skills alone do not bind payment`,
    );
  }

  if (options.expectedResource) {
    if (requirement.resource !== options.expectedResource) {
      notes.push(
        `resource "${requirement.resource ?? "null"}" ≠ expected "${options.expectedResource}"`,
      );
    }
  }

  const blocking = reasonCodes.filter(
    (code) =>
      code !== "taskNotBound" &&
      code !== "paymentApprovalRequired" &&
      code !== "paymentApprovalNotGranted" &&
      code !== "structurallyCompatible" &&
      code !== "multipleAlternativesEvaluated",
  );

  // Structural compatibility: version already gated by parser; scheme/network/asset/amount/payTo shape.
  const structurallyCompatible = blocking.length === 0;

  if (structurallyCompatible) {
    reasonCodes.push("structurallyCompatible");
    notes.push(
      "Offer matches approved x402 v2 exact / eip155:84532 / Sepolia test USDC shape",
    );
  }

  reasonCodes.push("paymentApprovalRequired");
  const paymentApprovalGranted = options.paymentApprovalGranted === true;
  if (!paymentApprovalGranted) {
    reasonCodes.push("paymentApprovalNotGranted");
    notes.push("Payment approval not granted — refuse signing/settlement");
  }

  const policyPass =
    structurallyCompatible && paymentApprovalGranted && declared === MVP_TASK_ID
      ? true
      : false;

  return {
    index,
    requirement,
    structurallyCompatible,
    policyPass,
    reasonCodes,
    notes: notes.join("; "),
  };
}

/**
 * Evaluate a successful or failed challenge parse against AgentHire payment policy.
 */
export function evaluateOfferPolicy(
  parseResult: ChallengeParseResult | null,
  options: OfferPolicyOptions = {},
): OfferPolicyResult {
  const paymentApprovalGranted = options.paymentApprovalGranted === true;

  if (!parseResult) {
    return {
      policyVersion: OFFER_POLICY_VERSION,
      parseOk: false,
      fixtureKind: "none",
      approvedNetwork: APPROVED_PAYMENT_NETWORK,
      approvedAsset: APPROVED_SEPOLIA_TEST_USDC,
      approvedScheme: APPROVED_X402_SCHEME,
      approvedX402Version: APPROVED_X402_VERSION,
      mvpTaskId: MVP_TASK_ID,
      paymentApprovalGranted,
      evaluations: [
        {
          index: -1,
          requirement: null,
          structurallyCompatible: false,
          policyPass: false,
          reasonCodes: ["protocolParseFailed"],
          notes: "No challenge parse result supplied",
        },
      ],
      anyStructurallyCompatible: false,
      anyPolicyPass: false,
      notes: "Protocol parse missing — policy cannot pass",
    };
  }

  if (!parseResult.ok) {
    const codes: OfferPolicyReasonCode[] = ["protocolParseFailed"];
    if (parseResult.reason === "unsupportedX402Version") {
      codes.push("unsupportedX402Version");
    }
    return {
      policyVersion: OFFER_POLICY_VERSION,
      parseOk: false,
      fixtureKind: parseResult.fixtureKind,
      approvedNetwork: APPROVED_PAYMENT_NETWORK,
      approvedAsset: APPROVED_SEPOLIA_TEST_USDC,
      approvedScheme: APPROVED_X402_SCHEME,
      approvedX402Version: APPROVED_X402_VERSION,
      mvpTaskId: MVP_TASK_ID,
      paymentApprovalGranted,
      evaluations: [
        {
          index: -1,
          requirement: null,
          structurallyCompatible: false,
          policyPass: false,
          reasonCodes: codes,
          notes: parseResult.message,
        },
      ],
      anyStructurallyCompatible: false,
      anyPolicyPass: false,
      notes: `Protocol parse failed (${parseResult.reason}) — policy cannot pass`,
    };
  }

  const multi = parseResult.challenge.accepts.length > 1;
  const evaluations = parseResult.challenge.accepts.map((req, index) => {
    const base = evaluateRequirement(req, index, options);
    if (!multi) return base;
    return {
      ...base,
      reasonCodes: [...base.reasonCodes, "multipleAlternativesEvaluated" as const],
    };
  });

  const anyStructurallyCompatible = evaluations.some(
    (e) => e.structurallyCompatible,
  );
  const anyPolicyPass = evaluations.some((e) => e.policyPass);

  return {
    policyVersion: OFFER_POLICY_VERSION,
    parseOk: true,
    fixtureKind: parseResult.fixtureKind,
    approvedNetwork: APPROVED_PAYMENT_NETWORK,
    approvedAsset: APPROVED_SEPOLIA_TEST_USDC,
    approvedScheme: APPROVED_X402_SCHEME,
    approvedX402Version: APPROVED_X402_VERSION,
    mvpTaskId: MVP_TASK_ID,
    paymentApprovalGranted,
    evaluations,
    anyStructurallyCompatible,
    anyPolicyPass,
    notes: anyPolicyPass
      ? "At least one offer passes policy including explicit payment approval"
      : anyStructurallyCompatible
        ? "At least one offer is structurally Sepolia-compatible; payment approval and/or task binding still required"
        : "No offer satisfies approved Sepolia payment shape",
  };
}

/**
 * Convenience: provider-level x402Advertised without an observed challenge
 * never yields policy pass.
 */
export function evaluateProviderClaimWithoutChallenge(input: {
  readonly x402Advertised: boolean | null;
  readonly advertisedNetworks?: readonly string[];
  readonly paymentApprovalGranted?: boolean;
}): OfferPolicyResult {
  const notes = [
    "Provider-level x402 claim is not an observed HTTP 402 challenge",
    `x402Advertised=${String(input.x402Advertised)}`,
  ];
  if (input.advertisedNetworks && input.advertisedNetworks.length > 0) {
    notes.push(`advertisedNetworks=${input.advertisedNetworks.join(",")}`);
  } else {
    notes.push("advertisedNetworks empty/unspecified");
  }

  return {
    policyVersion: OFFER_POLICY_VERSION,
    parseOk: false,
    fixtureKind: "none",
    approvedNetwork: APPROVED_PAYMENT_NETWORK,
    approvedAsset: APPROVED_SEPOLIA_TEST_USDC,
    approvedScheme: APPROVED_X402_SCHEME,
    approvedX402Version: APPROVED_X402_VERSION,
    mvpTaskId: MVP_TASK_ID,
    paymentApprovalGranted: input.paymentApprovalGranted === true,
    evaluations: [
      {
        index: -1,
        requirement: null,
        structurallyCompatible: false,
        policyPass: false,
        reasonCodes: ["protocolParseFailed", "paymentApprovalRequired"],
        notes: notes.join("; "),
      },
    ],
    anyStructurallyCompatible: false,
    anyPolicyPass: false,
    notes:
      "Advertisement without observed challenge cannot advance past documentation ladder step",
  };
}

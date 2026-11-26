/**
 * Offline x402 offer policy evaluation (D4.3b / D8.7).
 *
 * Separates protocol parse success from AgentHire dual-network payment policy.
 * Parser ≠ policy pass. Registration network ≠ payment network.
 * No signing / settlement / live facilitator proof.
 *
 * D8.7: Base Mainnet (eip155:8453) and Base Sepolia (eip155:84532) are both
 * approved payment networks with distinct USDC addresses. Cross-network
 * asset substitution is rejected. Task schema is NOT required for offer
 * discovery / structural eligibility.
 */

import { getAddress, isAddressEqual } from "viem";
import type { ChallengeParseResult } from "./challenge-types.ts";
import {
  APPROVED_PAYMENT_NETWORK,
  APPROVED_PAYMENT_NETWORKS,
  APPROVED_SEPOLIA_TEST_USDC,
  APPROVED_USDC_BY_NETWORK,
  APPROVED_X402_SCHEME,
  APPROVED_X402_VERSION,
  MVP_TASK_ID,
  approvedUsdcForNetwork,
  isApprovedAssetTransferMethod,
  isApprovedPaymentNetwork,
  type OfferPolicyEvaluation,
  type OfferPolicyReasonCode,
  type OfferPolicyResult,
  type ParsedPaymentRequirement,
} from "./challenge-types.ts";

export const OFFER_POLICY_VERSION = "1.0" as const;

export type OfferPolicyOptions = {
  /**
   * Explicit human/payment authorization. Defaults to false.
   * Structural dual-network compatibility never implies payment approval.
   */
  readonly paymentApprovalGranted?: boolean;
  /**
   * Optional expected resource binding (exact string). When set, mismatch
   * is noted but does not invent task compatibility.
   */
  readonly expectedResource?: string | null;
  /**
   * Optional declared service task. Informational for hire binding only —
   * not required for structural offer eligibility or policyPass.
   */
  readonly declaredTaskId?: string | null;
};

function assetMatchesOfferNetwork(
  asset: string,
  network: string,
): boolean {
  const approved = approvedUsdcForNetwork(network);
  if (!approved) return false;
  try {
    return isAddressEqual(getAddress(asset), getAddress(approved));
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

  if (!isApprovedPaymentNetwork(requirement.network)) {
    reasonCodes.push("networkNotApproved");
    notes.push(
      `network "${requirement.network}" ∉ approved [${APPROVED_PAYMENT_NETWORKS.join(", ")}]`,
    );
  }

  if (!assetMatchesOfferNetwork(requirement.asset, requirement.network)) {
    reasonCodes.push("assetNotApprovedUsdcForNetwork");
    const expected = approvedUsdcForNetwork(requirement.network);
    notes.push(
      expected
        ? `asset ${requirement.asset} ≠ approved USDC ${expected} for ${requirement.network} (cross-network substitution rejected)`
        : `asset ${requirement.asset} cannot be validated — network not approved`,
    );
  }

  const transferMethod = requirement.assetTransferMethod;
  if (transferMethod != null) {
    if (!isApprovedAssetTransferMethod(transferMethod)) {
      reasonCodes.push("unsupportedTransferMethod");
      notes.push(
        `assetTransferMethod "${transferMethod}" is not an approved exact/EVM method`,
      );
    } else {
      notes.push(`assetTransferMethod=${transferMethod}`);
    }
  } else {
    notes.push(
      "assetTransferMethod absent — exact/EVM default eip3009 assumed for shape only; not a live facilitator grant",
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
      `declared task "${declared}" is not ${MVP_TASK_ID} — hire binding only; not required for offer discovery`,
    );
  } else if (!declared) {
    reasonCodes.push("taskNotBound");
    notes.push(
      `no verified binding to ${MVP_TASK_ID}; task schema not required for x402 seller discovery / structural eligibility`,
    );
  }

  if (options.expectedResource) {
    if (requirement.resource !== options.expectedResource) {
      notes.push(
        `resource "${requirement.resource ?? "null"}" ≠ expected "${options.expectedResource}"`,
      );
    }
  }

  // Offline path never proves a live facilitator — informational, non-blocking.
  reasonCodes.push("facilitatorCompatibilityUnverified");
  notes.push(
    "facilitator compatibility not live-verified (offline / NO_LIVE_PAYMENT)",
  );

  const blocking = reasonCodes.filter(
    (code) =>
      code !== "taskNotBound" &&
      code !== "paymentApprovalRequired" &&
      code !== "paymentApprovalNotGranted" &&
      code !== "structurallyCompatible" &&
      code !== "facilitatorCompatibilityUnverified" &&
      code !== "multipleAlternativesEvaluated",
  );

  // Structural: scheme / approved network / matching USDC / amount / payTo / transfer method.
  const structurallyCompatible = blocking.length === 0;

  if (structurallyCompatible) {
    reasonCodes.push("structurallyCompatible");
    const usdc = APPROVED_USDC_BY_NETWORK[
      requirement.network as keyof typeof APPROVED_USDC_BY_NETWORK
    ];
    notes.push(
      `Offer matches approved x402 v2 exact / ${requirement.network} / USDC ${usdc} shape`,
    );
  }

  reasonCodes.push("paymentApprovalRequired");
  const paymentApprovalGranted = options.paymentApprovalGranted === true;
  if (!paymentApprovalGranted) {
    reasonCodes.push("paymentApprovalNotGranted");
    notes.push("Payment approval not granted — refuse signing/settlement");
  }

  // D8.7: task schema is NOT required for policyPass on offer eligibility.
  const policyPass =
    structurallyCompatible && paymentApprovalGranted ? true : false;

  return {
    index,
    requirement,
    structurallyCompatible,
    policyPass,
    reasonCodes,
    notes: notes.join("; "),
  };
}

function baseResultFields(paymentApprovalGranted: boolean) {
  return {
    policyVersion: OFFER_POLICY_VERSION,
    approvedNetworks: APPROVED_PAYMENT_NETWORKS,
    approvedUsdcByNetwork: APPROVED_USDC_BY_NETWORK,
    approvedNetwork: APPROVED_PAYMENT_NETWORK,
    approvedAsset: APPROVED_SEPOLIA_TEST_USDC,
    approvedScheme: APPROVED_X402_SCHEME,
    approvedX402Version: APPROVED_X402_VERSION,
    mvpTaskId: MVP_TASK_ID,
    paymentApprovalGranted,
  } as const;
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
      ...baseResultFields(paymentApprovalGranted),
      parseOk: false,
      fixtureKind: "none",
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
      ...baseResultFields(paymentApprovalGranted),
      parseOk: false,
      fixtureKind: parseResult.fixtureKind,
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
    ...baseResultFields(paymentApprovalGranted),
    parseOk: true,
    fixtureKind: parseResult.fixtureKind,
    evaluations,
    anyStructurallyCompatible,
    anyPolicyPass,
    notes: anyPolicyPass
      ? "At least one offer passes policy including explicit payment approval"
      : anyStructurallyCompatible
        ? "At least one offer is structurally compatible on an approved network; payment approval still required (facilitator not live-verified)"
        : "No offer satisfies approved dual-network payment shape (network+matching USDC+scheme+amount+payTo)",
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
    ...baseResultFields(input.paymentApprovalGranted === true),
    parseOk: false,
    fixtureKind: "none",
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

/**
 * D8.2-B Task B — mechanism decision rule + recorded choice.
 */

import {
  evaluateX402DelegatedPaymentCompatibility,
  type CompatibilityReport,
} from "./compatibility.ts";

export const PAYMENT_DECISION_VERSION = "1.0" as const;

export type ChosenMechanism = "optionA-erc7710" | "optionB-permit2" | "none";

export type PaymentMechanismDecision = {
  readonly version: typeof PAYMENT_DECISION_VERSION;
  readonly chosen: ChosenMechanism;
  readonly assetTransferMethod: "erc7710" | "permit2" | null;
  readonly rule: readonly string[];
  readonly rationale: readonly string[];
  readonly compatibility: CompatibilityReport;
  readonly offlineScope: "local-evm-mock-facilitator";
  readonly liveFacilitatorProven: false;
};

/**
 * Decision rule (ordered):
 * 1. Mechanism must appear in x402 exact/EVM AssetTransferMethod table.
 * 2. Prefer native multi-use + spending-limit caveats for contract-enforced delegated budget.
 * 3. If neither supports contract-enforced multi-payment budget without inventing a parallel protocol → none (blocker).
 * 4. Missing third-party packages is NOT a protocol incompatibility — local minimal semantics OK for offline POC.
 */
export function decideDelegatedPaymentMechanism(): PaymentMechanismDecision {
  const compatibility = evaluateX402DelegatedPaymentCompatibility();
  const rule = [
    "Must be an official exact/EVM AssetTransferMethod (eip3009|permit2|erc7710)",
    "Prefer native multi-use spending caveats for contract-enforced delegated budget",
    "Reject off-chain-only budget checks as FAIL-class (not contract-enforced)",
    "Missing MetaMask/Permit2 packages → implement minimal local semantics; do not invent a non-x402 transfer method",
  ] as const;

  if (
    compatibility.optionA.inExactEvmSpec &&
    compatibility.optionA.multiUseNative &&
    compatibility.optionA.spendingLimitNative
  ) {
    return {
      version: PAYMENT_DECISION_VERSION,
      chosen: "optionA-erc7710",
      assetTransferMethod: "erc7710",
      rule,
      rationale: [
        "ERC-7710 is in the published exact/EVM scheme with multi-use + caveat semantics",
        "Permit2 is one-time per signature — weaker fit for autonomous multi-payment spending limits",
        "Offline POC will use a minimal local DelegationManager matching the erc7710 payload shape",
      ],
      compatibility,
      offlineScope: "local-evm-mock-facilitator",
      liveFacilitatorProven: false,
    };
  }

  if (compatibility.optionB.inExactEvmSpec) {
    return {
      version: PAYMENT_DECISION_VERSION,
      chosen: "optionB-permit2",
      assetTransferMethod: "permit2",
      rule,
      rationale: [
        "Fallback only — Permit2 lacks native multi-use spending caveats",
      ],
      compatibility,
      offlineScope: "local-evm-mock-facilitator",
      liveFacilitatorProven: false,
    };
  }

  return {
    version: PAYMENT_DECISION_VERSION,
    chosen: "none",
    assetTransferMethod: null,
    rule,
    rationale: [
      "Neither Option A nor Option B is protocol-compatible — stop; do not invent",
    ],
    compatibility,
    offlineScope: "local-evm-mock-facilitator",
    liveFacilitatorProven: false,
  };
}

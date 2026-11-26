/**
 * D8.2-B Task A — x402 exact/EVM compatibility evaluation.
 *
 * Sources (read-only GitHub spec fetch, offline thereafter):
 * - https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md
 * - https://github.com/x402-foundation/x402
 *
 * STRICTLY_OFFLINE after evaluation. No facilitator/RPC calls.
 */

export const X402_COMPAT_EVAL_VERSION = "1.0" as const;

export type AssetTransferMethodId = "eip3009" | "permit2" | "erc7710";

export type MechanismCompatibility = {
  readonly method: AssetTransferMethodId | "optionA-erc7710" | "optionB-permit2";
  readonly inExactEvmSpec: boolean;
  readonly assetTransferMethodValue: "erc7710" | "permit2" | null;
  readonly multiUseNative: boolean;
  readonly spendingLimitNative: boolean;
  readonly facilitatorPayloadFields: readonly string[];
  readonly depsAvailableLocally: boolean;
  readonly blocker: string | null;
  readonly notes: readonly string[];
};

export type CompatibilityReport = {
  readonly version: typeof X402_COMPAT_EVAL_VERSION;
  readonly evaluatedAt: "offline-spec-read";
  readonly exactEvmMethods: readonly AssetTransferMethodId[];
  readonly optionA: MechanismCompatibility;
  readonly optionB: MechanismCompatibility;
  readonly eitherCompatible: boolean;
  readonly preferredForContractEnforcedBudget: "optionA-erc7710" | "optionB-permit2" | "none";
  readonly verifiedFacts: readonly string[];
  readonly assumptions: readonly string[];
};

/**
 * Evaluate Options A (ERC-7710) vs B (Permit2) against the published exact/EVM scheme.
 */
export function evaluateX402DelegatedPaymentCompatibility(): CompatibilityReport {
  const optionA: MechanismCompatibility = {
    method: "optionA-erc7710",
    inExactEvmSpec: true,
    assetTransferMethodValue: "erc7710",
    multiUseNative: true,
    spendingLimitNative: true,
    facilitatorPayloadFields: [
      "delegationManager",
      "permissionContext",
      "delegator",
    ],
    // No MetaMask Delegation Framework / @x402 packages in lockfile — local minimal semantics only.
    depsAvailableLocally: false,
    blocker: null,
    notes: [
      "exact/EVM §3 defines assetTransferMethod=erc7710 with redeemDelegations settlement",
      "Caveats can encode amount/recipient limits — native fit for multi-payment spending policy",
      "Verification is simulation of redeemDelegations (no trusted manager list required by spec)",
      "Full MetaMask Delegation Framework is NOT a workspace dependency — POC uses minimal local manager",
    ],
  };

  const optionB: MechanismCompatibility = {
    method: "optionB-permit2",
    inExactEvmSpec: true,
    assetTransferMethodValue: "permit2",
    multiUseNative: false,
    spendingLimitNative: false,
    facilitatorPayloadFields: ["signature", "permit2Authorization"],
    depsAvailableLocally: false,
    blocker: null,
    notes: [
      "exact/EVM §2 defines assetTransferMethod=permit2 with x402ExactPermit2Proxy.settle",
      "Usage semantics are one-time per signature — multi-payment budget is not native to Permit2",
      "Canonical Permit2 + x402ExactPermit2Proxy bytecode/addresses are not in workspace deps",
      "A separate spending-policy contract could gate permit minting, but that is AgentHire-invented layering, not x402-native multi-use",
    ],
  };

  return {
    version: X402_COMPAT_EVAL_VERSION,
    evaluatedAt: "offline-spec-read",
    exactEvmMethods: ["eip3009", "permit2", "erc7710"],
    optionA,
    optionB,
    eitherCompatible: true,
    preferredForContractEnforcedBudget: "optionA-erc7710",
    verifiedFacts: [
      "x402 exact/EVM documents three AssetTransferMethods: eip3009 (default), permit2, erc7710",
      "erc7710 payload requires delegationManager + permissionContext + delegator",
      "permit2 payload requires signature + permit2Authorization with proxy as spender",
      "eip3009 is recommended for USDC but is one-time and has no multi-use spending caveats",
      "Workspace lockfile has viem only — no @x402/*, Permit2, or Delegation Framework packages",
    ],
    assumptions: [
      "Public facilitators that advertise erc7710 will accept the payload shape from the published spec (not live-proven here)",
      "A minimal local DelegationManager that enforces remaining-budget caveats is sufficient to demonstrate contract-enforced limits offline",
      "Synthetic permissionContext (non-ECDSA) is acceptable under NO_REAL_WALLET_SIGNING for this offline POC",
    ],
  };
}

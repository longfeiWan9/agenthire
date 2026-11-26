/**
 * Single offline payment path — success and over-limit failure share this function.
 *
 * STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_REAL_WALLET_SIGNING / NO_LIVE_FACILITATOR
 */

import { MVP_TASK_ID } from "../x402/challenge-types.ts";
import { decideDelegatedPaymentMechanism } from "./decision.ts";
import {
  createDelegation,
  deployDelegationManager,
  encodePermissionContext,
  LOCAL_TEST_USDC,
  remainingSpend,
  type DelegationManager,
  type PermissionContext,
} from "./delegation-manager.ts";
import {
  settleErc7710Payment,
  verifyErc7710Payment,
} from "./facilitator-mock.ts";
import {
  balanceOf,
  createLocalEvm,
  mintToken,
  TEST_ACCOUNTS,
  type LocalEvmState,
} from "./local-evm.ts";
import {
  buildErc7710PaymentPayload,
  buildWalletActivityPaymentRequired,
  encodePaymentRequiredHeader,
  type ExactErc7710PaymentPayload,
} from "./x402-fixture.ts";

export const PAYMENT_PATH_VERSION = "1.0" as const;
export const PAYMENT_PATH_MODE =
  "STRICTLY_OFFLINE / LOCAL_EVM / MOCK_FACILITATOR / NO_REAL_WALLET_SIGNING" as const;

export const DEFAULT_SPENDING_LIMIT = 10_000n; // 0.01 USDC (6 decimals) labeled atomic
export const DEFAULT_DELEGATOR_BALANCE = 1_000_000n;
export const DEFAULT_DELEGATION_ID = "dlg-wallet-activity-001" as const;

export type PaymentAttemptOutcome =
  | "settled"
  | "rejected_spending_limit"
  | "rejected_other"
  | "mechanism_unavailable";

export type LocalPaymentAttemptResult = {
  readonly mode: typeof PAYMENT_PATH_MODE;
  readonly taskId: typeof MVP_TASK_ID;
  readonly assetTransferMethod: "erc7710" | null;
  readonly amountAtomic: bigint;
  readonly spendingLimitAtomic: bigint;
  readonly remainingBefore: bigint | null;
  readonly remainingAfter: bigint | null;
  readonly outcome: PaymentAttemptOutcome;
  readonly reason: string | null;
  readonly txHash: string | null;
  readonly verifyOk: boolean;
  readonly settleOk: boolean;
  readonly liveFacilitator: false;
  readonly livePayment: false;
  readonly paymentRequiredHeaderB64: string;
  readonly payload: ExactErc7710PaymentPayload | null;
};

export type LocalPaymentWorld = {
  readonly evm: LocalEvmState;
  readonly manager: DelegationManager;
  readonly permissionContext: PermissionContext;
  readonly spendingLimitAtomic: bigint;
  readonly delegationId: string;
};

/**
 * Bootstrap local EVM: mint USDC to delegator, deploy manager, create capped delegation.
 */
export function bootstrapLocalPaymentWorld(input?: {
  readonly spendingLimitAtomic?: bigint;
  readonly delegatorBalance?: bigint;
  readonly delegationId?: string;
}): LocalPaymentWorld {
  const spendingLimitAtomic = input?.spendingLimitAtomic ?? DEFAULT_SPENDING_LIMIT;
  const delegatorBalance = input?.delegatorBalance ?? DEFAULT_DELEGATOR_BALANCE;
  const delegationId = input?.delegationId ?? DEFAULT_DELEGATION_ID;

  const evm = createLocalEvm();
  mintToken(evm, LOCAL_TEST_USDC, TEST_ACCOUNTS.delegator, delegatorBalance);
  const manager = deployDelegationManager(evm);
  const record = createDelegation({
    manager,
    delegator: TEST_ACCOUNTS.delegator,
    delegate: TEST_ACCOUNTS.facilitator,
    asset: LOCAL_TEST_USDC,
    maxSpend: spendingLimitAtomic,
    allowedPayTo: TEST_ACCOUNTS.payTo,
    delegationId,
  });

  return {
    evm,
    manager,
    permissionContext: encodePermissionContext(record),
    spendingLimitAtomic,
    delegationId,
  };
}

/**
 * Same path for within-limit success and over-limit failure.
 */
export function attemptLocalDelegatedPayment(
  world: LocalPaymentWorld,
  amountAtomic: bigint,
): LocalPaymentAttemptResult {
  const decision = decideDelegatedPaymentMechanism();
  const paymentRequired = buildWalletActivityPaymentRequired({
    amountAtomic,
  });
  const headerB64 = encodePaymentRequiredHeader(paymentRequired);

  const base = {
    mode: PAYMENT_PATH_MODE,
    taskId: MVP_TASK_ID,
    spendingLimitAtomic: world.spendingLimitAtomic,
    liveFacilitator: false as const,
    livePayment: false as const,
    paymentRequiredHeaderB64: headerB64,
  };

  if (decision.chosen !== "optionA-erc7710" || !decision.assetTransferMethod) {
    return {
      ...base,
      assetTransferMethod: null,
      amountAtomic,
      remainingBefore: remainingSpend(world.manager, world.delegationId),
      remainingAfter: remainingSpend(world.manager, world.delegationId),
      outcome: "mechanism_unavailable",
      reason: "no compatible contract-enforced delegated mechanism",
      txHash: null,
      verifyOk: false,
      settleOk: false,
      payload: null,
    };
  }

  const remainingBefore = remainingSpend(world.manager, world.delegationId);
  const payload = buildErc7710PaymentPayload({
    amountAtomic,
    permissionContext: world.permissionContext,
  });

  const verified = verifyErc7710Payment(world.evm, payload);
  if (!verified.ok) {
    const outcome: PaymentAttemptOutcome =
      verified.reason === "SPENDING_LIMIT_EXCEEDED"
        ? "rejected_spending_limit"
        : "rejected_other";
    return {
      ...base,
      assetTransferMethod: "erc7710",
      amountAtomic,
      remainingBefore,
      remainingAfter: remainingSpend(world.manager, world.delegationId),
      outcome,
      reason: verified.reason,
      txHash: null,
      verifyOk: false,
      settleOk: false,
      payload,
    };
  }

  const settled = settleErc7710Payment(world.evm, payload);
  if (!settled.ok) {
    const outcome: PaymentAttemptOutcome =
      settled.reason === "SPENDING_LIMIT_EXCEEDED"
        ? "rejected_spending_limit"
        : "rejected_other";
    return {
      ...base,
      assetTransferMethod: "erc7710",
      amountAtomic,
      remainingBefore,
      remainingAfter: remainingSpend(world.manager, world.delegationId),
      outcome,
      reason: settled.reason,
      txHash: settled.txHash,
      verifyOk: true,
      settleOk: false,
      payload,
    };
  }

  return {
    ...base,
    assetTransferMethod: "erc7710",
    amountAtomic,
    remainingBefore,
    remainingAfter: settled.remainingSpend,
    outcome: "settled",
    reason: null,
    txHash: settled.txHash,
    verifyOk: true,
    settleOk: true,
    payload,
  };
}

export function worldBalances(world: LocalPaymentWorld): {
  readonly delegator: bigint;
  readonly payTo: bigint;
} {
  return {
    delegator: balanceOf(world.evm, LOCAL_TEST_USDC, TEST_ACCOUNTS.delegator),
    payTo: balanceOf(world.evm, LOCAL_TEST_USDC, TEST_ACCOUNTS.payTo),
  };
}

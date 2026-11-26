/**
 * Minimal marketplace payment adapter for D8.2-B.
 *
 * Wires wallet-activity-summary@1.0 to the offline local payment path.
 * No UI. Does not raise evidence ladder. Does not authorize live payment.
 */

import { MVP_TASK_ID } from "../x402/challenge-types.ts";
import {
  attemptLocalDelegatedPayment,
  bootstrapLocalPaymentWorld,
  type LocalPaymentAttemptResult,
  type LocalPaymentWorld,
} from "./payment-path.ts";
import { decideDelegatedPaymentMechanism } from "./decision.ts";

export const MARKETPLACE_PAYMENT_ADAPTER_VERSION = "1.0" as const;
export const MARKETPLACE_PAYMENT_ADAPTER_MODE =
  "OFFLINE_LOCAL_PAYMENT_POC / NO_LIVE_PAYMENT / NO_UI" as const;

export type MarketplacePaymentAdapterView = {
  readonly adapterVersion: typeof MARKETPLACE_PAYMENT_ADAPTER_VERSION;
  readonly mode: typeof MARKETPLACE_PAYMENT_ADAPTER_MODE;
  readonly taskId: typeof MVP_TASK_ID;
  readonly mechanism: "optionA-erc7710" | "optionB-permit2" | "none";
  readonly assetTransferMethod: "erc7710" | "permit2" | null;
  readonly livePaymentAuthorized: false;
  readonly liveFacilitatorProven: false;
  readonly notes: readonly string[];
};

export function describeMarketplacePaymentAdapter(): MarketplacePaymentAdapterView {
  const decision = decideDelegatedPaymentMechanism();
  return {
    adapterVersion: MARKETPLACE_PAYMENT_ADAPTER_VERSION,
    mode: MARKETPLACE_PAYMENT_ADAPTER_MODE,
    taskId: MVP_TASK_ID,
    mechanism: decision.chosen,
    assetTransferMethod: decision.assetTransferMethod,
    livePaymentAuthorized: false,
    liveFacilitatorProven: false,
    notes: [
      "Offline POC only — does not contact providers or facilitators",
      "D8.1 marketplace UX unchanged; this adapter is a code-level payment hook",
      "Evidence ladder not raised by local settlement",
    ],
  };
}

export type MarketplaceLocalPaymentDemo = {
  readonly adapter: MarketplacePaymentAdapterView;
  readonly world: LocalPaymentWorld;
  readonly success: LocalPaymentAttemptResult;
  readonly overLimit: LocalPaymentAttemptResult;
};

/**
 * Run success (within limit) then over-limit failure on the same payment path.
 */
export function runMarketplaceLocalPaymentDemo(input?: {
  readonly withinLimitAmount?: bigint;
  readonly overLimitAmount?: bigint;
  readonly spendingLimitAtomic?: bigint;
}): MarketplaceLocalPaymentDemo {
  const spendingLimitAtomic = input?.spendingLimitAtomic ?? 10_000n;
  const withinLimitAmount = input?.withinLimitAmount ?? 2_500n;
  const overLimitAmount =
    input?.overLimitAmount ?? spendingLimitAtomic + 1n;

  const world = bootstrapLocalPaymentWorld({ spendingLimitAtomic });
  const success = attemptLocalDelegatedPayment(world, withinLimitAmount);
  const overLimit = attemptLocalDelegatedPayment(world, overLimitAmount);

  return {
    adapter: describeMarketplacePaymentAdapter(),
    world,
    success,
    overLimit,
  };
}

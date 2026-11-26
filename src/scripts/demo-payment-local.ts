/**
 * D8.2-B local delegated payment demo.
 *
 * pnpm demo:payment:local
 *
 * STRICTLY_OFFLINE — local in-memory EVM + mock facilitator only.
 * NO_PROVIDER_NETWORK / NO_REAL_WALLET_SIGNING / NO_LIVE_PAYMENT.
 */

import {
  decideDelegatedPaymentMechanism,
  runMarketplaceLocalPaymentDemo,
  worldBalances,
  PAYMENT_PATH_MODE,
} from "../payment/index.ts";

export type DemoPaymentLocalReport = {
  readonly mode: typeof PAYMENT_PATH_MODE;
  readonly ok: boolean;
  readonly lines: readonly string[];
};

export function runDemoPaymentLocal(): DemoPaymentLocalReport {
  const lines: string[] = [];
  lines.push("AgentHire D8.2-B — Local Contract-Enforced x402 Payment POC");
  lines.push(`mode=${PAYMENT_PATH_MODE}`);
  lines.push("NO_PROVIDER_NETWORK / NO_REAL_WALLET_SIGNING / NO_LIVE_FACILITATOR");
  lines.push("");

  const decision = decideDelegatedPaymentMechanism();
  lines.push(`mechanism=${decision.chosen} method=${String(decision.assetTransferMethod)}`);
  lines.push(`liveFacilitatorProven=${decision.liveFacilitatorProven}`);
  for (const r of decision.rationale) {
    lines.push(`  rationale: ${r}`);
  }
  lines.push("");

  const demo = runMarketplaceLocalPaymentDemo({
    spendingLimitAtomic: 10_000n,
    withinLimitAmount: 2_500n,
    overLimitAmount: 10_001n,
  });

  lines.push(
    `adapter taskId=${demo.adapter.taskId} livePaymentAuthorized=${demo.adapter.livePaymentAuthorized}`,
  );
  lines.push(
    `spendingLimitAtomic=${demo.world.spendingLimitAtomic.toString()} delegationId=${demo.world.delegationId}`,
  );
  lines.push("");

  lines.push("--- SUCCESS path (within limit) ---");
  lines.push(
    `outcome=${demo.success.outcome} amount=${demo.success.amountAtomic.toString()} remainingBefore=${String(demo.success.remainingBefore)} remainingAfter=${String(demo.success.remainingAfter)}`,
  );
  lines.push(
    `verifyOk=${demo.success.verifyOk} settleOk=${demo.success.settleOk} txHash=${String(demo.success.txHash)}`,
  );

  lines.push("");
  lines.push("--- FAILURE path (over limit, SAME attemptLocalDelegatedPayment) ---");
  lines.push(
    `outcome=${demo.overLimit.outcome} amount=${demo.overLimit.amountAtomic.toString()} reason=${String(demo.overLimit.reason)} remainingAfter=${String(demo.overLimit.remainingAfter)}`,
  );
  lines.push(
    `verifyOk=${demo.overLimit.verifyOk} settleOk=${demo.overLimit.settleOk}`,
  );

  const balances = worldBalances(demo.world);
  lines.push("");
  lines.push(
    `balances delegator=${balances.delegator.toString()} payTo=${balances.payTo.toString()}`,
  );
  lines.push(
    "NOTE: LOCAL SETTLEMENT ONLY — NOT A LIVE x402 FACILITATOR OR CHAIN PAYMENT",
  );

  const ok =
    demo.success.outcome === "settled" &&
    demo.success.settleOk &&
    demo.overLimit.outcome === "rejected_spending_limit" &&
    !demo.overLimit.settleOk &&
    decision.chosen === "optionA-erc7710";

  lines.push("");
  lines.push(ok ? "DEMO RESULT: PASS" : "DEMO RESULT: FAIL");

  return { mode: PAYMENT_PATH_MODE, ok, lines };
}

function main(): void {
  const report = runDemoPaymentLocal();
  for (const line of report.lines) {
    console.log(line);
  }
  if (!report.ok) {
    process.exitCode = 1;
  }
}

const isDirect =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  (process.argv[1].endsWith("demo-payment-local.ts") ||
    process.argv[1].endsWith("demo-payment-local.js"));

if (isDirect) {
  main();
}

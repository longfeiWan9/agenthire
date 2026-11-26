/**
 * D8.2-B — local contract-enforced x402 delegated payment POC tests.
 */

import { describe, expect, it } from "vitest";
import {
  attemptLocalDelegatedPayment,
  bootstrapLocalPaymentWorld,
  decideDelegatedPaymentMechanism,
  describeMarketplacePaymentAdapter,
  evaluateX402DelegatedPaymentCompatibility,
  runMarketplaceLocalPaymentDemo,
  worldBalances,
  TEST_ACCOUNTS,
  LOCAL_TEST_USDC,
  createDelegation,
  deployDelegationManager,
  encodePermissionContext,
  redeemDelegations,
  createLocalEvm,
  mintToken,
  balanceOf,
  buildWalletActivityPaymentRequired,
  encodePaymentRequiredHeader,
} from "../src/payment/index.ts";
import { runDemoPaymentLocal } from "../src/scripts/demo-payment-local.ts";
import { parseHttp402Challenge } from "../src/x402/challenge-parser.ts";
import { MVP_TASK_ID } from "../src/x402/challenge-types.ts";

describe("D8.2-B compatibility + decision", () => {
  it("finds both Option A and B in exact/EVM and prefers ERC-7710 for budgets", () => {
    const report = evaluateX402DelegatedPaymentCompatibility();
    expect(report.exactEvmMethods).toEqual(["eip3009", "permit2", "erc7710"]);
    expect(report.optionA.inExactEvmSpec).toBe(true);
    expect(report.optionB.inExactEvmSpec).toBe(true);
    expect(report.optionA.multiUseNative).toBe(true);
    expect(report.optionB.multiUseNative).toBe(false);
    expect(report.preferredForContractEnforcedBudget).toBe("optionA-erc7710");
    expect(report.eitherCompatible).toBe(true);
  });

  it("decides Option A erc7710 with liveFacilitatorProven=false", () => {
    const decision = decideDelegatedPaymentMechanism();
    expect(decision.chosen).toBe("optionA-erc7710");
    expect(decision.assetTransferMethod).toBe("erc7710");
    expect(decision.liveFacilitatorProven).toBe(false);
  });
});

describe("D8.2-B local EVM spending policy", () => {
  it("enforces spending limit on-contract (over-limit reverts)", () => {
    const evm = createLocalEvm();
    mintToken(evm, LOCAL_TEST_USDC, TEST_ACCOUNTS.delegator, 1_000_000n);
    const mgr = deployDelegationManager(evm);
    const record = createDelegation({
      manager: mgr,
      delegator: TEST_ACCOUNTS.delegator,
      delegate: TEST_ACCOUNTS.facilitator,
      asset: LOCAL_TEST_USDC,
      maxSpend: 5_000n,
      allowedPayTo: TEST_ACCOUNTS.payTo,
      delegationId: "dlg-test-limit",
    });
    const ctx = encodePermissionContext(record);

    const ok = redeemDelegations(
      evm,
      mgr.address,
      TEST_ACCOUNTS.facilitator,
      ctx,
      { asset: LOCAL_TEST_USDC, payTo: TEST_ACCOUNTS.payTo, amount: 4_000n },
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.remainingSpend).toBe(1_000n);

    const over = redeemDelegations(
      evm,
      mgr.address,
      TEST_ACCOUNTS.facilitator,
      ctx,
      { asset: LOCAL_TEST_USDC, payTo: TEST_ACCOUNTS.payTo, amount: 1_001n },
    );
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.revertReason).toBe("SPENDING_LIMIT_EXCEEDED");
    expect(balanceOf(evm, LOCAL_TEST_USDC, TEST_ACCOUNTS.payTo)).toBe(4_000n);
  });

  it("rejects unauthorized payTo and outsider caller", () => {
    const evm = createLocalEvm();
    mintToken(evm, LOCAL_TEST_USDC, TEST_ACCOUNTS.delegator, 100_000n);
    const mgr = deployDelegationManager(evm);
    const record = createDelegation({
      manager: mgr,
      delegator: TEST_ACCOUNTS.delegator,
      delegate: TEST_ACCOUNTS.facilitator,
      asset: LOCAL_TEST_USDC,
      maxSpend: 10_000n,
      allowedPayTo: TEST_ACCOUNTS.payTo,
      delegationId: "dlg-auth",
    });
    const ctx = encodePermissionContext(record);

    const badPayTo = redeemDelegations(
      evm,
      mgr.address,
      TEST_ACCOUNTS.facilitator,
      ctx,
      {
        asset: LOCAL_TEST_USDC,
        payTo: TEST_ACCOUNTS.outsider,
        amount: 100n,
      },
    );
    expect(badPayTo.ok).toBe(false);
    if (!badPayTo.ok) expect(badPayTo.revertReason).toBe("PAYTO_NOT_ALLOWED");

    const badCaller = redeemDelegations(
      evm,
      mgr.address,
      TEST_ACCOUNTS.outsider,
      ctx,
      { asset: LOCAL_TEST_USDC, payTo: TEST_ACCOUNTS.payTo, amount: 100n },
    );
    expect(badCaller.ok).toBe(false);
    if (!badCaller.ok) {
      expect(badCaller.revertReason).toBe("DELEGATE_NOT_AUTHORIZED");
    }
  });
});

describe("D8.2-B payment path + x402 fixture", () => {
  it("builds parseable PaymentRequired with erc7710 extra", () => {
    const body = buildWalletActivityPaymentRequired({ amountAtomic: 2500n });
    expect(body.accepts[0].extra.assetTransferMethod).toBe("erc7710");
    const header = encodePaymentRequiredHeader(body);
    const parsed = parseHttp402Challenge({
      fixtureKind: "synthetic",
      httpStatus: 402,
      headers: { "PAYMENT-REQUIRED": header },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.challenge.accepts[0]?.network).toBe("eip155:84532");
      expect(parsed.challenge.accepts[0]?.amount).toBe("2500");
    }
  });

  it("same path: within-limit settles, over-limit rejects without spend", () => {
    const world = bootstrapLocalPaymentWorld({ spendingLimitAtomic: 10_000n });
    const success = attemptLocalDelegatedPayment(world, 2_500n);
    expect(success.outcome).toBe("settled");
    expect(success.settleOk).toBe(true);
    expect(success.remainingAfter).toBe(7_500n);
    expect(success.taskId).toBe(MVP_TASK_ID);
    expect(success.livePayment).toBe(false);

    const beforeOver = worldBalances(world);
    const over = attemptLocalDelegatedPayment(world, 10_001n);
    expect(over.outcome).toBe("rejected_spending_limit");
    expect(over.settleOk).toBe(false);
    expect(over.reason).toBe("SPENDING_LIMIT_EXCEEDED");
    expect(over.remainingAfter).toBe(7_500n);
    expect(worldBalances(world)).toEqual(beforeOver);
  });
});

describe("D8.2-B marketplace adapter + demo", () => {
  it("exposes minimal adapter without live payment auth", () => {
    const view = describeMarketplacePaymentAdapter();
    expect(view.taskId).toBe(MVP_TASK_ID);
    expect(view.livePaymentAuthorized).toBe(false);
    expect(view.mechanism).toBe("optionA-erc7710");
  });

  it("runMarketplaceLocalPaymentDemo success then over-limit", () => {
    const demo = runMarketplaceLocalPaymentDemo();
    expect(demo.success.outcome).toBe("settled");
    expect(demo.overLimit.outcome).toBe("rejected_spending_limit");
  });

  it("pnpm demo:payment:local report passes", () => {
    const report = runDemoPaymentLocal();
    expect(report.ok).toBe(true);
    expect(report.lines.some((l) => l.includes("DEMO RESULT: PASS"))).toBe(
      true,
    );
  });
});

/**
 * Offline x402 facilitator mock — verify + settle against local EVM.
 *
 * Implements the exact/EVM erc7710 verify (simulate) → settle path locally.
 * Does NOT contact any public facilitator. liveFacilitatorProven = false.
 */

import { getAddress } from "viem";
import {
  redeemDelegations,
  type PermissionContext,
} from "./delegation-manager.ts";
import { TEST_ACCOUNTS, type LocalEvmState } from "./local-evm.ts";
import type { ExactErc7710PaymentPayload } from "./x402-fixture.ts";
import { LOCAL_TEST_USDC } from "./delegation-manager.ts";

export const FACILITATOR_MOCK_VERSION = "1.0" as const;
export const FACILITATOR_MOCK_MODE =
  "OFFLINE_MOCK / NO_PROVIDER_NETWORK / NO_LIVE_FACILITATOR" as const;

export type FacilitatorVerifyResult =
  | {
      readonly ok: true;
      readonly simulated: true;
      readonly amount: bigint;
      readonly note: string;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly simulated: true;
    };

export type FacilitatorSettleResult =
  | {
      readonly ok: true;
      readonly settled: true;
      readonly txHash: string;
      readonly amount: bigint;
      readonly remainingSpend: bigint;
      readonly liveFacilitator: false;
    }
  | {
      readonly ok: false;
      readonly settled: false;
      readonly reason: string;
      readonly txHash: string | null;
      readonly liveFacilitator: false;
    };

function parseAmount(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function extractContext(
  payload: ExactErc7710PaymentPayload,
): PermissionContext | null {
  const ctx = payload.payload.permissionContext;
  if (
    !ctx ||
    typeof ctx.delegationId !== "string" ||
    typeof ctx.delegator !== "string" ||
    typeof ctx.proof !== "string"
  ) {
    return null;
  }
  return {
    delegationId: ctx.delegationId,
    delegator: getAddress(ctx.delegator),
    proof: ctx.proof,
  };
}

/**
 * Verify = simulate redeemDelegations without committing (dry-run on a fork of state).
 * For this minimal POC we run redeem on a shallow-cloned remainingSpend snapshot:
 * we validate fields then attempt redeem on a cloned caveat counter via settle-only path.
 * Spec: verification is simulation of redeemDelegations.
 *
 * Here: structural checks + balance/limit pre-check. Settlement performs the state change.
 */
export function verifyErc7710Payment(
  evm: LocalEvmState,
  payment: ExactErc7710PaymentPayload,
): FacilitatorVerifyResult {
  if (payment.accepted.extra.assetTransferMethod !== "erc7710") {
    return {
      ok: false,
      reason: "UNSUPPORTED_ASSET_TRANSFER_METHOD",
      simulated: true,
    };
  }
  if (payment.accepted.scheme !== "exact") {
    return { ok: false, reason: "UNSUPPORTED_SCHEME", simulated: true };
  }
  if (payment.accepted.network !== "eip155:84532") {
    return { ok: false, reason: "UNSUPPORTED_NETWORK", simulated: true };
  }

  const amount = parseAmount(payment.accepted.amount);
  if (amount === null || amount <= 0n) {
    return { ok: false, reason: "INVALID_AMOUNT", simulated: true };
  }

  const ctx = extractContext(payment);
  if (!ctx) {
    return { ok: false, reason: "INVALID_PERMISSION_CONTEXT", simulated: true };
  }

  // Dry-run: clone remainingSpend by calling redeem on a temporary fork of maps.
  // Minimal approach — attempt redeem then roll back is complex; instead run
  // redeemDelegations on a cloned manager remaining counter via settle simulation:
  // We encode simulation as a settle call against a cloned EVM balances+delegations.
  const sim = cloneEvmForSimulation(evm);
  const simResult = redeemDelegations(
    sim,
    getAddress(payment.payload.delegationManager),
    TEST_ACCOUNTS.facilitator,
    ctx,
    {
      asset: LOCAL_TEST_USDC,
      payTo: getAddress(payment.accepted.payTo),
      amount,
    },
  );

  if (!simResult.ok) {
    return { ok: false, reason: simResult.revertReason, simulated: true };
  }

  return {
    ok: true,
    simulated: true,
    amount,
    note: "local redeemDelegations simulation succeeded",
  };
}

export function settleErc7710Payment(
  evm: LocalEvmState,
  payment: ExactErc7710PaymentPayload,
): FacilitatorSettleResult {
  const verified = verifyErc7710Payment(evm, payment);
  if (!verified.ok) {
    return {
      ok: false,
      settled: false,
      reason: verified.reason,
      txHash: null,
      liveFacilitator: false,
    };
  }

  const amount = verified.amount;
  const ctx = extractContext(payment)!;
  const result = redeemDelegations(
    evm,
    getAddress(payment.payload.delegationManager),
    TEST_ACCOUNTS.facilitator,
    ctx,
    {
      asset: LOCAL_TEST_USDC,
      payTo: getAddress(payment.accepted.payTo),
      amount,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      settled: false,
      reason: result.revertReason,
      txHash: result.txHash,
      liveFacilitator: false,
    };
  }

  return {
    ok: true,
    settled: true,
    txHash: result.txHash,
    amount: result.amount,
    remainingSpend: result.remainingSpend,
    liveFacilitator: false,
  };
}

/** Shallow structural clone sufficient for remainingSpend / balance simulation. */
function cloneEvmForSimulation(evm: LocalEvmState): LocalEvmState {
  const balances = new Map<string, Map<string, bigint>>();
  for (const [token, holders] of evm.balances) {
    balances.set(token, new Map(holders));
  }

  // Deep-clone delegation managers' remainingSpend so simulation cannot mutate live state.
  const contracts = new Map<
    string,
    { readonly kind: string; readonly handle: unknown }
  >();
  for (const [addr, entry] of evm.contracts) {
    if (entry.kind === "DelegationManagerV1") {
      const src = entry.handle as {
        address: string;
        kind: string;
        delegations: Map<
          string,
          {
            id: string;
            delegator: string;
            active: boolean;
            caveat: {
              asset: string;
              maxSpend: bigint;
              remainingSpend: bigint;
              allowedPayTo: string;
              delegate: string;
            };
          }
        >;
      };
      const clonedDelegations = new Map();
      for (const [id, rec] of src.delegations) {
        clonedDelegations.set(id, {
          id: rec.id,
          delegator: rec.delegator,
          active: rec.active,
          caveat: { ...rec.caveat },
        });
      }
      contracts.set(addr, {
        kind: entry.kind,
        handle: {
          address: src.address,
          kind: src.kind,
          delegations: clonedDelegations,
        },
      });
    } else {
      contracts.set(addr, entry);
    }
  }

  return {
    mode: evm.mode,
    chainId: evm.chainId,
    balances,
    contracts,
    receipts: [],
    nextNonce: evm.nextNonce,
  };
}

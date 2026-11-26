/**
 * Minimal local ERC-7710-shaped DelegationManager + spending caveats.
 *
 * Matches x402 exact/EVM payload fields (delegationManager, permissionContext,
 * delegator) and redeemDelegations settlement shape. NOT the MetaMask framework.
 *
 * Contract-enforced: over-limit / wrong asset / wrong payTo REVERT on redeem.
 */

import { getAddress, type Address, type Hex } from "viem";
import {
  balanceOf,
  getContract,
  recordTx,
  registerContract,
  transferToken,
  type LocalEvmState,
} from "./local-evm.ts";

export const DELEGATION_MANAGER_KIND = "DelegationManagerV1" as const;
export const DELEGATION_MANAGER_ADDRESS = getAddress(
  "0x2000000000000000000000000000000000000077",
);

/** Canonical Sepolia test USDC address (labeling; local mock token uses same address). */
export const LOCAL_TEST_USDC = getAddress(
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
);

export type SpendingCaveat = {
  readonly asset: Address;
  readonly maxSpend: bigint;
  remainingSpend: bigint;
  readonly allowedPayTo: Address;
  readonly delegate: Address;
};

export type DelegationRecord = {
  readonly id: string;
  readonly delegator: Address;
  readonly active: boolean;
  caveat: SpendingCaveat;
};

export type PermissionContext = {
  readonly delegationId: string;
  readonly delegator: Address;
  /** Synthetic non-ECDSA proof marker for offline POC. */
  readonly proof: Hex;
};

export type RedeemResult =
  | {
      readonly ok: true;
      readonly txHash: Hex;
      readonly amount: bigint;
      readonly payTo: Address;
      readonly remainingSpend: bigint;
    }
  | {
      readonly ok: false;
      readonly revertReason: string;
      readonly txHash: Hex | null;
    };

export type DelegationManager = {
  readonly address: Address;
  readonly kind: typeof DELEGATION_MANAGER_KIND;
  delegations: Map<string, DelegationRecord>;
};

export function deployDelegationManager(evm: LocalEvmState): DelegationManager {
  const mgr: DelegationManager = {
    address: DELEGATION_MANAGER_ADDRESS,
    kind: DELEGATION_MANAGER_KIND,
    delegations: new Map(),
  };
  registerContract(evm, mgr.address, DELEGATION_MANAGER_KIND, mgr);
  return mgr;
}

export function createDelegation(input: {
  readonly manager: DelegationManager;
  readonly delegator: Address;
  readonly delegate: Address;
  readonly asset: Address;
  readonly maxSpend: bigint;
  readonly allowedPayTo: Address;
  readonly delegationId: string;
}): DelegationRecord {
  if (input.maxSpend <= 0n) {
    throw new Error("maxSpend must be > 0");
  }
  const record: DelegationRecord = {
    id: input.delegationId,
    delegator: getAddress(input.delegator),
    active: true,
    caveat: {
      asset: getAddress(input.asset),
      maxSpend: input.maxSpend,
      remainingSpend: input.maxSpend,
      allowedPayTo: getAddress(input.allowedPayTo),
      delegate: getAddress(input.delegate),
    },
  };
  input.manager.delegations.set(record.id, record);
  return record;
}

export function encodePermissionContext(
  record: DelegationRecord,
): PermissionContext {
  return {
    delegationId: record.id,
    delegator: record.delegator,
    // Synthetic proof — NOT a real wallet signature.
    proof: `0xSYNTHETIC_PERMISSION_${record.id}` as Hex,
  };
}

/**
 * Simulate/settle redeemDelegations for a single ERC-20 transfer execution.
 * Enforces remainingSpend / asset / payTo / active caveats on-contract.
 */
export function redeemDelegations(
  evm: LocalEvmState,
  managerAddress: Address,
  caller: Address,
  permissionContext: PermissionContext,
  execution: {
    readonly asset: Address;
    readonly payTo: Address;
    readonly amount: bigint;
  },
): RedeemResult {
  const mgr = getContract<DelegationManager>(
    evm,
    managerAddress,
    DELEGATION_MANAGER_KIND,
  );
  if (!mgr) {
    return { ok: false, revertReason: "UNKNOWN_DELEGATION_MANAGER", txHash: null };
  }

  const record = mgr.delegations.get(permissionContext.delegationId);
  if (!record || !record.active) {
    const receipt = recordTx(evm, {
      from: caller,
      to: managerAddress,
      success: false,
      revertReason: "DELEGATION_INACTIVE",
    });
    return { ok: false, revertReason: "DELEGATION_INACTIVE", txHash: receipt.txHash };
  }

  if (getAddress(permissionContext.delegator) !== record.delegator) {
    const receipt = recordTx(evm, {
      from: caller,
      to: managerAddress,
      success: false,
      revertReason: "DELEGATOR_MISMATCH",
    });
    return { ok: false, revertReason: "DELEGATOR_MISMATCH", txHash: receipt.txHash };
  }

  if (getAddress(caller) !== record.caveat.delegate) {
    const receipt = recordTx(evm, {
      from: caller,
      to: managerAddress,
      success: false,
      revertReason: "DELEGATE_NOT_AUTHORIZED",
    });
    return {
      ok: false,
      revertReason: "DELEGATE_NOT_AUTHORIZED",
      txHash: receipt.txHash,
    };
  }

  if (getAddress(execution.asset) !== record.caveat.asset) {
    const receipt = recordTx(evm, {
      from: caller,
      to: managerAddress,
      success: false,
      revertReason: "ASSET_NOT_ALLOWED",
    });
    return { ok: false, revertReason: "ASSET_NOT_ALLOWED", txHash: receipt.txHash };
  }

  if (getAddress(execution.payTo) !== record.caveat.allowedPayTo) {
    const receipt = recordTx(evm, {
      from: caller,
      to: managerAddress,
      success: false,
      revertReason: "PAYTO_NOT_ALLOWED",
    });
    return { ok: false, revertReason: "PAYTO_NOT_ALLOWED", txHash: receipt.txHash };
  }

  if (execution.amount <= 0n) {
    const receipt = recordTx(evm, {
      from: caller,
      to: managerAddress,
      success: false,
      revertReason: "AMOUNT_INVALID",
    });
    return { ok: false, revertReason: "AMOUNT_INVALID", txHash: receipt.txHash };
  }

  // Contract-enforced spending limit — this is the FAIL gate for over-limit.
  if (execution.amount > record.caveat.remainingSpend) {
    const receipt = recordTx(evm, {
      from: caller,
      to: managerAddress,
      success: false,
      revertReason: "SPENDING_LIMIT_EXCEEDED",
      logs: [
        `remaining=${record.caveat.remainingSpend.toString()}`,
        `requested=${execution.amount.toString()}`,
      ],
    });
    return {
      ok: false,
      revertReason: "SPENDING_LIMIT_EXCEEDED",
      txHash: receipt.txHash,
    };
  }

  if (balanceOf(evm, execution.asset, record.delegator) < execution.amount) {
    const receipt = recordTx(evm, {
      from: caller,
      to: managerAddress,
      success: false,
      revertReason: "ERC20_INSUFFICIENT_BALANCE",
    });
    return {
      ok: false,
      revertReason: "ERC20_INSUFFICIENT_BALANCE",
      txHash: receipt.txHash,
    };
  }

  const moved = transferToken(
    evm,
    execution.asset,
    record.delegator,
    execution.payTo,
    execution.amount,
  );
  if (!moved.ok) {
    const receipt = recordTx(evm, {
      from: caller,
      to: managerAddress,
      success: false,
      revertReason: moved.reason,
    });
    return { ok: false, revertReason: moved.reason, txHash: receipt.txHash };
  }

  record.caveat.remainingSpend -= execution.amount;
  const receipt = recordTx(evm, {
    from: caller,
    to: managerAddress,
    success: true,
    logs: [
      `spent=${execution.amount.toString()}`,
      `remaining=${record.caveat.remainingSpend.toString()}`,
      `payTo=${execution.payTo}`,
    ],
  });

  return {
    ok: true,
    txHash: receipt.txHash,
    amount: execution.amount,
    payTo: getAddress(execution.payTo),
    remainingSpend: record.caveat.remainingSpend,
  };
}

export function remainingSpend(
  manager: DelegationManager,
  delegationId: string,
): bigint | null {
  const record = manager.delegations.get(delegationId);
  return record ? record.caveat.remainingSpend : null;
}

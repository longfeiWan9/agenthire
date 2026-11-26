/**
 * Minimal deterministic in-memory EVM for D8.2-B offline POC.
 *
 * Not a full VM. Tracks balances, contract registry, and tx receipts.
 * NO_PROVIDER_NETWORK / NO_BLOCKCHAIN_RPC / NO_REAL_WALLET_SIGNING.
 */

import { getAddress, type Address, type Hex } from "viem";

export const LOCAL_EVM_CHAIN_ID = 84532 as const; // Base Sepolia id for labeling only
export const LOCAL_EVM_MODE =
  "IN_MEMORY / NO_RPC / NO_PROVIDER_NETWORK / NON_FUNDED_TEST_ACCOUNTS" as const;

/** Deterministic non-funded test addresses (not derived from embedded private keys). */
export const TEST_ACCOUNTS = {
  owner: getAddress("0x1000000000000000000000000000000000000001"),
  delegator: getAddress("0x1000000000000000000000000000000000000002"),
  facilitator: getAddress("0x1000000000000000000000000000000000000003"),
  payTo: getAddress("0x1000000000000000000000000000000000000004"),
  outsider: getAddress("0x1000000000000000000000000000000000000005"),
} as const;

export type LocalTxReceipt = {
  readonly txHash: Hex;
  readonly from: Address;
  readonly to: Address;
  readonly success: boolean;
  readonly revertReason: string | null;
  readonly logs: readonly string[];
};

export type LocalEvmState = {
  readonly mode: typeof LOCAL_EVM_MODE;
  readonly chainId: typeof LOCAL_EVM_CHAIN_ID;
  /** token => (holder => balance) */
  balances: Map<string, Map<string, bigint>>;
  contracts: Map<string, { readonly kind: string; readonly handle: unknown }>;
  receipts: LocalTxReceipt[];
  nextNonce: number;
};

function tokenKey(token: Address): string {
  return getAddress(token).toLowerCase();
}

function accountKey(account: Address): string {
  return getAddress(account).toLowerCase();
}

export function createLocalEvm(): LocalEvmState {
  return {
    mode: LOCAL_EVM_MODE,
    chainId: LOCAL_EVM_CHAIN_ID,
    balances: new Map(),
    contracts: new Map(),
    receipts: [],
    nextNonce: 1,
  };
}

export function mintToken(
  evm: LocalEvmState,
  token: Address,
  to: Address,
  amount: bigint,
): void {
  const tk = tokenKey(token);
  let holders = evm.balances.get(tk);
  if (!holders) {
    holders = new Map();
    evm.balances.set(tk, holders);
  }
  const ak = accountKey(to);
  holders.set(ak, (holders.get(ak) ?? 0n) + amount);
}

export function balanceOf(
  evm: LocalEvmState,
  token: Address,
  account: Address,
): bigint {
  return evm.balances.get(tokenKey(token))?.get(accountKey(account)) ?? 0n;
}

export function transferToken(
  evm: LocalEvmState,
  token: Address,
  from: Address,
  to: Address,
  amount: bigint,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const bal = balanceOf(evm, token, from);
  if (bal < amount) {
    return { ok: false, reason: "ERC20_INSUFFICIENT_BALANCE" };
  }
  const tk = tokenKey(token);
  const holders = evm.balances.get(tk)!;
  holders.set(accountKey(from), bal - amount);
  holders.set(
    accountKey(to),
    (holders.get(accountKey(to)) ?? 0n) + amount,
  );
  return { ok: true };
}

export function registerContract(
  evm: LocalEvmState,
  address: Address,
  kind: string,
  handle: unknown,
): Address {
  const addr = getAddress(address);
  evm.contracts.set(accountKey(addr), { kind, handle });
  return addr;
}

export function getContract<T>(
  evm: LocalEvmState,
  address: Address,
  kind: string,
): T | null {
  const entry = evm.contracts.get(accountKey(address));
  if (!entry || entry.kind !== kind) return null;
  return entry.handle as T;
}

export function recordTx(
  evm: LocalEvmState,
  input: {
    readonly from: Address;
    readonly to: Address;
    readonly success: boolean;
    readonly revertReason?: string | null;
    readonly logs?: readonly string[];
  },
): LocalTxReceipt {
  const nonce = evm.nextNonce;
  evm.nextNonce += 1;
  const txHash =
    `0x${nonce.toString(16).padStart(8, "0")}${"a".repeat(56)}` as Hex;
  const receipt: LocalTxReceipt = {
    txHash,
    from: getAddress(input.from),
    to: getAddress(input.to),
    success: input.success,
    revertReason: input.success ? null : (input.revertReason ?? "REVERT"),
    logs: input.logs ?? [],
  };
  evm.receipts.push(receipt);
  return receipt;
}

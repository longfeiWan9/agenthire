/**
 * AgentHire Base network configuration (D3.2 / D8.7).
 *
 * Discovery: Base Mainnet (8453) + Base Sepolia (84532)
 * Wallet activity analysis: Base Mainnet (8453), read-only
 * Future x402 payments: Base Mainnet + Base Sepolia (per-network USDC)
 *   — payment execution not enabled by network support alone (NO_LIVE_PAYMENT)
 *
 * Registry addresses verified against erc-8004-contracts @
 * b9e466c250744a7e06b13dff9d3c2844ed64f825 (README + scripts/addresses.ts).
 * No private RPC credentials. No clients — D3.3 owns transport.
 */

import type { Address, Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

export const BASE_MAINNET_CHAIN_ID = 8453 as const;
export const BASE_SEPOLIA_CHAIN_ID = 84532 as const;

/** Official ERC-8004 Identity Registry proxies (CREATE2 vanity). */
export const IDENTITY_REGISTRY_ADDRESSES = {
  baseMainnet: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  baseSepolia: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
} as const satisfies Record<string, Address>;

export type AgentHireNetworkPurpose =
  | "wallet-activity-analysis"
  | "erc8004-discovery"
  | "future-x402-payments";

export type AgentHireNetworkConfig = {
  readonly name: string;
  readonly chainId: typeof BASE_MAINNET_CHAIN_ID | typeof BASE_SEPOLIA_CHAIN_ID;
  readonly caip2: `eip155:${typeof BASE_MAINNET_CHAIN_ID | typeof BASE_SEPOLIA_CHAIN_ID}`;
  readonly chain: Chain;
  readonly identityRegistry: Address;
  readonly purposes: readonly AgentHireNetworkPurpose[];
};

export const baseMainnetNetwork = {
  name: "Base Mainnet",
  chainId: BASE_MAINNET_CHAIN_ID,
  caip2: "eip155:8453",
  chain: base,
  identityRegistry: IDENTITY_REGISTRY_ADDRESSES.baseMainnet,
  purposes: [
    "wallet-activity-analysis",
    "erc8004-discovery",
    "future-x402-payments",
  ],
} as const satisfies AgentHireNetworkConfig;

export const baseSepoliaNetwork = {
  name: "Base Sepolia",
  chainId: BASE_SEPOLIA_CHAIN_ID,
  caip2: "eip155:84532",
  chain: baseSepolia,
  identityRegistry: IDENTITY_REGISTRY_ADDRESSES.baseSepolia,
  purposes: ["erc8004-discovery", "future-x402-payments"],
} as const satisfies AgentHireNetworkConfig;

/** Lookup by chain id — keeps discovery vs payment networks distinct. */
export const agentHireNetworksByChainId = {
  [BASE_MAINNET_CHAIN_ID]: baseMainnetNetwork,
  [BASE_SEPOLIA_CHAIN_ID]: baseSepoliaNetwork,
} as const;

export const agentHireNetworks = [
  baseMainnetNetwork,
  baseSepoliaNetwork,
] as const;

/**
 * Agent-first identity keys and registration-network classification (D7.1).
 *
 * Canonical identity = registry + chain + registered agent ID.
 * Never merge profiles by display-name / URL resemblance.
 * STRICTLY_OFFLINE — presentation only; no network I/O.
 */

import type { AgentProfile, CapabilityRecord } from "./types.ts";

export const AGENT_IDENTITY_MODE =
  "STRICTLY_OFFLINE / NO_SIGNING / NO_PAYMENT" as const;

/** Registration network buckets (not payment networks). */
export type RegistrationNetworkId =
  | "base-mainnet"
  | "base-sepolia"
  | "other-evidenced"
  | "unknown";

export type RegistrationNetworkFilter =
  | RegistrationNetworkId
  | "all";

export type RegistrationNetworkInfo = {
  readonly id: RegistrationNetworkId;
  readonly label: string;
  /** Short chip text for cards. */
  readonly shortLabel: string;
  readonly chainId: number | null;
  readonly eip155: string | null;
  readonly environment: "mainnet" | "testnet" | "other" | "unknown";
  readonly note: string;
};

export const REGISTRATION_NETWORKS: readonly RegistrationNetworkInfo[] = [
  {
    id: "base-mainnet",
    label: "Base Mainnet (registration)",
    shortLabel: "Base Mainnet",
    chainId: 8453,
    eip155: "eip155:8453",
    environment: "mainnet",
    note: "ERC-8004 registration observed on Base Mainnet. Registration network ≠ payment network.",
  },
  {
    id: "base-sepolia",
    label: "Base Sepolia (registration)",
    shortLabel: "Base Sepolia",
    chainId: 84532,
    eip155: "eip155:84532",
    environment: "testnet",
    note: "ERC-8004 registration observed on Base Sepolia testnet. Registration network ≠ payment network.",
  },
  {
    id: "other-evidenced",
    label: "Other evidenced registration",
    shortLabel: "Other chain",
    chainId: null,
    eip155: null,
    environment: "other",
    note: "Registration origin evidenced but outside Base Mainnet/Sepolia.",
  },
  {
    id: "unknown",
    label: "Unknown / unregistered origin",
    shortLabel: "Unknown origin",
    chainId: null,
    eip155: null,
    environment: "unknown",
    note: "No ERC-8004 registry triple on this profile — discovery-derived or operated reference.",
  },
] as const;

const NETWORK_BY_ID: ReadonlyMap<RegistrationNetworkId, RegistrationNetworkInfo> =
  new Map(REGISTRATION_NETWORKS.map((n) => [n.id, n]));

export function getRegistrationNetworkInfo(
  id: RegistrationNetworkId,
): RegistrationNetworkInfo {
  return NETWORK_BY_ID.get(id) ?? NETWORK_BY_ID.get("unknown")!;
}

export function isRegistrationNetworkFilter(
  value: string,
): value is RegistrationNetworkFilter {
  return (
    value === "all" ||
    value === "base-mainnet" ||
    value === "base-sepolia" ||
    value === "other-evidenced" ||
    value === "unknown"
  );
}

/**
 * URL-safe agent identity key used in routes.
 * Equals catalog agentProfileId (already unique per evidence row).
 */
export type AgentIdentityKey = string;

export function isSafeAgentIdentityKey(value: string): boolean {
  if (!value || value.length > 300) return false;
  if (value.includes("\\") || value.includes("..")) return false;
  // Allow path-like eip155 segments inside the key; reject traversal only.
  if (value.includes("/../") || value.startsWith("../")) return false;
  return /^[A-Za-z0-9:._@~+/-]+$/.test(value);
}

export function agentIdentityKeyOf(agent: AgentProfile): AgentIdentityKey {
  return agent.agentProfileId;
}

/**
 * Canonical registration triple when evidenced.
 * Format: eip155:{chainId}/{registryAddress}/{agentId}
 * Null when the profile lacks a complete ERC-8004 registration.
 */
export function canonicalRegistrationKeyOf(
  agent: AgentProfile,
): string | null {
  if (
    agent.registryChainId == null ||
    !agent.registryAddress ||
    !agent.agentId
  ) {
    return null;
  }
  return `eip155:${agent.registryChainId}/${agent.registryAddress}/${agent.agentId}`;
}

export function classifyRegistrationNetwork(
  agent: AgentProfile,
): RegistrationNetworkInfo {
  if (agent.registryChainId === 8453) {
    return getRegistrationNetworkInfo("base-mainnet");
  }
  if (agent.registryChainId === 84532) {
    return getRegistrationNetworkInfo("base-sepolia");
  }
  if (agent.registryChainId != null && agent.registryAddress && agent.agentId) {
    return getRegistrationNetworkInfo("other-evidenced");
  }
  // Fall back to profile-id heuristics for incomplete rows.
  const id = agent.agentProfileId;
  if (id.includes("eip155:8453/")) {
    return getRegistrationNetworkInfo("base-mainnet");
  }
  if (id.includes("eip155:84532/")) {
    return getRegistrationNetworkInfo("base-sepolia");
  }
  return getRegistrationNetworkInfo("unknown");
}

export function classifyCapabilityRegistrationNetwork(
  record: CapabilityRecord,
  agent: AgentProfile | null,
): RegistrationNetworkInfo {
  if (agent) return classifyRegistrationNetwork(agent);
  const id = record.agentProfileId;
  if (id.includes("eip155:8453/")) {
    return getRegistrationNetworkInfo("base-mainnet");
  }
  if (id.includes("eip155:84532/")) {
    return getRegistrationNetworkInfo("base-sepolia");
  }
  return getRegistrationNetworkInfo("unknown");
}

/**
 * Identity safety: two profiles may share a presentation group only when
 * their canonical registration keys match exactly (or identical profile ids).
 * Name resemblance never merges.
 */
export function sameRegisteredIdentity(
  left: AgentProfile,
  right: AgentProfile,
): boolean {
  if (left.agentProfileId === right.agentProfileId) return true;
  const lk = canonicalRegistrationKeyOf(left);
  const rk = canonicalRegistrationKeyOf(right);
  return lk != null && rk != null && lk === rk;
}

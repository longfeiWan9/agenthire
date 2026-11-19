/**
 * ERC-8004 Identity Registry ABI — pinned for AgentHire D3.2.
 *
 * Authoritative source (do not silently retarget):
 *   https://github.com/erc-8004/erc-8004-contracts
 *   commit  b9e466c250744a7e06b13dff9d3c2844ed64f825
 *   path    abis/IdentityRegistry.json
 *
 * This module exports the full upstream ABI artifact unchanged.
 * No RPC / readContract usage here — D3.3 owns live reads.
 */

import type { Abi } from "viem";
import identityRegistryAbiJson from "./artifacts/identity-registry.abi.json" with {
  type: "json",
};

/** Immutable provenance for the pinned Identity Registry ABI artifact. */
export const IDENTITY_REGISTRY_ABI_PROVENANCE = {
  repositoryUrl: "https://github.com/erc-8004/erc-8004-contracts",
  commitSha: "b9e466c250744a7e06b13dff9d3c2844ed64f825",
  sourcePath: "abis/IdentityRegistry.json",
  localArtifactPath: "src/erc8004/artifacts/identity-registry.abi.json",
  /** SHA-256 of the exact bytes stored at localArtifactPath. */
  sha256: "cdb8e30f41a56ed53421126dab87551ff2a178b8463646f69f75bc5dc9620564",
  /** Git blob SHA for the upstream file (tree entry ea5ccdf…). */
  gitBlobSha: "ea5ccdf359405a24b9540bb67e22f3583fe67267",
  retrievedAt: "2026-11-19T08:24:00Z",
} as const;

/**
 * Full Identity Registry ABI from the pinned upstream artifact.
 * Prefer this over hand-written fragments so D3.3 stays reproducible.
 */
export const identityRegistryAbi = identityRegistryAbiJson as Abi;

/**
 * Read-only function names AgentHire needs for D3.3 registry reads.
 * Verified present on the pinned ABI (offline); live RPC is out of scope.
 */
export const IDENTITY_REGISTRY_READ_METHODS = [
  "ownerOf",
  "tokenURI",
  "getAgentWallet",
] as const;

export type IdentityRegistryReadMethod =
  (typeof IDENTITY_REGISTRY_READ_METHODS)[number];

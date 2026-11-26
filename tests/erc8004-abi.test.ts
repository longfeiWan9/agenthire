import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  IDENTITY_REGISTRY_ADDRESSES,
  agentHireNetworksByChainId,
  baseMainnetNetwork,
  baseSepoliaNetwork,
} from "../src/config/chains.ts";
import {
  IDENTITY_REGISTRY_ABI_PROVENANCE,
  IDENTITY_REGISTRY_READ_METHODS,
  identityRegistryAbi,
} from "../src/erc8004/abi.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = join(
  repoRoot,
  IDENTITY_REGISTRY_ABI_PROVENANCE.localArtifactPath,
);

type AbiItem = {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: ReadonlyArray<{ type: string; name?: string }>;
  outputs?: ReadonlyArray<{ type: string; name?: string }>;
};

function findFunction(name: string): AbiItem {
  const item = (identityRegistryAbi as readonly AbiItem[]).find(
    (entry) => entry.type === "function" && entry.name === name,
  );
  if (!item) {
    throw new Error(`Missing ABI function: ${name}`);
  }
  return item;
}

describe("Identity Registry ABI load", () => {
  it("loads a non-empty ABI array", () => {
    expect(Array.isArray(identityRegistryAbi)).toBe(true);
    expect(identityRegistryAbi.length).toBeGreaterThan(0);
  });

  it("includes required read methods", () => {
    for (const name of IDENTITY_REGISTRY_READ_METHODS) {
      expect(findFunction(name).name).toBe(name);
    }
  });
});

describe("ownerOf", () => {
  it("is view(uint256) -> address", () => {
    const fn = findFunction("ownerOf");
    expect(fn.stateMutability).toBe("view");
    expect(fn.inputs?.map((i) => i.type)).toEqual(["uint256"]);
    expect(fn.outputs?.map((o) => o.type)).toEqual(["address"]);
  });
});

describe("tokenURI", () => {
  it("is view(uint256) -> string", () => {
    const fn = findFunction("tokenURI");
    expect(fn.stateMutability).toBe("view");
    expect(fn.inputs?.map((i) => i.type)).toEqual(["uint256"]);
    expect(fn.outputs?.map((o) => o.type)).toEqual(["string"]);
  });
});

describe("getAgentWallet", () => {
  it("exists as view(uint256 agentId) -> address on the pinned ABI", () => {
    const fn = findFunction("getAgentWallet");
    expect(fn.stateMutability).toBe("view");
    expect(fn.inputs?.map((i) => ({ type: i.type, name: i.name }))).toEqual([
      { type: "uint256", name: "agentId" },
    ]);
    expect(fn.outputs?.map((o) => o.type)).toEqual(["address"]);
  });
});

describe("ABI provenance", () => {
  it("records the official commit and source path", () => {
    expect(IDENTITY_REGISTRY_ABI_PROVENANCE.commitSha).toBe(
      "b9e466c250744a7e06b13dff9d3c2844ed64f825",
    );
    expect(IDENTITY_REGISTRY_ABI_PROVENANCE.sourcePath).toBe(
      "abis/IdentityRegistry.json",
    );
    expect(IDENTITY_REGISTRY_ABI_PROVENANCE.repositoryUrl).toBe(
      "https://github.com/erc-8004/erc-8004-contracts",
    );
  });

  it("matches the recorded SHA-256 of the local artifact", () => {
    const bytes = readFileSync(artifactPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(digest).toBe(IDENTITY_REGISTRY_ABI_PROVENANCE.sha256);
    expect(bytes.byteLength).toBe(19_561);
  });
});

describe("Base network configuration", () => {
  it("uses Base Mainnet chain id 8453 and Base Sepolia 84532", () => {
    expect(BASE_MAINNET_CHAIN_ID).toBe(8453);
    expect(BASE_SEPOLIA_CHAIN_ID).toBe(84532);
    expect(baseMainnetNetwork.chain.id).toBe(8453);
    expect(baseSepoliaNetwork.chain.id).toBe(84532);
  });

  it("keeps registry addresses valid and non-swapped", () => {
    expect(isAddress(IDENTITY_REGISTRY_ADDRESSES.baseMainnet)).toBe(true);
    expect(isAddress(IDENTITY_REGISTRY_ADDRESSES.baseSepolia)).toBe(true);
    expect(IDENTITY_REGISTRY_ADDRESSES.baseMainnet).toBe(
      "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    );
    expect(IDENTITY_REGISTRY_ADDRESSES.baseSepolia).toBe(
      "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    );
    expect(IDENTITY_REGISTRY_ADDRESSES.baseMainnet).not.toBe(
      IDENTITY_REGISTRY_ADDRESSES.baseSepolia,
    );
  });

  it("does not swap mainnet and sepolia network configs", () => {
    expect(agentHireNetworksByChainId[8453].identityRegistry).toBe(
      IDENTITY_REGISTRY_ADDRESSES.baseMainnet,
    );
    expect(agentHireNetworksByChainId[84532].identityRegistry).toBe(
      IDENTITY_REGISTRY_ADDRESSES.baseSepolia,
    );
    expect(baseMainnetNetwork.caip2).toBe("eip155:8453");
    expect(baseSepoliaNetwork.caip2).toBe("eip155:84532");
    expect(baseMainnetNetwork.purposes).toContain("wallet-activity-analysis");
    expect(baseMainnetNetwork.purposes).toContain("future-x402-payments");
    expect(baseSepoliaNetwork.purposes).toContain("future-x402-payments");
    expect(baseMainnetNetwork.purposes).toContain("erc8004-discovery");
    expect(baseSepoliaNetwork.purposes).toContain("erc8004-discovery");
  });
});

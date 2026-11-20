import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { zeroAddress } from "viem";
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  IDENTITY_REGISTRY_ADDRESSES,
  baseMainnetNetwork,
  baseSepoliaNetwork,
} from "../src/config/chains.ts";
import {
  type AgentIdentityEvidence,
  type RawAgentIdentityObservations,
  type RegistryReadClient,
  ZERO_ADDRESS,
  buildAgentIdentityEvidence,
  classifyRegistryError,
  countSuccessfulLiveReads,
  evidenceToJson,
  isMetadataJoinEligible,
  isZeroAddress,
  normalizeAgentWallet,
  readAgentIdentities,
  readAgentIdentity,
  sanitizeErrorMessage,
  sanitizeTokenUriForEvidence,
} from "../src/erc8004/registry.ts";

const OWNER = "0x1111111111111111111111111111111111111111" as Address;
const WALLET = "0x2222222222222222222222222222222222222222" as Address;
const BLOCK_HASH =
  "0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890" as Hex;

function baseObservations(
  overrides: Partial<RawAgentIdentityObservations> = {},
): RawAgentIdentityObservations {
  return {
    chainId: { ok: true, actual: 8453 },
    block: { ok: true, number: 59_000_000n, hash: BLOCK_HASH },
    ownerOf: { ok: true, value: OWNER },
    tokenURI: { ok: true, value: "ipfs://bafyExample/meta.json" },
    getAgentWallet: { ok: true, value: WALLET },
    ...overrides,
  };
}

function mockClient(options?: {
  readonly chainId?: number;
  readonly blockNumber?: bigint;
  readonly ownerOf?: Address | (() => Promise<Address>);
  readonly tokenURI?: string | (() => Promise<string>);
  readonly getAgentWallet?: Address | (() => Promise<Address>);
  readonly fail?: Partial<
    Record<
      "getChainId" | "getBlockNumber" | "getBlock" | "ownerOf" | "tokenURI" | "getAgentWallet",
      Error
    >
  >;
  readonly seenBlockNumbers?: bigint[];
}): RegistryReadClient {
  const seen = options?.seenBlockNumbers;
  return {
    async getChainId() {
      if (options?.fail?.getChainId) throw options.fail.getChainId;
      return options?.chainId ?? BASE_MAINNET_CHAIN_ID;
    },
    async getBlockNumber() {
      if (options?.fail?.getBlockNumber) throw options.fail.getBlockNumber;
      return options?.blockNumber ?? 59_000_000n;
    },
    async getBlock({ blockNumber }) {
      if (options?.fail?.getBlock) throw options.fail.getBlock;
      return {
        number: blockNumber,
        hash: BLOCK_HASH,
        timestamp: 1_700_000_000n,
      };
    },
    async readContract({ functionName, blockNumber }) {
      seen?.push(blockNumber);
      if (functionName === "ownerOf") {
        if (options?.fail?.ownerOf) throw options.fail.ownerOf;
        const value = options?.ownerOf ?? OWNER;
        return typeof value === "function" ? value() : value;
      }
      if (functionName === "tokenURI") {
        if (options?.fail?.tokenURI) throw options.fail.tokenURI;
        const value = options?.tokenURI ?? "https://example.com/agent/1";
        return typeof value === "function" ? value() : value;
      }
      if (functionName === "getAgentWallet") {
        if (options?.fail?.getAgentWallet) throw options.fail.getAgentWallet;
        const value = options?.getAgentWallet ?? WALLET;
        return typeof value === "function" ? value() : value;
      }
      throw new Error(`unexpected function ${functionName}`);
    },
  };
}

describe("sanitize helpers", () => {
  it("redacts credentials and long secrets from URIs and errors", () => {
    expect(
      sanitizeTokenUriForEvidence(
        "https://user:secret@cdn.example.com/v2/SUPER_SECRET_API_KEY_VALUE_1234?api_key=abc",
      ),
    ).not.toMatch(/secret|SUPER_SECRET|api_key=abc/i);

    const msg = sanitizeErrorMessage(
      new Error("fetch failed https://user:tok@mainnet.base.org Bearer abcdefghijklmnopqrstuvwxyz0123456789ABCDEF"),
    );
    expect(msg).not.toContain("user:tok@");
    expect(msg).toContain("[REDACTED]");
  });
});

describe("wallet normalization", () => {
  it("maps zero address to null while preserving raw", () => {
    expect(isZeroAddress(ZERO_ADDRESS)).toBe(true);
    expect(normalizeAgentWallet(zeroAddress)).toEqual({
      agentWallet: null,
      agentWalletRaw: zeroAddress,
    });
    expect(normalizeAgentWallet(WALLET).agentWallet).toBe(WALLET);
  });
});

describe("classifyRegistryError", () => {
  it("detects nonexistent token vs timeout", () => {
    expect(
      classifyRegistryError(new Error("ERC721NonexistentToken(19353)")),
    ).toBe("notFound");
    expect(
      classifyRegistryError(new Error("owner query for nonexistent token")),
    ).toBe("notFound");
    expect(
      classifyRegistryError(new Error("TimeoutError: request timed out")),
    ).toBe("timeout");
  });
});

describe("buildAgentIdentityEvidence — success", () => {
  it("emits schemaVersion 1.0 with decimal strings and no bigints", () => {
    const evidence = buildAgentIdentityEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T09:00:00.000Z",
      observations: baseObservations(),
    });
    expect(evidence.schemaVersion).toBe("1.0");
    expect(evidence.status).toBe("success");
    expect(evidence.agentId).toBe("19353");
    expect(evidence.blockNumber).toBe("59000000");
    expect(evidence.owner).toBe(OWNER);
    expect(evidence.agentWallet).toBe(WALLET);
    expect(evidence.registryAddress).toBe(
      IDENTITY_REGISTRY_ADDRESSES.baseMainnet,
    );
    const json = evidenceToJson(evidence);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json).not.toMatch(/\d+n/);
  });
});

describe("notFound", () => {
  it("marks nonexistent ownerOf as notFound", () => {
    const evidence = buildAgentIdentityEvidence({
      network: baseMainnetNetwork,
      agentId: 1n,
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T09:00:00.000Z",
      observations: baseObservations({
        ownerOf: {
          ok: false,
          error: new Error("ERC721NonexistentToken(1)"),
        },
      }),
    });
    expect(evidence.status).toBe("notFound");
    expect(evidence.fields.ownerOf.ok).toBe(false);
  });
});

describe("zero wallet", () => {
  it("normalizes zero-address wallet to null with raw preserved", () => {
    const evidence = buildAgentIdentityEvidence({
      network: baseSepoliaNetwork,
      agentId: 9_136n,
      rpcOrigin: "https://sepolia.base.org",
      observedAt: "2026-11-19T09:00:00.000Z",
      observations: {
        ...baseObservations({
          chainId: { ok: true, actual: 84532 },
          getAgentWallet: { ok: true, value: zeroAddress },
        }),
      },
    });
    expect(evidence.status).toBe("success");
    expect(evidence.agentWallet).toBeNull();
    expect(evidence.agentWalletRaw).toBe(zeroAddress);
  });
});

describe("empty URI", () => {
  it("allows empty tokenURI as success when owner exists", () => {
    const evidence = buildAgentIdentityEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T09:00:00.000Z",
      observations: baseObservations({
        tokenURI: { ok: true, value: "" },
      }),
    });
    expect(evidence.status).toBe("success");
    expect(evidence.tokenURI).toBe("");
    // Empty URI is not eligible for metadata join.
    expect(isMetadataJoinEligible(evidence)).toBe(false);
  });
});

describe("partial identity status", () => {
  it("marks reverted tokenURI as partial (not full success)", () => {
    const evidence = buildAgentIdentityEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T09:00:00.000Z",
      observations: baseObservations({
        tokenURI: {
          ok: false,
          error: new Error("execution reverted"),
        },
      }),
    });
    expect(evidence.status).toBe("partial");
    expect(evidence.owner).toBe(OWNER);
    expect(evidence.tokenURI).toBeNull();
    expect(isMetadataJoinEligible(evidence)).toBe(false);
  });

  it("marks reverted getAgentWallet as partial when tokenURI ok", () => {
    const evidence = buildAgentIdentityEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T09:00:00.000Z",
      observations: baseObservations({
        getAgentWallet: {
          ok: false,
          error: new Error("execution reverted"),
        },
      }),
    });
    expect(evidence.status).toBe("partial");
    expect(evidence.fields.tokenURI.ok).toBe(true);
    expect(isMetadataJoinEligible(evidence)).toBe(false);
  });

  it("gates metadata join on full success + non-empty tokenURI", () => {
    const full = buildAgentIdentityEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T09:00:00.000Z",
      observations: baseObservations(),
    });
    expect(full.status).toBe("success");
    expect(isMetadataJoinEligible(full)).toBe(true);
  });
});

describe("timeouts", () => {
  it("marks ownerOf timeout as inconclusive", () => {
    const evidence = buildAgentIdentityEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T09:00:00.000Z",
      observations: baseObservations({
        ownerOf: {
          ok: false,
          error: new Error("TimeoutError: timed out"),
        },
      }),
    });
    expect(evidence.status).toBe("inconclusive");
  });
});

describe("chain mismatch", () => {
  it("fails when eth_chainId does not match expected", () => {
    const evidence = buildAgentIdentityEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T09:00:00.000Z",
      observations: baseObservations({
        chainId: { ok: true, actual: 1 },
      }),
    });
    expect(evidence.status).toBe("failed");
    expect(evidence.error).toMatch(/mismatch/i);
  });
});

describe("readAgentIdentity same-block snapshot", () => {
  it("passes the pinned blockNumber to every readContract call", async () => {
    const seen: bigint[] = [];
    const evidence = await readAgentIdentity({
      chainId: BASE_MAINNET_CHAIN_ID,
      agentId: 19_353n,
      client: mockClient({ blockNumber: 42n, seenBlockNumbers: seen }),
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T09:00:00.000Z",
      blockNumber: 42n,
    });
    expect(evidence.status).toBe("success");
    expect(evidence.blockNumber).toBe("42");
    expect(seen).toEqual([42n, 42n, 42n]);
  });
});

describe("partial failures / continue-on-error", () => {
  it("continues batch when one agent fails and another succeeds", async () => {
    let calls = 0;
    const client: RegistryReadClient = {
      async getChainId() {
        return BASE_MAINNET_CHAIN_ID;
      },
      async getBlockNumber() {
        return 100n;
      },
      async getBlock({ blockNumber }) {
        return { number: blockNumber, hash: BLOCK_HASH, timestamp: 1n };
      },
      async readContract({ functionName, args }) {
        const agentId = args[0];
        calls += 1;
        if (agentId === 19_353n && functionName === "ownerOf") {
          throw new Error("ERC721NonexistentToken(19353)");
        }
        if (functionName === "ownerOf") return OWNER;
        if (functionName === "tokenURI") return "ipfs://ok";
        if (functionName === "getAgentWallet") return WALLET;
        throw new Error("unexpected");
      },
    };

    const evidences = await readAgentIdentities({
      targets: [
        { chainId: BASE_MAINNET_CHAIN_ID, agentId: 19_353n },
        { chainId: BASE_MAINNET_CHAIN_ID, agentId: 94_639n },
      ],
      clientsByChainId: { [BASE_MAINNET_CHAIN_ID]: client },
      rpcOriginsByChainId: {
        [BASE_MAINNET_CHAIN_ID]: "https://mainnet.base.org",
      },
      observedAt: "2026-11-19T09:00:00.000Z",
    });

    expect(evidences).toHaveLength(2);
    expect(evidences[0]?.status).toBe("notFound");
    expect(evidences[1]?.status).toBe("success");
    expect(countSuccessfulLiveReads(evidences)).toBe(1);
    expect(calls).toBeGreaterThan(3);
  });

  it("keeps one-network failure from blocking the other", async () => {
    const mainFail = mockClient({
      fail: { getChainId: new Error("fetch failed: ECONNREFUSED") },
    });
    const sepoliaOk = mockClient({
      chainId: BASE_SEPOLIA_CHAIN_ID,
      blockNumber: 200n,
    });

    const evidences = await readAgentIdentities({
      targets: [
        { chainId: BASE_MAINNET_CHAIN_ID, agentId: 19_353n },
        { chainId: BASE_SEPOLIA_CHAIN_ID, agentId: 9_136n },
      ],
      clientsByChainId: {
        [BASE_MAINNET_CHAIN_ID]: mainFail,
        [BASE_SEPOLIA_CHAIN_ID]: sepoliaOk,
      },
      rpcOriginsByChainId: {
        [BASE_MAINNET_CHAIN_ID]: "https://mainnet.base.org",
        [BASE_SEPOLIA_CHAIN_ID]: "https://sepolia.base.org",
      },
      observedAt: "2026-11-19T09:00:00.000Z",
    });

    expect(evidences[0]?.status).not.toBe("success");
    expect(evidences[1]?.status).toBe("success");
    expect(evidences[1]?.chainId).toBe(84532);
  });
});

describe("no credentials in evidence output", () => {
  it("scrubs secrets from tokenURI evidence", () => {
    const evidence = buildAgentIdentityEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      rpcOrigin: "https://user:password@mainnet.base.org/v2/KEY",
      observedAt: "2026-11-19T09:00:00.000Z",
      observations: baseObservations({
        tokenURI: {
          ok: true,
          value:
            "https://user:password@metadata.example/v2/SUPERSECRETKEYVALUE1234567890?token=abc",
        },
      }),
    });
    const json = evidenceToJson(evidence);
    expect(json).not.toContain("password");
    expect(json).not.toContain("SUPERSECRETKEYVALUE");
    expect(evidence.rpcOrigin).toBe("https://mainnet.base.org");
  });
});

describe("offline — no live RPC", () => {
  it("does not call fetch during mock registry reads", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("unit tests must not perform live RPC");
    });
    try {
      const evidence: AgentIdentityEvidence = await readAgentIdentity({
        chainId: BASE_MAINNET_CHAIN_ID,
        agentId: 19_353n,
        client: mockClient(),
        rpcOrigin: "https://mainnet.base.org",
        observedAt: "2026-11-19T09:00:00.000Z",
      });
      expect(evidence.status).toBe("success");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

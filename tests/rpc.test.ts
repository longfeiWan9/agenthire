import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  IDENTITY_REGISTRY_ADDRESSES,
  baseMainnetNetwork,
  baseSepoliaNetwork,
} from "../src/config/chains.ts";
import {
  ALLOWED_RPC_HOSTS,
  DEFAULT_BASE_MAINNET_RPC_URL,
  DEFAULT_BASE_SEPOLIA_RPC_URL,
  type ReadOnlyRpcReader,
  type RpcConnectivityEvidence,
  UnsafeRpcUrlError,
  assertSafeRpcUrl,
  buildConnectivityEvidence,
  checkRpcConnectivity,
  classifyRpcError,
  createReadOnlyClient,
  evidenceToJson,
  isEvidenceJsonSafe,
  requiredChecksPassed,
  resolveRpcUrl,
  sanitizeRpcOrigin,
  stringifyBigInt,
} from "../src/config/rpc.ts";

const SAMPLE_BYTECODE =
  "0x608060405234801561001057600080fd5b50" as Hex;

function mockReader(overrides: Partial<{
  chainId: number | (() => Promise<number>);
  block: {
    number: bigint | null;
    hash: Hex | null;
    timestamp: bigint;
  } | (() => Promise<{
    number: bigint | null;
    hash: Hex | null;
    timestamp: bigint;
  }>);
  bytecode: Hex | undefined | (() => Promise<Hex | undefined>);
}> = {}): ReadOnlyRpcReader {
  return {
    async getChainId() {
      const value = overrides.chainId ?? BASE_MAINNET_CHAIN_ID;
      return typeof value === "function" ? value() : value;
    },
    async getBlock() {
      const value =
        overrides.block ??
        ({
          number: 12_345_678n,
          hash: "0xabc123def4567890abc123def4567890abc123def4567890abc123def4567890" as Hex,
          timestamp: 1_700_000_000n,
        } as const);
      return typeof value === "function" ? value() : value;
    },
    async getBytecode() {
      const value = overrides.bytecode ?? SAMPLE_BYTECODE;
      return typeof value === "function" ? value() : value;
    },
  };
}

describe("RPC URL allowlist / safety", () => {
  it("accepts default official Base HTTPS endpoints", () => {
    expect(assertSafeRpcUrl(DEFAULT_BASE_MAINNET_RPC_URL).host).toBe(
      "mainnet.base.org",
    );
    expect(assertSafeRpcUrl(DEFAULT_BASE_SEPOLIA_RPC_URL).host).toBe(
      "sepolia.base.org",
    );
    expect(ALLOWED_RPC_HOSTS).toContain("mainnet.base.org");
    expect(ALLOWED_RPC_HOSTS).toContain("sepolia.base.org");
  });

  it("rejects credentials in the URL", () => {
    expect(() =>
      assertSafeRpcUrl("https://user:secret@mainnet.base.org"),
    ).toThrow(UnsafeRpcUrlError);
    expect(() =>
      assertSafeRpcUrl("https://user:secret@mainnet.base.org"),
    ).toThrow(/credentials/i);
  });

  it("rejects localhost and private IPs", () => {
    expect(() => assertSafeRpcUrl("https://localhost/rpc")).toThrow(
      UnsafeRpcUrlError,
    );
    expect(() => assertSafeRpcUrl("https://127.0.0.1/rpc")).toThrow(
      UnsafeRpcUrlError,
    );
    expect(() => assertSafeRpcUrl("https://10.0.0.5/rpc")).toThrow(
      UnsafeRpcUrlError,
    );
    expect(() => assertSafeRpcUrl("https://192.168.1.10/rpc")).toThrow(
      UnsafeRpcUrlError,
    );
    expect(() => assertSafeRpcUrl("https://172.16.0.2/rpc")).toThrow(
      UnsafeRpcUrlError,
    );
  });

  it("rejects non-HTTPS and arbitrary hosts (fail closed)", () => {
    expect(() => assertSafeRpcUrl("http://mainnet.base.org")).toThrow(
      /https/i,
    );
    expect(() =>
      assertSafeRpcUrl("https://evil.example.com/base"),
    ).toThrow(/allowlist|arbitrary/i);
    expect(() =>
      assertSafeRpcUrl("https://base-mainnet.g.alchemy.com/v2/SECRET_KEY"),
    ).toThrow(UnsafeRpcUrlError);
  });

  it("resolveRpcUrl uses defaults and sanitizes env overrides", () => {
    const main = resolveRpcUrl(BASE_MAINNET_CHAIN_ID, {});
    expect(main.url).toBe(DEFAULT_BASE_MAINNET_RPC_URL);
    expect(main.fromEnv).toBe(false);

    const overridden = resolveRpcUrl(BASE_SEPOLIA_CHAIN_ID, {
      BASE_SEPOLIA_RPC_URL: "https://sepolia.base.org/",
    });
    expect(overridden.fromEnv).toBe(true);
    expect(overridden.origin).toBe("https://sepolia.base.org");

    expect(() =>
      resolveRpcUrl(BASE_MAINNET_CHAIN_ID, {
        BASE_MAINNET_RPC_URL: "https://user:token@mainnet.base.org",
      }),
    ).toThrow(UnsafeRpcUrlError);
  });

  it("sanitizeRpcOrigin never includes credentials or path secrets", () => {
    expect(
      sanitizeRpcOrigin("https://user:super-secret@mainnet.base.org/v2/KEY"),
    ).toBe("https://mainnet.base.org");
    expect(sanitizeRpcOrigin("not a url")).toBe("[invalid-rpc-url]");
  });
});

describe("createReadOnlyClient", () => {
  it("returns a PublicClient for 8453 and 84532 only", () => {
    const main = createReadOnlyClient(BASE_MAINNET_CHAIN_ID);
    const sepolia = createReadOnlyClient(BASE_SEPOLIA_CHAIN_ID);
    expect(main.chain?.id).toBe(8453);
    expect(sepolia.chain?.id).toBe(84532);
    // PublicClient surface: no account / wallet write helpers attached.
    expect(
      (main as { account?: unknown }).account,
    ).toBeUndefined();
    expect(
      (sepolia as { account?: unknown }).account,
    ).toBeUndefined();
  });
});

describe("bigint serialization helpers", () => {
  it("stringifies bigints for JSON-safe evidence", () => {
    expect(stringifyBigInt(0n)).toBe("0");
    expect(stringifyBigInt(12_345_678n)).toBe("12345678");
    const evidence = buildConnectivityEvidence({
      network: baseMainnetNetwork,
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T08:00:00.000Z",
      observations: {
        chainIdResult: { ok: true, actual: 8453 },
        blockResult: {
          ok: true,
          number: 99n,
          hash: "0xdeadbeef" as Hex,
          timestamp: 42n,
        },
        bytecodeResult: { ok: true, bytecode: SAMPLE_BYTECODE },
      },
    });
    expect(evidence.checks.latestBlock.number).toBe("99");
    expect(evidence.checks.latestBlock.timestamp).toBe("42");
    expect(isEvidenceJsonSafe(evidence)).toBe(true);
    expect(() => JSON.parse(evidenceToJson(evidence))).not.toThrow();
  });
});

describe("connectivity evidence — happy path", () => {
  it("marks chain match + block + bytecode as verified", async () => {
    const evidence = await checkRpcConnectivity({
      chainId: BASE_MAINNET_CHAIN_ID,
      reader: mockReader(),
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T08:00:00.000Z",
    });
    expect(evidence.schemaVersion).toBe("1.0");
    expect(evidence.status).toBe("verified");
    expect(evidence.checks.chainId.ok).toBe(true);
    expect(evidence.checks.latestBlock.ok).toBe(true);
    expect(evidence.checks.registryBytecode.ok).toBe(true);
    expect(evidence.checks.registryBytecode.address).toBe(
      IDENTITY_REGISTRY_ADDRESSES.baseMainnet,
    );
    expect(requiredChecksPassed(evidence)).toBe(true);
  });
});

describe("connectivity evidence — chain mismatch", () => {
  it("fails when eth_chainId does not match expected", async () => {
    const evidence = await checkRpcConnectivity({
      chainId: BASE_MAINNET_CHAIN_ID,
      reader: mockReader({ chainId: 1 }),
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T08:00:00.000Z",
    });
    expect(evidence.status).toBe("failed");
    expect(evidence.checks.chainId.ok).toBe(false);
    expect(evidence.checks.chainId.actual).toBe(1);
    expect(evidence.error).toMatch(/mismatch/i);
  });
});

describe("connectivity evidence — missing registry code", () => {
  it("fails when getBytecode returns empty 0x", async () => {
    const evidence = await checkRpcConnectivity({
      chainId: BASE_SEPOLIA_CHAIN_ID,
      reader: mockReader({
        chainId: BASE_SEPOLIA_CHAIN_ID,
        bytecode: "0x",
      }),
      rpcOrigin: "https://sepolia.base.org",
      network: baseSepoliaNetwork,
      observedAt: "2026-11-19T08:00:00.000Z",
    });
    expect(evidence.status).toBe("failed");
    expect(evidence.checks.registryBytecode.ok).toBe(false);
    expect(evidence.checks.registryBytecode.hasCode).toBe(false);
    expect(evidence.checks.registryBytecode.address).toBe(
      IDENTITY_REGISTRY_ADDRESSES.baseSepolia,
    );
  });
});

describe("connectivity evidence — timeout", () => {
  it("marks timeouts as inconclusive", async () => {
    const evidence = await checkRpcConnectivity({
      chainId: BASE_MAINNET_CHAIN_ID,
      reader: mockReader({
        chainId: async () => {
          throw new Error("TimeoutError: request timed out after 12000ms");
        },
      }),
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T08:00:00.000Z",
    });
    expect(classifyRpcError(new Error("request timed out"))).toBe("timeout");
    expect(evidence.status).toBe("inconclusive");
    expect(requiredChecksPassed(evidence)).toBe(false);
  });
});

describe("connectivity evidence — connection failure", () => {
  it("marks hard connection failures as failed", async () => {
    const evidence = await checkRpcConnectivity({
      chainId: BASE_MAINNET_CHAIN_ID,
      reader: mockReader({
        chainId: async () => {
          throw new Error("TypeError: fetch failed: ECONNREFUSED");
        },
        block: async () => {
          throw new Error("TypeError: fetch failed: ECONNREFUSED");
        },
        bytecode: async () => {
          throw new Error("TypeError: fetch failed: ECONNREFUSED");
        },
      }),
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T08:00:00.000Z",
    });
    expect(evidence.status).toBe("failed");
    expect(evidence.checks.chainId.ok).toBe(false);
  });
});

describe("connectivity evidence — malformed block", () => {
  it("fails when latest block is missing number/hash", () => {
    const evidence = buildConnectivityEvidence({
      network: baseMainnetNetwork,
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T08:00:00.000Z",
      observations: {
        chainIdResult: { ok: true, actual: 8453 },
        blockResult: {
          ok: true,
          number: null,
          hash: null,
          timestamp: 1n,
        },
        bytecodeResult: { ok: true, bytecode: SAMPLE_BYTECODE },
      },
    });
    expect(evidence.status).toBe("failed");
    expect(evidence.checks.latestBlock.ok).toBe(false);
    expect(evidence.checks.latestBlock.error).toMatch(/missing/i);
  });
});

describe("credentials never appear in evidence output", () => {
  it("evidence JSON only contains sanitized origins", () => {
    const evidence = buildConnectivityEvidence({
      network: baseMainnetNetwork,
      rpcOrigin: sanitizeRpcOrigin(
        "https://apiuser:super-secret-token@mainnet.base.org/v2/KEY",
      ),
      observedAt: "2026-11-19T08:00:00.000Z",
      observations: {
        chainIdResult: { ok: true, actual: 8453 },
        blockResult: {
          ok: true,
          number: 1n,
          hash: "0x01" as Hex,
          timestamp: 2n,
        },
        bytecodeResult: { ok: true, bytecode: SAMPLE_BYTECODE },
      },
    });
    const json = evidenceToJson(evidence);
    expect(json).not.toContain("super-secret-token");
    expect(json).not.toContain("apiuser");
    expect(json).not.toContain("/v2/KEY");
    expect(json).toContain('"rpcOrigin": "https://mainnet.base.org"');
  });
});

describe("one network fail / other succeed", () => {
  it("keeps per-network statuses independent", async () => {
    const mainnet = await checkRpcConnectivity({
      chainId: BASE_MAINNET_CHAIN_ID,
      reader: mockReader({ chainId: 8453 }),
      rpcOrigin: "https://mainnet.base.org",
      observedAt: "2026-11-19T08:00:00.000Z",
    });
    const sepolia = await checkRpcConnectivity({
      chainId: BASE_SEPOLIA_CHAIN_ID,
      reader: mockReader({
        chainId: BASE_SEPOLIA_CHAIN_ID,
        bytecode: "0x",
      }),
      rpcOrigin: "https://sepolia.base.org",
      network: baseSepoliaNetwork,
      observedAt: "2026-11-19T08:00:00.000Z",
    });

    expect(mainnet.status).toBe("verified");
    expect(sepolia.status).toBe("failed");
    expect(requiredChecksPassed(mainnet)).toBe(true);
    expect(requiredChecksPassed(sepolia)).toBe(false);

    const combinedOk = [mainnet, sepolia].every(requiredChecksPassed);
    expect(combinedOk).toBe(false);
  });
});

describe("no live RPC in unit tests", () => {
  it("does not invoke network I/O for evidence builders", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("unit tests must not perform live RPC");
    });
    try {
      const evidence: RpcConnectivityEvidence = await checkRpcConnectivity({
        chainId: BASE_MAINNET_CHAIN_ID,
        reader: mockReader(),
        rpcOrigin: "https://mainnet.base.org",
        observedAt: "2026-11-19T08:00:00.000Z",
      });
      expect(evidence.status).toBe("verified");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("registry address wiring", () => {
  it("uses D3.2 chains.ts registry addresses", async () => {
    let seen: Address | undefined;
    const reader: ReadOnlyRpcReader = {
      async getChainId() {
        return BASE_SEPOLIA_CHAIN_ID;
      },
      async getBlock() {
        return {
          number: 1n,
          hash: "0xabc" as Hex,
          timestamp: 1n,
        };
      },
      async getBytecode({ address }) {
        seen = address;
        return SAMPLE_BYTECODE;
      },
    };
    await checkRpcConnectivity({
      chainId: BASE_SEPOLIA_CHAIN_ID,
      reader,
      rpcOrigin: "https://sepolia.base.org",
      network: baseSepoliaNetwork,
    });
    expect(seen).toBe(IDENTITY_REGISTRY_ADDRESSES.baseSepolia);
  });
});

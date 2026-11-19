import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  APPROVED_REGISTRATION_METADATA_URLS,
  D35_METADATA_TARGETS,
  ERC8004_REGISTRATION_TYPE_V1,
  buildRegistrationMetadataEvidence,
  isApprovedRegistrationMetadataUrl,
  parseAndValidateRegistrationJson,
  resolveRegistrationMetadata,
  resolveRegistrationMetadataBatch,
  sha256Hex,
  toDisplayURI,
} from "../src/erc8004/metadata.ts";
import {
  SecureFetchError,
  assertHttpsUrl,
  expandIpv6,
  isBlockedIpAddress,
  ipv4ToInt,
  secureHttpsGet,
  selectPinnedAddress,
  type SecureHttpsDeps,
} from "../src/erc8004/secure-https.ts";
import {
  baseMainnetNetwork,
  baseSepoliaNetwork,
} from "../src/config/chains.ts";

const VALID_DOC = {
  type: ERC8004_REGISTRATION_TYPE_V1,
  name: "Test Agent",
  description: "A test registration document",
  image: "https://example.com/logo.png",
  services: [
    {
      name: "web",
      endpoint: "https://example.com/",
    },
    {
      name: "MCP",
      endpoint: "https://example.com/mcp",
      version: "2025-06-18",
    },
  ],
  x402Support: false,
  active: true,
  registrations: [
    {
      agentId: 19353,
      agentRegistry: "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    },
  ],
  supportedTrust: ["reputation"],
};

function mockSuccessFetch(body: unknown, overrides?: Partial<{
  statusCode: number;
  contentType: string;
  pinned: string;
  elapsedMs: number;
}>) {
  const buf = Buffer.from(JSON.stringify(body), "utf8");
  return {
    ok: true as const,
    url: APPROVED_REGISTRATION_METADATA_URLS[0],
    finalUrl: APPROVED_REGISTRATION_METADATA_URLS[0],
    statusCode: overrides?.statusCode ?? 200,
    contentType: overrides?.contentType ?? "application/json",
    body: buf,
    sha256: sha256Hex(buf),
    byteLength: buf.length,
    resolvedAddresses: [
      { address: overrides?.pinned ?? "203.0.113.10", family: 4 as const },
    ],
    pinnedAddress: {
      address: overrides?.pinned ?? "203.0.113.10",
      family: 4 as const,
    },
    elapsedMs: overrides?.elapsedMs ?? 12,
  };
}

describe("allowlist exact match", () => {
  it("accepts only the three exact approved URLs", () => {
    for (const url of APPROVED_REGISTRATION_METADATA_URLS) {
      expect(isApprovedRegistrationMetadataUrl(url)).toBe(true);
    }
    expect(
      isApprovedRegistrationMetadataUrl(
        "https://onchainagentintel.io/agent.json/",
      ),
    ).toBe(false);
    expect(
      isApprovedRegistrationMetadataUrl(
        "http://onchainagentintel.io/agent.json",
      ),
    ).toBe(false);
    expect(
      isApprovedRegistrationMetadataUrl(
        "https://onchainagentintel.io/agent.json?x=1",
      ),
    ).toBe(false);
    expect(
      isApprovedRegistrationMetadataUrl("https://onchainagentintel.io/"),
    ).toBe(false);
    expect(
      isApprovedRegistrationMetadataUrl(
        "https://evil.example/https://onchainagentintel.io/agent.json",
      ),
    ).toBe(false);
    expect(isApprovedRegistrationMetadataUrl("https://127.0.0.1/agent.json")).toBe(
      false,
    );
  });

  it("D3.5 targets use approved URLs matching on-chain tokenURIs", () => {
    expect(D35_METADATA_TARGETS).toHaveLength(3);
    for (const t of D35_METADATA_TARGETS) {
      expect(t.onChainTokenURI).toBe(t.approvedFetchURI);
      expect(isApprovedRegistrationMetadataUrl(t.approvedFetchURI)).toBe(true);
    }
  });
});

describe("displayURI separation", () => {
  it("strips credentials/query/hash without changing path", () => {
    expect(
      toDisplayURI(
        "https://user:pass@onchainagentintel.io/agent.json?token=abc#x",
      ),
    ).toBe("https://onchainagentintel.io/agent.json");
  });
});

describe("IP blocking / SSRF helpers", () => {
  it("blocks loopback, private, link-local, CGNAT, multicast, special", () => {
    const blocked = [
      "127.0.0.1",
      "127.0.0.2",
      "0.0.0.0",
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.1",
      "192.168.1.1",
      "169.254.1.1",
      "100.64.0.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "::ffff:192.168.0.1",
    ];
    for (const ip of blocked) {
      expect(isBlockedIpAddress(ip), ip).toBe(true);
    }
  });

  it("allows typical public addresses", () => {
    expect(isBlockedIpAddress("1.1.1.1")).toBe(false);
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("104.21.16.1")).toBe(false);
    expect(isBlockedIpAddress("2001:4860:4860::8888")).toBe(false);
  });

  it("selectPinnedAddress rejects all-blocked sets and prefers IPv4", () => {
    expect(() =>
      selectPinnedAddress([{ address: "127.0.0.1", family: 4 }]),
    ).toThrow(SecureFetchError);

    const pinned = selectPinnedAddress([
      { address: "2001:4860:4860::8888", family: 6 },
      { address: "1.1.1.1", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    expect(pinned.address).toBe("1.1.1.1");
  });

  it("expandIpv6 handles compressed and mapped forms", () => {
    expect(expandIpv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIpv6("fe80::1")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(ipv4ToInt("127.0.0.1")).toBe((127 << 24) + 1);
  });
});

describe("assertHttpsUrl", () => {
  it("rejects non-https and credentialed URLs", () => {
    expect(() => assertHttpsUrl("http://example.com/a")).toThrow(/https/);
    expect(() => assertHttpsUrl("https://user:pass@example.com/a")).toThrow(
      /credential/,
    );
    expect(() => assertHttpsUrl("not a url")).toThrow(SecureFetchError);
  });
});

describe("secureHttpsGet — connection pinning mocks", () => {
  type MockRequestFn = NonNullable<SecureHttpsDeps["request"]>;

  function createMockRequest(options: {
    readonly statusCode?: number;
    readonly headers?: Record<string, string | string[]>;
    readonly body?: Buffer | string;
    readonly chunks?: Array<Buffer | string>;
    readonly emitError?: Error;
    readonly tlsErrorOnRequest?: Error;
    readonly onOptions?: (opts: unknown) => void;
  }): MockRequestFn {
    const fn = ((
      opts: unknown,
      callback?: (res: IncomingMessage) => void,
    ) => {
      options.onOptions?.(opts);
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: (err?: Error) => void;
        setTimeout: (ms: number, cb?: () => void) => void;
      };
      req.end = () => {
        if (options.tlsErrorOnRequest) {
          queueMicrotask(() => req.emit("error", options.tlsErrorOnRequest));
          return;
        }
        const resEmitter = new EventEmitter();
        const res = Object.assign(resEmitter, {
          statusCode: options.statusCode ?? 200,
          headers: options.headers ?? {
            "content-type": "application/json",
          },
          resume() {
            return res as unknown as IncomingMessage;
          },
          destroy() {
            resEmitter.emit("close");
            return res as unknown as IncomingMessage;
          },
        }) as unknown as IncomingMessage;

        queueMicrotask(() => {
          callback?.(res);
          if (options.emitError) {
            resEmitter.emit("error", options.emitError);
            return;
          }
          if (options.chunks) {
            for (const chunk of options.chunks) {
              resEmitter.emit("data", chunk);
            }
          } else {
            resEmitter.emit("data", options.body ?? Buffer.from("{}"));
          }
          resEmitter.emit("end");
        });
      };
      req.destroy = (err?: Error) => {
        if (err) req.emit("error", err);
      };
      req.setTimeout = () => undefined;
      return req as unknown as ReturnType<MockRequestFn>;
    }) as MockRequestFn;
    return fn;
  }

  it("pins DNS-validated public IP at connect time and returns sha256", async () => {
    const body = Buffer.from(JSON.stringify(VALID_DOC));
    let seenHost: string | null = null;
    let seenServername: string | null = null;
    let seenHostHeader: string | null = null;
    const result = await secureHttpsGet(
      "https://onchainagentintel.io/agent.json",
      {
        lookup: async () => [{ address: "104.21.16.1", family: 4 }],
        request: createMockRequest({
          body,
          headers: { "content-type": "application/json" },
          onOptions: (opts) => {
            const o = opts as {
              host?: string;
              servername?: string;
              headers?: Record<string, string>;
            };
            seenHost = o.host ?? null;
            seenServername = o.servername ?? null;
            seenHostHeader = o.headers?.Host ?? null;
          },
        }),
      },
    );
    expect(seenHost).toBe("104.21.16.1");
    expect(seenServername).toBe("onchainagentintel.io");
    expect(seenHostHeader).toBe("onchainagentintel.io");
    expect(result.sha256).toBe(sha256Hex(body));
    expect(result.pinnedAddress.address).toBe("104.21.16.1");
  });

  it("rejects when DNS resolves only to private IPs", async () => {
    await expect(
      secureHttpsGet("https://onchainagentintel.io/agent.json", {
        lookup: async () => [
          { address: "10.0.0.5", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
        request: createMockRequest({ body: "{}" }),
      }),
    ).rejects.toMatchObject({ errorClass: "blockedIp" });
  });

  it("refuses redirects", async () => {
    await expect(
      secureHttpsGet(
        "https://agent402.tools/.well-known/agent-registration.json",
        {
          lookup: async () => [{ address: "1.2.3.4", family: 4 }],
          request: createMockRequest({
            statusCode: 302,
            headers: { location: "https://evil.example/x" },
          }),
        },
      ),
    ).rejects.toMatchObject({ errorClass: "redirect" });
  });

  it("classifies TLS failures", async () => {
    const tlsErr = Object.assign(new Error("self signed certificate"), {
      code: "DEPTH_ZERO_SELF_SIGNED_CERT",
    });
    await expect(
      secureHttpsGet(
        "https://agents.quantjourney.cloud/.well-known/agent-registration.json",
        {
          lookup: async () => [{ address: "1.2.3.4", family: 4 }],
          request: createMockRequest({ tlsErrorOnRequest: tlsErr }),
        },
      ),
    ).rejects.toMatchObject({ errorClass: "tls" });
  });

  it("enforces streaming size limit", async () => {
    const big = Buffer.alloc(256 * 1024 + 1, 0x61);
    await expect(
      secureHttpsGet("https://onchainagentintel.io/agent.json", {
        lookup: async () => [{ address: "1.2.3.4", family: 4 }],
        request: createMockRequest({ body: big }),
      }),
    ).rejects.toMatchObject({ errorClass: "oversized" });
  });

  it("surfaces HTTP error statuses", async () => {
    await expect(
      secureHttpsGet("https://onchainagentintel.io/agent.json", {
        lookup: async () => [{ address: "1.2.3.4", family: 4 }],
        request: createMockRequest({ statusCode: 404, body: "nope" }),
      }),
    ).rejects.toMatchObject({ errorClass: "httpError" });
  });
});

describe("parseAndValidateRegistrationJson", () => {
  it("accepts a valid EIP-8004 registration document", () => {
    const result = parseAndValidateRegistrationJson(
      JSON.stringify(VALID_DOC),
    );
    expect(result.ok).toBe(true);
    expect(result.document?.name).toBe("Test Agent");
    expect(result.document?.services).toHaveLength(2);
    expect(result.document?.services[0]?.verificationStatus).toBe(
      "notChecked",
    );
    expect(result.document?.registrations[0]?.agentId).toBe("19353");
  });

  it("errors on invalid JSON and non-objects", () => {
    expect(parseAndValidateRegistrationJson("{").ok).toBe(false);
    expect(parseAndValidateRegistrationJson("[]").ok).toBe(false);
    expect(parseAndValidateRegistrationJson('"x"').ok).toBe(false);
  });

  it("errors on wrong/missing type and bad services", () => {
    const wrongType = parseAndValidateRegistrationJson(
      JSON.stringify({ ...VALID_DOC, type: "nope" }),
    );
    expect(wrongType.ok).toBe(false);
    expect(
      wrongType.issues.some((i) => i.code === "unexpected_type"),
    ).toBe(true);

    const badService = parseAndValidateRegistrationJson(
      JSON.stringify({
        ...VALID_DOC,
        services: [{ name: "web" }],
      }),
    );
    expect(badService.ok).toBe(false);
    expect(
      badService.issues.some((i) => i.code === "service_missing_endpoint"),
    ).toBe(true);
  });

  it("supports legacy endpoints with warning", () => {
    const { services: _s, ...rest } = VALID_DOC;
    const result = parseAndValidateRegistrationJson(
      JSON.stringify({
        ...rest,
        endpoints: [{ name: "web", endpoint: "https://example.com/" }],
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.document?.usedLegacyEndpointsField).toBe(true);
    expect(
      result.issues.some((i) => i.code === "legacy_endpoints_field"),
    ).toBe(true);
  });
});

describe("buildRegistrationMetadataEvidence", () => {
  it("emits schemaVersion 1.0 with separated URI fields", () => {
    const fetchResult = mockSuccessFetch(VALID_DOC);
    const evidence = buildRegistrationMetadataEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      onChainTokenURI: APPROVED_REGISTRATION_METADATA_URLS[0],
      approvedFetchURI: APPROVED_REGISTRATION_METADATA_URLS[0],
      observedAt: "2026-11-19T10:00:00.000Z",
      fetch: { ok: true, result: fetchResult },
    });
    expect(evidence.schemaVersion).toBe("1.0");
    expect(evidence.status).toBe("success");
    expect(evidence.onChainTokenURI).toBe(evidence.approvedFetchURI);
    expect(evidence.displayURI).toBe(evidence.approvedFetchURI);
    expect(evidence.contentSha256).toBe(fetchResult.sha256);
    expect(evidence.advertisedServices.every((s) => s.verificationStatus === "notChecked")).toBe(
      true,
    );
    expect(JSON.stringify(evidence)).not.toMatch(/bigint/i);
  });

  it("rejects non-allowlisted approvedFetchURI without fetching", () => {
    const evidence = buildRegistrationMetadataEvidence({
      network: baseSepoliaNetwork,
      agentId: 1n,
      onChainTokenURI: "https://evil.example/x",
      approvedFetchURI: "https://evil.example/x",
    });
    expect(evidence.status).toBe("rejected");
    expect(evidence.fetchErrorClass).toBe("invalidUrl");
  });

  it("maps fetch failures and schema failures", () => {
    const failed = buildRegistrationMetadataEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      onChainTokenURI: APPROVED_REGISTRATION_METADATA_URLS[0],
      approvedFetchURI: APPROVED_REGISTRATION_METADATA_URLS[0],
      fetch: {
        ok: false,
        errorClass: "tls",
        error: "certificate verify failed",
      },
    });
    expect(failed.status).toBe("fetchFailed");

    const timeout = buildRegistrationMetadataEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      onChainTokenURI: APPROVED_REGISTRATION_METADATA_URLS[0],
      approvedFetchURI: APPROVED_REGISTRATION_METADATA_URLS[0],
      fetch: { ok: false, errorClass: "timeout", error: "timed out" },
    });
    expect(timeout.status).toBe("inconclusive");

    const invalid = buildRegistrationMetadataEvidence({
      network: baseMainnetNetwork,
      agentId: 19_353n,
      onChainTokenURI: APPROVED_REGISTRATION_METADATA_URLS[0],
      approvedFetchURI: APPROVED_REGISTRATION_METADATA_URLS[0],
      fetch: { ok: true, result: mockSuccessFetch({ type: "bad" }) },
    });
    expect(invalid.status).toBe("invalidSchema");
  });
});

describe("resolveRegistrationMetadata / batch", () => {
  it("continues on per-document failure and respects concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchFn = vi.fn(async (url: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight -= 1;
      if (url.includes("agent402")) {
        throw new SecureFetchError("redirect", "Refusing redirect (301)");
      }
      return mockSuccessFetch({
        ...VALID_DOC,
        name: url,
      });
    });

    const evidences = await resolveRegistrationMetadataBatch({
      fetchFn,
      maxConcurrency: 2,
      observedAt: "2026-11-19T10:00:00.000Z",
    });

    expect(evidences).toHaveLength(3);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(evidences.filter((e) => e.status === "success")).toHaveLength(2);
    expect(evidences.find((e) => e.agentId === "94639")?.status).toBe(
      "fetchFailed",
    );
  });

  it("rejects mismatched onChainTokenURI vs approvedFetchURI", async () => {
    const evidence = await resolveRegistrationMetadata({
      chainId: 8453,
      agentId: 19_353n,
      onChainTokenURI: "https://onchainagentintel.io/other.json",
      approvedFetchURI: APPROVED_REGISTRATION_METADATA_URLS[0],
      fetchFn: async () => mockSuccessFetch(VALID_DOC),
    });
    expect(evidence.status).toBe("fetchFailed");
    expect(evidence.error).toMatch(/does not match/);
  });
});

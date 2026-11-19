import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  buildCatalogDocuments,
  sha256OfString,
  stableStringify,
} from "../src/providers/catalog.ts";
import {
  PROVIDER_LEVEL_SERVICE_ID,
  buildEvidenceId,
  buildMetadataFetchEvidence,
  buildProviderVerification,
  buildRegistryReadEvidence,
} from "../src/providers/evidence.ts";
import {
  type MetadataEvidenceInput,
  type RegistryEvidenceInput,
  buildProviderId,
  buildServiceId,
  identityKey,
  joinRegistryAndMetadata,
  mapFetchStatus,
  mapX402Advertised,
  normalizeAdvertisedServices,
  normalizeProviderRecord,
} from "../src/providers/normalize.ts";

const REGISTRY_MAIN = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const REGISTRY_SEPOLIA = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

function registryFixture(
  overrides: Partial<RegistryEvidenceInput> = {},
): RegistryEvidenceInput {
  return {
    chainId: 8453,
    registryAddress: REGISTRY_MAIN,
    agentId: "19353",
    status: "success",
    observedAt: "2026-11-19T09:10:23.986Z",
    blockNumber: "59445246",
    blockHash:
      "0xe0a8c36781cd8812dcfce171a63c3d151b01cdf1279fe5331c9376b40a9490dd",
    owner: "0xe9D45C3F847a7d2aE4efD7D6Da491f8a7E19b9F0",
    tokenURI: "https://onchainagentintel.io/agent.json",
    agentWallet: "0xB9148CD4157AD89691f86b762E9e1A166b788D45",
    rpcOrigin: "https://mainnet.base.org",
    ...overrides,
  };
}

function metadataFixture(
  overrides: Partial<MetadataEvidenceInput> = {},
): MetadataEvidenceInput {
  return {
    chainId: 8453,
    registryAddress: REGISTRY_MAIN,
    agentId: "19353",
    status: "success",
    observedAt: "2026-11-19T09:45:48.912Z",
    onChainTokenURI: "https://onchainagentintel.io/agent.json",
    approvedFetchURI: "https://onchainagentintel.io/agent.json",
    contentSha256:
      "a277e4c072391bd1d0586df6b8355caf9c7ecf35c0f9649739665793ab699c63",
    httpStatus: 200,
    contentType: "application/json",
    registration: {
      name: "Agent Zero",
      description: "Test description",
      x402Support: true,
      services: [],
    },
    advertisedServices: [
      {
        name: "web",
        endpoint: "https://onchainagentintel.io",
      },
      {
        name: "A2A",
        endpoint: "https://onchainagentintel.io/.well-known/agent-card.json",
        version: "0.3.0",
      },
    ],
    ...overrides,
  };
}

describe("provider identity", () => {
  it("builds eip155/<checksumRegistry>/<decimalAgentId> keys", () => {
    const checksummed = getAddress(REGISTRY_MAIN.toLowerCase());
    const id = buildProviderId(8453, checksummed, "19353");
    expect(id).toBe(
      `eip155:8453/${checksummed}/19353`,
    );
    expect(id).toContain("0x8004A169");
    expect(identityKey(8453, REGISTRY_MAIN.toLowerCase(), "19353")).toBe(
      identityKey(8453, checksummed, "19353"),
    );
  });

  it("treats same agentId on different chains as distinct", () => {
    const a = buildProviderId(8453, getAddress(REGISTRY_MAIN), "9136");
    const b = buildProviderId(84532, getAddress(REGISTRY_SEPOLIA), "9136");
    expect(a).not.toBe(b);
  });
});

describe("service normalization", () => {
  it("keeps valid endpoints as OTHER/notChecked with empty task claims", () => {
    const { services, incomplete } = normalizeAdvertisedServices(
      "eip155:8453/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/19353",
      [
        { name: "web", endpoint: "https://example.com/" },
        { name: "bad", endpoint: "not-a-url" },
        { name: "", endpoint: "https://example.com/x" },
      ],
    );
    expect(services).toHaveLength(1);
    expect(services[0]?.method).toBe("OTHER");
    expect(services[0]?.endpointStatus).toBe("notChecked");
    expect(services[0]?.requestSchemaStatus).toBe("notChecked");
    expect(services[0]?.claimedTaskTypes).toEqual([]);
    expect(incomplete).toHaveLength(2);
    expect(buildServiceId("web", "https://example.com/")).toMatch(/^web-/);
  });
});

describe("payment mapping", () => {
  it("maps x402Advertised conservatively and keeps observedOffers empty", () => {
    expect(mapX402Advertised(true)).toBe(true);
    expect(mapX402Advertised(false)).toBe(false);
    expect(mapX402Advertised(null)).toBeNull();
    expect(mapX402Advertised(undefined)).toBeNull();
    expect(mapFetchStatus(undefined)).toBe("notFetched");
    expect(mapFetchStatus(metadataFixture({ status: "failed" }))).toBe(
      "failed",
    );
  });
});

describe("join registry + metadata", () => {
  it("joins by full identity and preserves provenance", () => {
    const registry = registryFixture();
    const metadata = metadataFixture();
    const regEv = buildRegistryReadEvidence({ registry });
    const metaEv = buildMetadataFetchEvidence({ metadata });
    const key = identityKey(
      registry.chainId,
      registry.registryAddress,
      registry.agentId,
    );

    const { provider } = normalizeProviderRecord({
      registry,
      metadata,
      registryEvidenceId: regEv.evidenceId,
      metadataEvidenceId: metaEv.evidenceId,
    });

    expect(provider.schemaVersion).toBe("1.0");
    expect(provider.origin).toBe("external");
    expect(provider.identity.agentId).toBe("19353");
    expect(provider.identity.observedAtBlock).toBe("59445246");
    expect(provider.registration.fetchStatus).toBe("success");
    expect(provider.registration.metadataHash).toBe(metadata.contentSha256);
    expect(provider.registration.operatorEvidenceIds).toEqual([]);
    expect(provider.payment.x402Advertised).toBe(true);
    expect(provider.payment.advertisedNetworks).toEqual([]);
    expect(provider.payment.observedOffers).toEqual([]);
    expect(provider.compatibility.requestSchemaStatus).toBe("notChecked");
    expect(provider.compatibility.paymentStatus).toBe("notChecked");
    expect(provider.services.every((s) => s.endpointStatus === "notChecked")).toBe(
      true,
    );
    expect(provider.operational.evidenceIds).toEqual([
      regEv.evidenceId,
      metaEv.evidenceId,
    ]);

    const joined = joinRegistryAndMetadata({
      registryEvidences: [registry, registryFixture({ agentId: "94639", tokenURI: "https://agent402.tools/.well-known/agent-registration.json", owner: "0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0", agentWallet: "0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0" })],
      metadataEvidences: [metadata],
      evidenceIdsByKey: new Map([
        [key, { registryEvidenceId: regEv.evidenceId, metadataEvidenceId: metaEv.evidenceId }],
        [
          identityKey(8453, REGISTRY_MAIN, "94639"),
          {
            registryEvidenceId: buildEvidenceId({
              kind: "registryRead",
              providerId: buildProviderId(8453, getAddress(REGISTRY_MAIN), "94639"),
              anchor: "x",
            }),
          },
        ],
      ]),
    });
    expect(joined.providers).toHaveLength(2);
    expect(
      joined.providers.find((p) => p.identity.agentId === "94639")
        ?.registration.fetchStatus,
    ).toBe("notFetched");
  });
});

describe("verification evidence", () => {
  it("emits only registryRead + metadataFetch with deterministic ids", () => {
    const registry = registryFixture();
    const metadata = metadataFixture();
    const a = buildRegistryReadEvidence({ registry });
    const b = buildRegistryReadEvidence({ registry });
    expect(a.evidenceId).toBe(b.evidenceId);
    expect(a.kind).toBe("registryRead");
    expect(a.outcome).toBe("passed");
    expect(a.schemaVersion).toBe("1.0");

    const m = buildMetadataFetchEvidence({ metadata });
    expect(m.kind).toBe("metadataFetch");
    expect(m.http?.responseBodySha256).toBe(metadata.contentSha256);
    expect(m.payment).toBeNull();

    const provider = normalizeProviderRecord({
      registry,
      metadata,
      registryEvidenceId: a.evidenceId,
      metadataEvidenceId: m.evidenceId,
    }).provider;

    const verification = buildProviderVerification({
      provider,
      registryEvidence: a,
      metadataEvidence: m,
      evaluatedAt: "2026-11-19T10:00:00.000Z",
    });
    expect(verification.serviceId).toBe(PROVIDER_LEVEL_SERVICE_ID);
    expect(verification.derivedMilestone).toBe("metadataValidated");
    expect(verification.checks.endpointReachability.result).toBe("notChecked");
    expect(verification.checks.x402Challenge.result).toBe("notChecked");
    expect(verification.checks.paidExecution.result).toBe("notChecked");
    expect(verification.availability).toBe("unknown");
  });

  it("derives discovered when metadata missing/failed", () => {
    const registry = registryFixture();
    const a = buildRegistryReadEvidence({ registry });
    const provider = normalizeProviderRecord({
      registry,
      registryEvidenceId: a.evidenceId,
    }).provider;
    const verification = buildProviderVerification({
      provider,
      registryEvidence: a,
      metadataEvidence: null,
      evaluatedAt: "2026-11-19T10:00:00.000Z",
    });
    expect(verification.derivedMilestone).toBe("discovered");
  });
});

describe("catalog determinism", () => {
  it("produces byte-identical catalog JSON across two builds", () => {
    const registry = {
      evidences: [
        registryFixture(),
        registryFixture({
          agentId: "94639",
          owner: "0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0",
          agentWallet: "0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0",
          tokenURI:
            "https://agent402.tools/.well-known/agent-registration.json",
        }),
        registryFixture({
          chainId: 84532,
          registryAddress: REGISTRY_SEPOLIA,
          agentId: "9136",
          owner: "0x8CbB17568e6d2157c8A1AEC03747908C2eF8D131",
          agentWallet: "0x8CbB17568e6d2157c8A1AEC03747908C2eF8D131",
          tokenURI:
            "https://agents.quantjourney.cloud/.well-known/agent-registration.json",
          blockNumber: "60787849",
          rpcOrigin: "https://sepolia.base.org",
        }),
      ],
    };
    const metadata = {
      evidences: [
        metadataFixture(),
        metadataFixture({
          agentId: "94639",
          onChainTokenURI:
            "https://agent402.tools/.well-known/agent-registration.json",
          approvedFetchURI:
            "https://agent402.tools/.well-known/agent-registration.json",
          contentSha256:
            "2eb8bc1b58b23014d4d7c683979ba763ac6a4be3a31541d9a40f6dd7fd2cf3fa",
          registration: {
            name: "Agent402",
            description: "Pay-per-call",
            x402Support: true,
          },
          advertisedServices: [
            { name: "web", endpoint: "https://agent402.tools/" },
          ],
        }),
        metadataFixture({
          chainId: 84532,
          registryAddress: REGISTRY_SEPOLIA,
          agentId: "9136",
          onChainTokenURI:
            "https://agents.quantjourney.cloud/.well-known/agent-registration.json",
          approvedFetchURI:
            "https://agents.quantjourney.cloud/.well-known/agent-registration.json",
          contentSha256:
            "121502d61e2e4fe1d933351251931165cced4d19928bc6987902c9651915836a",
          registration: {
            name: "QuantJourney Research Agent Fabric",
            description: "Research",
            x402Support: false,
          },
          advertisedServices: [
            { name: "web", endpoint: "https://agents.quantjourney.cloud/" },
          ],
        }),
      ],
    };

    const generatedAt = "2026-11-19T10:00:00.000Z";
    const first = buildCatalogDocuments({
      registry,
      metadata,
      generatedAt,
    });
    const second = buildCatalogDocuments({
      registry,
      metadata,
      generatedAt,
    });

    expect(first.catalogJson).toBe(second.catalogJson);
    expect(first.verificationJson).toBe(second.verificationJson);
    expect(first.catalogSha256).toBe(second.catalogSha256);
    expect(first.catalogSha256).toBe(sha256OfString(first.catalogJson));
    expect(first.catalog.providerCount).toBe(3);
    expect(first.verification.evidenceCount).toBe(6);
    expect(
      first.verification.evidences.every(
        (e) => e.kind === "registryRead" || e.kind === "metadataFetch",
      ),
    ).toBe(true);
    expect(
      first.verification.verifications.every(
        (v) => v.derivedMilestone === "metadataValidated",
      ),
    ).toBe(true);
    expect(stableStringify(first.catalog)).toBe(first.catalogJson);
  });
});

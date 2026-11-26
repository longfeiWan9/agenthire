/**
 * D8.7 focused tests — Dual-network discovery & payment eligibility.
 *
 * STRICTLY_OFFLINE / NO_LIVE_PAYMENT / NO_SIGNING.
 */

import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  baseMainnetNetwork,
  baseSepoliaNetwork,
  IDENTITY_REGISTRY_ADDRESSES,
} from "../src/config/chains.ts";
import { buildProviderId } from "../src/providers/normalize.ts";
import { assessAdvertisedPaymentClaim } from "../src/providers/resource-analysis.ts";
import {
  CONTROLLED_PAYMENT_POLICY,
  buildQuoteAmountView,
  buildQuotePreviewFromChallenge,
} from "../src/hiring/quote-preview.ts";
import {
  parseHttp402Challenge,
  encodePaymentRequiredBase64,
} from "../src/x402/challenge-parser.ts";
import {
  evaluateOfferPolicy,
  evaluateProviderClaimWithoutChallenge,
} from "../src/x402/offer-policy.ts";
import {
  APPROVED_MAINNET_USDC,
  APPROVED_PAYMENT_NETWORKS,
  APPROVED_SEPOLIA_TEST_USDC,
  APPROVED_USDC_BY_NETWORK,
  APPROVED_X402_SCHEME,
  APPROVED_X402_VERSION,
} from "../src/x402/challenge-types.ts";
import { verifyErc7710Payment } from "../src/payment/facilitator-mock.ts";
import { createLocalEvm, TEST_ACCOUNTS } from "../src/payment/local-evm.ts";
import { buildErc7710PaymentPayload } from "../src/payment/x402-fixture.ts";
import {
  classifyRegistrationNetwork,
  getRegistrationNetworkInfo,
} from "../src/marketplace/agent-identity.ts";
import { searchMarketplaceV2 } from "../src/marketplace/search-v2.ts";
import { loadMarketplaceCatalog } from "../src/ui/catalog-store.ts";
import type { AgentProfile } from "../src/marketplace/types.ts";

const PAY_TO = "0x00000000000000000000000000000000000000Aa";
const FIXTURE_KIND = "synthetic" as const;

function exactOffer(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    scheme: APPROVED_X402_SCHEME,
    network: "eip155:84532",
    maxAmountRequired: "2500",
    resource: "https://example.test/v1/service",
    description: "synthetic",
    mimeType: "application/json",
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    asset: APPROVED_SEPOLIA_TEST_USDC,
    ...overrides,
  };
}

function envelope(accepts: Record<string, unknown>[]) {
  return { x402Version: APPROVED_X402_VERSION, error: "Payment required", accepts };
}

function stubAgent(chainId: 8453 | 84532, agentId: string): AgentProfile {
  const registry =
    chainId === 8453
      ? IDENTITY_REGISTRY_ADDRESSES.baseMainnet
      : IDENTITY_REGISTRY_ADDRESSES.baseSepolia;
  return {
    agentProfileId: `agent:eip155:${chainId}/${registry}/${agentId}`,
    displayName: `Agent ${agentId}`,
    providerId: `eip155:${chainId}/${registry}/${agentId}`,
    origin: "external",
    registryChainId: chainId,
    registryAddress: registry,
    agentId,
    sourcePaths: ["synthetic://d8.7"],
  };
}

describe("D8.7 dual-network discovery & eligibility", () => {
  it("Base Mainnet agent discovery config is available", () => {
    expect(baseMainnetNetwork.chainId).toBe(8453);
    expect(baseMainnetNetwork.caip2).toBe("eip155:8453");
    expect(baseMainnetNetwork.purposes).toContain("erc8004-discovery");
    expect(baseMainnetNetwork.purposes).toContain("future-x402-payments");
    expect(classifyRegistrationNetwork(stubAgent(8453, "19353")).id).toBe(
      "base-mainnet",
    );
    expect(getRegistrationNetworkInfo("base-mainnet").eip155).toBe("eip155:8453");
  });

  it("Base Sepolia agent discovery config is available", () => {
    expect(baseSepoliaNetwork.chainId).toBe(84532);
    expect(baseSepoliaNetwork.caip2).toBe("eip155:84532");
    expect(baseSepoliaNetwork.purposes).toContain("erc8004-discovery");
    expect(baseSepoliaNetwork.purposes).toContain("future-x402-payments");
    expect(classifyRegistrationNetwork(stubAgent(84532, "9136")).id).toBe(
      "base-sepolia",
    );
  });

  it("same numeric agent ID on two chains does not collide", () => {
    const main = buildProviderId(
      8453,
      getAddress(IDENTITY_REGISTRY_ADDRESSES.baseMainnet),
      "9136",
    );
    const sepolia = buildProviderId(
      84532,
      getAddress(IDENTITY_REGISTRY_ADDRESSES.baseSepolia),
      "9136",
    );
    expect(main).not.toBe(sepolia);
    expect(main).toContain("eip155:8453/");
    expect(sepolia).toContain("eip155:84532/");
  });

  it("Mainnet x402 offer → Mainnet payment config", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: envelope([
        exactOffer({
          network: "eip155:8453",
          asset: APPROVED_MAINNET_USDC,
        }),
      ]),
    });
    expect(parsed.ok).toBe(true);
    const policy = evaluateOfferPolicy(parsed, {
      paymentApprovalGranted: false,
    });
    expect(policy.anyStructurallyCompatible).toBe(true);
    expect(policy.evaluations[0]?.requirement?.network).toBe("eip155:8453");
    expect(policy.evaluations[0]?.requirement?.asset.toLowerCase()).toBe(
      APPROVED_USDC_BY_NETWORK["eip155:8453"].toLowerCase(),
    );
    expect(CONTROLLED_PAYMENT_POLICY.networks).toContain("eip155:8453");
    expect(CONTROLLED_PAYMENT_POLICY.usdcByNetwork["eip155:8453"]).toBe(
      APPROVED_MAINNET_USDC,
    );

    const amount = buildQuoteAmountView({
      atomicAmount: "2500",
      asset: APPROVED_MAINNET_USDC,
    });
    expect(amount.decimalsConfirmed).toBe(true);
    expect(amount.displayUsdc).toBe("0.002500");
  });

  it("Sepolia x402 offer → Sepolia payment config", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: envelope([exactOffer()]),
    });
    expect(parsed.ok).toBe(true);
    const policy = evaluateOfferPolicy(parsed, {
      paymentApprovalGranted: false,
    });
    expect(policy.anyStructurallyCompatible).toBe(true);
    expect(policy.evaluations[0]?.requirement?.network).toBe("eip155:84532");
    expect(policy.evaluations[0]?.requirement?.asset.toLowerCase()).toBe(
      APPROVED_SEPOLIA_TEST_USDC.toLowerCase(),
    );
    expect(CONTROLLED_PAYMENT_POLICY.usdcByNetwork["eip155:84532"]).toBe(
      APPROVED_SEPOLIA_TEST_USDC,
    );
  });

  it("cross-network quote substitution is rejected", () => {
    const sepoliaNetMainnetAsset = evaluateOfferPolicy(
      parseHttp402Challenge({
        fixtureKind: FIXTURE_KIND,
        httpStatus: 402,
        body: envelope([exactOffer({ asset: APPROVED_MAINNET_USDC })]),
      }),
    );
    expect(sepoliaNetMainnetAsset.anyStructurallyCompatible).toBe(false);
    expect(sepoliaNetMainnetAsset.evaluations[0]?.reasonCodes).toContain(
      "assetNotApprovedUsdcForNetwork",
    );

    const mainnetNetSepoliaAsset = assessAdvertisedPaymentClaim({
      x402Version: 2,
      scheme: "exact",
      network: "eip155:8453",
      asset: APPROVED_SEPOLIA_TEST_USDC,
      assetDecimals: 6,
      maxAmountRequired: "1",
      payTo: PAY_TO,
    });
    expect(mainnetNetSepoliaAsset.assessment).toBe("claimsPolicyMismatch");
  });

  it("non-wallet-analysis services remain discovery-eligible", () => {
    const catalog = loadMarketplaceCatalog();
    const json = searchMarketplaceV2(catalog, {
      q: "Validate JSON",
      listingScope: "all",
    });
    expect(json.totalCapabilities).toBeGreaterThan(0);
    // Discovery is not gated on wallet-activity-summary@1.0.
    expect(
      json.capabilityHits.some(
        (h) => !h.record.claimedTaskIds.includes("wallet-activity-summary@1.0"),
      ),
    ).toBe(true);

    const policy = evaluateOfferPolicy(
      parseHttp402Challenge({
        fixtureKind: FIXTURE_KIND,
        httpStatus: 402,
        body: envelope([
          exactOffer({
            resource: "https://example.test/v1/json-validate",
            description: "JSON validate — not wallet analysis",
          }),
        ]),
      }),
      { paymentApprovalGranted: true, declaredTaskId: null },
    );
    expect(policy.anyStructurallyCompatible).toBe(true);
    expect(policy.anyPolicyPass).toBe(true);
    expect(policy.evaluations[0]?.reasonCodes).toContain("taskNotBound");
  });

  it("registration alone does not imply payment compatibility", () => {
    const claim = evaluateProviderClaimWithoutChallenge({
      x402Advertised: true,
      advertisedNetworks: [...APPROVED_PAYMENT_NETWORKS],
      paymentApprovalGranted: true,
    });
    expect(claim.anyStructurallyCompatible).toBe(false);
    expect(claim.anyPolicyPass).toBe(false);

    const quote = buildQuotePreviewFromChallenge({
      hireJobId: "hire:d87-test",
      capabilityId: "cap:d87-test",
      providerKey:
        "eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136",
      method: "GET",
      endpointUrl: "https://example.test/v1/service",
      capturedAt: "2026-11-26T00:00:00.000Z",
      fixtureKind: "synthetic",
      httpStatus: 402,
      headers: {
        "PAYMENT-REQUIRED": encodePaymentRequiredBase64(envelope([exactOffer()])),
      },
      body: {},
    });
    expect(quote.structurallyCompatible).toBe(true);
    expect(quote.paymentReady).toBe(false);
    expect(quote.paymentExecutionAuthorization).toBe(false);
  });

  it("no live signing/payment via current offline UI / facilitator-mock paths", () => {
    const evm = createLocalEvm();
    const payload = buildErc7710PaymentPayload({
      amountAtomic: 100n,
      permissionContext: {
        delegationId: "dlg-missing",
        delegator: TEST_ACCOUNTS.delegator,
        proof: "0x73796e746865746963",
      },
      payTo: TEST_ACCOUNTS.payTo,
    });
    const verified = verifyErc7710Payment(evm, payload);
    expect(verified.simulated).toBe(true);
    expect(verified.ok).toBe(false);

    const quote = buildQuotePreviewFromChallenge({
      hireJobId: "hire:offline",
      capabilityId: "cap:offline",
      providerKey: "provider:offline",
      method: "GET",
      endpointUrl: null,
      capturedAt: "2026-11-26T00:00:00.000Z",
      fixtureKind: "synthetic",
      httpStatus: 402,
      headers: {},
      body: envelope([exactOffer()]),
    });
    expect(quote.paymentReady).toBe(false);
    expect(quote.executionAuthorization).toBe(false);
    expect(quote.paymentExecutionAuthorization).toBe(false);
  });
});

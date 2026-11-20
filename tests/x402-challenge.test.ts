import { describe, expect, it } from "vitest";
import {
  encodePaymentRequiredBase64,
  parseHttp402Challenge,
  parsePaymentRequiredObject,
} from "../src/x402/challenge-parser.ts";
import {
  APPROVED_PAYMENT_NETWORK,
  APPROVED_SEPOLIA_TEST_USDC,
  APPROVED_X402_SCHEME,
  APPROVED_X402_VERSION,
  MVP_TASK_ID,
} from "../src/x402/challenge-types.ts";
import {
  evaluateOfferPolicy,
  evaluateProviderClaimWithoutChallenge,
} from "../src/x402/offer-policy.ts";

/** Label: synthetic — not live provider evidence. */
const FIXTURE_KIND = "synthetic" as const;

const SEPOLIA_PAY_TO = "0x00000000000000000000000000000000000000Aa";

function sepoliaExactOffer(
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    scheme: APPROVED_X402_SCHEME,
    network: APPROVED_PAYMENT_NETWORK,
    maxAmountRequired: "10000",
    resource: "https://example.test/v1/wallet-activity-summary",
    description: "synthetic fixture",
    mimeType: "application/json",
    payTo: SEPOLIA_PAY_TO,
    maxTimeoutSeconds: 60,
    asset: APPROVED_SEPOLIA_TEST_USDC,
    ...overrides,
  };
}

function paymentRequiredEnvelope(
  accepts: Record<string, unknown>[],
  version: number = APPROVED_X402_VERSION,
): Record<string, unknown> {
  return {
    x402Version: version,
    error: "Payment required",
    accepts,
  };
}

describe("x402 challenge parser (offline, synthetic)", () => {
  it("parses a valid synthetic v2 Payment Required from PAYMENT-REQUIRED header", () => {
    const envelope = paymentRequiredEnvelope([sepoliaExactOffer()]);
    const encoded = encodePaymentRequiredBase64(envelope);
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      headers: { "PAYMENT-REQUIRED": encoded },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.fixtureKind).toBe("synthetic");
    expect(parsed.challenge.x402Version).toBe(2);
    expect(parsed.challenge.accepts).toHaveLength(1);
    expect(parsed.challenge.accepts[0]?.scheme).toBe("exact");
    expect(parsed.challenge.accepts[0]?.network).toBe("eip155:84532");
    expect(parsed.challenge.accepts[0]?.asset.toLowerCase()).toBe(
      APPROVED_SEPOLIA_TEST_USDC.toLowerCase(),
    );
    expect(parsed.challenge.accepts[0]?.amount).toBe("10000");
    expect(parsed.challenge.source).toBe("header");
  });

  it("parses valid synthetic v2 from JSON body when header absent", () => {
    const envelope = paymentRequiredEnvelope([sepoliaExactOffer()]);
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: envelope,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.challenge.source).toBe("body");
  });

  it("rejects non-402 HTTP status", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 200,
      body: paymentRequiredEnvelope([sepoliaExactOffer()]),
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("notHttp402");
  });

  it("rejects unsupported x402 version", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: paymentRequiredEnvelope([sepoliaExactOffer()], 1),
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("unsupportedX402Version");
  });

  it("rejects missing Payment Required payload", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      headers: {},
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("missingPaymentRequired");
  });

  it("rejects malformed base64 PAYMENT-REQUIRED", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      headers: { "payment-required": "***not-base64***" },
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("invalidBase64");
  });

  it("rejects invalid JSON inside base64 header", () => {
    const encoded = Buffer.from("{not-json", "utf8").toString("base64");
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      headers: { "PAYMENT-REQUIRED": encoded },
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("invalidJson");
  });

  it("rejects missing accepts / empty accepts", () => {
    const missing = parsePaymentRequiredObject(
      { x402Version: 2 },
      { fixtureKind: FIXTURE_KIND, httpStatus: 402 },
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("missingAccepts");

    const empty = parsePaymentRequiredObject(
      { x402Version: 2, accepts: [] },
      { fixtureKind: FIXTURE_KIND, httpStatus: 402 },
    );
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe("emptyAccepts");
  });

  it("rejects malformed accepts entry (bad amount / payTo / asset)", () => {
    const badAmount = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: paymentRequiredEnvelope([
        sepoliaExactOffer({ maxAmountRequired: "12.5" }),
      ]),
    });
    expect(badAmount.ok).toBe(false);
    if (!badAmount.ok) expect(badAmount.reason).toBe("invalidAmount");

    const badPayTo = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: paymentRequiredEnvelope([
        sepoliaExactOffer({ payTo: "not-an-address" }),
      ]),
    });
    expect(badPayTo.ok).toBe(false);
    if (!badPayTo.ok) expect(badPayTo.reason).toBe("invalidPayTo");

    const badAsset = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: paymentRequiredEnvelope([
        sepoliaExactOffer({ asset: "USDC" }),
      ]),
    });
    expect(badAsset.ok).toBe(false);
    if (!badAsset.ok) expect(badAsset.reason).toBe("invalidAsset");
  });

  it("parses multiple alternatives without implying policy pass", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: paymentRequiredEnvelope([
        sepoliaExactOffer({ maxAmountRequired: "1" }),
        sepoliaExactOffer({
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          maxAmountRequired: "2",
        }),
      ]),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.challenge.accepts).toHaveLength(2);

    const policy = evaluateOfferPolicy(parsed, {
      paymentApprovalGranted: false,
      declaredTaskId: null,
    });
    expect(policy.parseOk).toBe(true);
    expect(policy.anyStructurallyCompatible).toBe(true);
    expect(policy.anyPolicyPass).toBe(false);
    expect(policy.evaluations[1]?.reasonCodes).toContain("networkMainnetRejected");
    expect(policy.evaluations[0]?.reasonCodes).toContain(
      "multipleAlternativesEvaluated",
    );
  });
});

describe("x402 offer policy (offline, synthetic)", () => {
  it("marks well-formed Sepolia exact offer structurallyCompatible but policyPass false without approval", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: paymentRequiredEnvelope([sepoliaExactOffer()]),
    });
    const policy = evaluateOfferPolicy(parsed, {
      paymentApprovalGranted: false,
      declaredTaskId: MVP_TASK_ID,
    });
    expect(policy.anyStructurallyCompatible).toBe(true);
    expect(policy.anyPolicyPass).toBe(false);
    expect(policy.evaluations[0]?.reasonCodes).toContain(
      "paymentApprovalNotGranted",
    );
  });

  it("rejects Mainnet network even when parse succeeds", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: paymentRequiredEnvelope([
        sepoliaExactOffer({ network: "eip155:8453" }),
      ]),
    });
    expect(parsed.ok).toBe(true);
    const policy = evaluateOfferPolicy(parsed, {
      paymentApprovalGranted: true,
      declaredTaskId: MVP_TASK_ID,
    });
    expect(policy.anyStructurallyCompatible).toBe(false);
    expect(policy.anyPolicyPass).toBe(false);
    expect(policy.evaluations[0]?.reasonCodes).toContain(
      "networkMainnetRejected",
    );
  });

  it("rejects wrong USDC asset address", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: paymentRequiredEnvelope([
        sepoliaExactOffer({
          // Base Mainnet USDC — not approved for AgentHire payments
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        }),
      ]),
    });
    const policy = evaluateOfferPolicy(parsed);
    expect(policy.anyStructurallyCompatible).toBe(false);
    expect(policy.evaluations[0]?.reasonCodes).toContain(
      "assetNotApprovedSepoliaUsdc",
    );
  });

  it("rejects unsupported scheme", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: paymentRequiredEnvelope([
        sepoliaExactOffer({ scheme: "upto" }),
      ]),
    });
    const policy = evaluateOfferPolicy(parsed);
    expect(policy.anyStructurallyCompatible).toBe(false);
    expect(policy.evaluations[0]?.reasonCodes).toContain("unsupportedScheme");
  });

  it("does not treat provider-level x402Advertised as observed challenge", () => {
    const policy = evaluateProviderClaimWithoutChallenge({
      x402Advertised: true,
      advertisedNetworks: [],
      paymentApprovalGranted: true,
    });
    expect(policy.parseOk).toBe(false);
    expect(policy.anyPolicyPass).toBe(false);
    expect(policy.anyStructurallyCompatible).toBe(false);
  });

  it("policyPass true only with parse + structural + approval + task bind (synthetic)", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: paymentRequiredEnvelope([sepoliaExactOffer()]),
    });
    const denied = evaluateOfferPolicy(parsed, {
      paymentApprovalGranted: true,
      declaredTaskId: "wallet-analytics",
    });
    expect(denied.anyPolicyPass).toBe(false);
    expect(denied.evaluations[0]?.reasonCodes).toContain("taskNotBound");

    const allowed = evaluateOfferPolicy(parsed, {
      paymentApprovalGranted: true,
      declaredTaskId: MVP_TASK_ID,
    });
    expect(allowed.anyStructurallyCompatible).toBe(true);
    expect(allowed.anyPolicyPass).toBe(true);
  });

  it("failed parse never yields policy pass", () => {
    const parsed = parseHttp402Challenge({
      fixtureKind: FIXTURE_KIND,
      httpStatus: 402,
      body: { x402Version: 9, accepts: [sepoliaExactOffer()] },
    });
    const policy = evaluateOfferPolicy(parsed, {
      paymentApprovalGranted: true,
      declaredTaskId: MVP_TASK_ID,
    });
    expect(policy.parseOk).toBe(false);
    expect(policy.anyPolicyPass).toBe(false);
  });
});

/**
 * Conservative recognition of unsigned `/.well-known/x402` responses (D4.3c).
 *
 * Separates document recognition from protocol parse (challenge-parser) and
 * Sepolia policy (offer-policy). Manifest JSON = claims only — advertised
 * resources / facilitator URLs are summarized, never fetched.
 *
 * Shapes recognized (fail closed otherwise):
 * - Well-known discovery manifest (draft-hawkins / domain-discovery style)
 * - PaymentRequired envelope (x402Version + accepts) as JSON body
 * - Legacy fan-out `{ version, resources: string[] }`
 */

import { createHash } from "node:crypto";
import {
  parseHttp402Challenge,
  parsePaymentRequiredObject,
  type Http402Fixture,
} from "../x402/challenge-parser.ts";
import {
  MVP_TASK_ID,
  type ChallengeParseResult,
  type OfferPolicyResult,
} from "../x402/challenge-types.ts";
import { evaluateOfferPolicy } from "../x402/offer-policy.ts";

export const X402_DISCOVERY_DOCUMENT_VERSION = "1.0" as const;

export type X402DocumentRecognitionKind =
  | "wellKnownManifest"
  | "paymentRequiredEnvelope"
  | "legacyResourceList"
  | "unrecognizedJson"
  | "nonJson"
  | "empty";

export type AdvertisedResourceClaim = {
  readonly url: string | null;
  readonly method: string | null;
  readonly description: string | null;
  readonly sameHostClaim: boolean | null;
  /** Always false in D4.3c — claims are never followed. */
  readonly fetched: false;
};

/** Cap stored resource samples in evidence (full count still recorded). */
export const X402_ADVERTISED_RESOURCE_SAMPLE_LIMIT = 25 as const;

export type X402DiscoveryDocumentSummary = {
  readonly recognitionKind: X402DocumentRecognitionKind;
  readonly x402Version: number | null;
  readonly kind: string | null;
  readonly name: string | null;
  readonly description: string | null;
  readonly rawTopLevelKeys: readonly string[];
  /** Sample only — see advertisedResourceCount for full claim count. */
  readonly advertisedResources: readonly AdvertisedResourceClaim[];
  readonly advertisedResourceCount: number;
  readonly advertisedResourcesTruncated: boolean;
  readonly facilitatorBaseUrl: string | null;
  readonly facilitatorEndpointPaths: readonly string[];
  readonly facilitatorNetworks: readonly string[];
  readonly facilitatorSchemes: readonly string[];
  readonly facilitatorAssets: readonly {
    readonly network: string | null;
    readonly address: string | null;
    readonly symbol: string | null;
    readonly decimals: number | null;
  }[];
  readonly docsUrl: string | null;
  readonly updated: string | null;
  readonly notes: string;
};

export type X402DocumentParseResult =
  | {
      readonly ok: true;
      readonly summary: X402DiscoveryDocumentSummary;
      /** Present when body itself looks like PaymentRequired. */
      readonly bodyChallengeParse: ChallengeParseResult | null;
      readonly bodyPolicy: OfferPolicyResult | null;
    }
  | {
      readonly ok: false;
      readonly reason: "invalidJson" | "invalidDocument" | "emptyBody";
      readonly message: string;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function sameHostOrSubdomain(
  resourceUrl: string,
  manifestHost: string,
): boolean | null {
  const host = hostnameOf(resourceUrl);
  if (!host) return null;
  return host === manifestHost || host.endsWith(`.${manifestHost}`);
}

function summarizeResourceEntry(
  entry: unknown,
  manifestHost: string | null,
): AdvertisedResourceClaim {
  if (typeof entry === "string") {
    const same =
      manifestHost != null ? sameHostOrSubdomain(entry, manifestHost) : null;
    return {
      url: entry,
      method: null,
      description: null,
      sameHostClaim: same,
      fetched: false,
    };
  }
  if (!isPlainObject(entry)) {
    return {
      url: null,
      method: null,
      description: null,
      sameHostClaim: null,
      fetched: false,
    };
  }
  const url =
    typeof entry.url === "string" && entry.url.trim() ? entry.url.trim() : null;
  const method =
    typeof entry.method === "string" && entry.method.trim()
      ? entry.method.trim().toUpperCase()
      : null;
  const description =
    typeof entry.description === "string" ? entry.description : null;
  const same =
    url && manifestHost != null
      ? sameHostOrSubdomain(url, manifestHost)
      : null;
  return {
    url,
    method,
    description,
    sameHostClaim: same,
    fetched: false,
  };
}

function parseFacilitatorKinds(
  kinds: unknown,
): { networks: string[]; schemes: string[] } {
  const networks: string[] = [];
  const schemes: string[] = [];
  if (!Array.isArray(kinds)) return { networks, schemes };
  for (const k of kinds) {
    if (!isPlainObject(k)) continue;
    if (typeof k.network === "string" && k.network.trim()) {
      networks.push(k.network.trim());
    }
    if (typeof k.scheme === "string" && k.scheme.trim()) {
      schemes.push(k.scheme.trim());
    }
  }
  return { networks, schemes };
}

function parseFacilitatorAssets(
  assets: unknown,
): X402DiscoveryDocumentSummary["facilitatorAssets"] {
  if (!Array.isArray(assets)) return [];
  const out: Array<
    X402DiscoveryDocumentSummary["facilitatorAssets"][number]
  > = [];
  for (const a of assets) {
    if (!isPlainObject(a)) continue;
    out.push({
      network: typeof a.network === "string" ? a.network : null,
      address: typeof a.address === "string" ? a.address : null,
      symbol: typeof a.symbol === "string" ? a.symbol : null,
      decimals:
        typeof a.decimals === "number" && Number.isInteger(a.decimals)
          ? a.decimals
          : null,
    });
  }
  return out;
}

function looksLikePaymentRequired(value: Record<string, unknown>): boolean {
  return (
    "x402Version" in value &&
    "accepts" in value &&
    Array.isArray(value.accepts)
  );
}

function looksLikeWellKnownManifest(value: Record<string, unknown>): boolean {
  if (!("x402Version" in value)) return false;
  if (typeof value.kind === "string") return true;
  if ("resources" in value || "facilitator" in value) return true;
  return false;
}

function looksLikeLegacyResourceList(value: Record<string, unknown>): boolean {
  return (
    ("version" in value || "x402Version" in value) &&
    Array.isArray(value.resources) &&
    !("accepts" in value)
  );
}

/**
 * Recognize and summarize a 2xx JSON body from `/.well-known/x402`.
 * Does not fetch advertised resources. Does not invent PAYMENT-REQUIRED fields.
 */
export function parseX402DiscoveryDocumentBytes(
  body: Buffer,
  options?: { readonly manifestUrl?: string },
): X402DocumentParseResult {
  if (!body || body.length === 0) {
    return { ok: false, reason: "emptyBody", message: "Empty response body" };
  }

  let json: unknown;
  try {
    json = JSON.parse(body.toString("utf8"));
  } catch (err) {
    return {
      ok: false,
      reason: "invalidJson",
      message: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!isPlainObject(json)) {
    return {
      ok: false,
      reason: "invalidDocument",
      message: "x402 discovery body is not a JSON object",
    };
  }

  const rawTopLevelKeys = Object.keys(json).sort();
  const manifestHost = options?.manifestUrl
    ? hostnameOf(options.manifestUrl)
    : null;

  // PaymentRequired envelope as body (possible even on 200 for some vendors).
  if (looksLikePaymentRequired(json)) {
    const bodyChallengeParse = parsePaymentRequiredObject(json, {
      fixtureKind: "captured",
      httpStatus: null,
      source: "body",
    });
    const bodyPolicy = evaluateOfferPolicy(bodyChallengeParse, {
      paymentApprovalGranted: false,
      declaredTaskId: null,
    });
    const accepts = Array.isArray(json.accepts) ? json.accepts : [];
    const advertisedResources: AdvertisedResourceClaim[] = [];
    if (isPlainObject(json.resource) && typeof json.resource.url === "string") {
      advertisedResources.push(
        summarizeResourceEntry(json.resource, manifestHost),
      );
    } else if (typeof json.resource === "string") {
      advertisedResources.push(
        summarizeResourceEntry(json.resource, manifestHost),
      );
    }
    for (const entry of accepts) {
      if (isPlainObject(entry) && typeof entry.resource === "string") {
        advertisedResources.push(
          summarizeResourceEntry(
            {
              url: entry.resource,
              method: null,
              description: entry.description,
            },
            manifestHost,
          ),
        );
      }
    }

    return {
      ok: true,
      summary: {
        recognitionKind: "paymentRequiredEnvelope",
        x402Version:
          typeof json.x402Version === "number" ? json.x402Version : null,
        kind: null,
        name: null,
        description: typeof json.error === "string" ? json.error : null,
        rawTopLevelKeys,
        advertisedResources: advertisedResources.slice(
          0,
          X402_ADVERTISED_RESOURCE_SAMPLE_LIMIT,
        ),
        advertisedResourceCount: advertisedResources.length,
        advertisedResourcesTruncated:
          advertisedResources.length > X402_ADVERTISED_RESOURCE_SAMPLE_LIMIT,
        facilitatorBaseUrl: null,
        facilitatorEndpointPaths: [],
        facilitatorNetworks: [],
        facilitatorSchemes: [],
        facilitatorAssets: [],
        docsUrl: null,
        updated: null,
        notes:
          `Body recognized as PaymentRequired envelope (accepts=${accepts.length}); ` +
          `MVP task ${MVP_TASK_ID} not bound from discovery body alone; resources not fetched`,
      },
      bodyChallengeParse,
      bodyPolicy,
    };
  }

  if (looksLikeWellKnownManifest(json) || looksLikeLegacyResourceList(json)) {
    const recognitionKind: X402DocumentRecognitionKind =
      looksLikeWellKnownManifest(json) && typeof json.kind === "string"
        ? "wellKnownManifest"
        : looksLikeLegacyResourceList(json)
          ? "legacyResourceList"
          : "wellKnownManifest";

    const resourcesRaw = Array.isArray(json.resources) ? json.resources : [];
    const allResources = resourcesRaw.map((r) =>
      summarizeResourceEntry(r, manifestHost),
    );
    const advertisedResourcesTruncated =
      allResources.length > X402_ADVERTISED_RESOURCE_SAMPLE_LIMIT;
    const advertisedResources = allResources.slice(
      0,
      X402_ADVERTISED_RESOURCE_SAMPLE_LIMIT,
    );

    let facilitatorBaseUrl: string | null = null;
    let facilitatorEndpointPaths: string[] = [];
    let facilitatorNetworks: string[] = [];
    let facilitatorSchemes: string[] = [];
    let facilitatorAssets: X402DiscoveryDocumentSummary["facilitatorAssets"] =
      [];

    if (isPlainObject(json.facilitator)) {
      const f = json.facilitator;
      if (typeof f.baseUrl === "string" && f.baseUrl.trim()) {
        facilitatorBaseUrl = f.baseUrl.trim();
      }
      if (isPlainObject(f.endpoints)) {
        facilitatorEndpointPaths = Object.entries(f.endpoints)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => `${k}:${v as string}`)
          .sort();
      }
      const kinds = parseFacilitatorKinds(f.kinds);
      facilitatorNetworks = kinds.networks;
      facilitatorSchemes = kinds.schemes;
      facilitatorAssets = parseFacilitatorAssets(f.assets);
    }

    const x402Version =
      typeof json.x402Version === "number"
        ? json.x402Version
        : typeof json.version === "number"
          ? json.version
          : null;

    return {
      ok: true,
      summary: {
        recognitionKind,
        x402Version,
        kind: typeof json.kind === "string" ? json.kind : null,
        name: typeof json.name === "string" ? json.name : null,
        description:
          typeof json.description === "string" ? json.description : null,
        rawTopLevelKeys,
        advertisedResources,
        advertisedResourceCount: allResources.length,
        advertisedResourcesTruncated,
        facilitatorBaseUrl,
        facilitatorEndpointPaths,
        facilitatorNetworks,
        facilitatorSchemes,
        facilitatorAssets,
        docsUrl: typeof json.docs === "string" ? json.docs : null,
        updated: typeof json.updated === "string" ? json.updated : null,
        notes:
          "Discovery manifest claims only — advertised resources/facilitator endpoints were NOT fetched; " +
          `does not establish ${MVP_TASK_ID} or Sepolia payment compatibility` +
          (advertisedResourcesTruncated
            ? `; resource sample truncated to ${X402_ADVERTISED_RESOURCE_SAMPLE_LIMIT} of ${allResources.length}`
            : ""),
      },
      bodyChallengeParse: null,
      bodyPolicy: null,
    };
  }

  return {
    ok: true,
    summary: {
      recognitionKind: "unrecognizedJson",
      x402Version:
        typeof json.x402Version === "number" ? json.x402Version : null,
      kind: typeof json.kind === "string" ? json.kind : null,
      name: typeof json.name === "string" ? json.name : null,
      description:
        typeof json.description === "string" ? json.description : null,
      rawTopLevelKeys,
      advertisedResources: [],
      advertisedResourceCount: 0,
      advertisedResourcesTruncated: false,
      facilitatorBaseUrl: null,
      facilitatorEndpointPaths: [],
      facilitatorNetworks: [],
      facilitatorSchemes: [],
      facilitatorAssets: [],
      docsUrl: null,
      updated: null,
      notes:
        "JSON object did not match well-known manifest, legacy resource list, or PaymentRequired envelope",
    },
    bodyChallengeParse: null,
    bodyPolicy: null,
  };
}

/**
 * HTTP-transport PAYMENT-REQUIRED parse for a captured exchange.
 * Canonical v2 HTTP location is the PAYMENT-REQUIRED header (base64).
 * Parser ≠ Sepolia policy pass. paymentApprovalGranted stays false.
 */
export function evaluateCapturedChallenge(fixture: Http402Fixture): {
  readonly challengeParse: ChallengeParseResult;
  readonly policy: OfferPolicyResult;
} {
  const challengeParse = parseHttp402Challenge({
    ...fixture,
    fixtureKind: fixture.fixtureKind ?? "captured",
  });
  const policy = evaluateOfferPolicy(challengeParse, {
    paymentApprovalGranted: false,
    declaredTaskId: null,
  });
  return { challengeParse, policy };
}

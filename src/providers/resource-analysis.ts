/**
 * Offline advertised x402 resource-catalog analysis (D4.4).
 *
 * STRICTLY_OFFLINE — no DNS / HTTP / RPC / facilitator / browser.
 * Analyzes recoverable discovery evidence only; does not invent missing
 * catalog entries. SHA alone ≠ full body recoverable.
 *
 * inspectionStatus is always `notChecked`. approvedForNetworkExecution is
 * always false. Payment assessments are metadata claims only — never a live
 * challenge. No B4 catalog upgrades.
 */

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { getAddress, isAddress, isAddressEqual } from "viem";
import { isBlockedIpAddress } from "../erc8004/secure-https.ts";
import {
  APPROVED_PAYMENT_NETWORKS,
  APPROVED_USDC_BY_NETWORK,
  APPROVED_X402_SCHEME,
  APPROVED_X402_VERSION,
  MVP_TASK_ID,
  approvedUsdcForNetwork,
  isApprovedPaymentNetwork,
} from "../x402/challenge-types.ts";
import { sanitizeEndpointForArtifact } from "./inspection-policy.ts";

export const RESOURCE_ANALYSIS_VERSION = "1.0" as const;
export const RESOURCE_ANALYSIS_MODE =
  "READ_ONLY / NO_SIGNING / NO_PAYMENT / STRICTLY_OFFLINE" as const;

export type CatalogCoverage =
  | "complete"
  | "sampleOnly"
  | "partial"
  | "unavailable";

export type ResourceCategory =
  | "walletAnalytics"
  | "blockchainData"
  | "defi"
  | "marketData"
  | "research"
  | "aiInference"
  | "agentDiscovery"
  | "developerInfrastructure"
  | "payments"
  | "content"
  | "other"
  | "unknown";

export type ResourceTaskRelevance =
  | "explicitMatch"
  | "adaptableCandidate"
  | "potentiallyRelated"
  | "unrelated"
  | "unknown";

export type AdvertisedPaymentAssessment =
  | "claimsPolicyMatch"
  | "claimsPolicyMismatch"
  | "insufficientInformation";

export type CandidatePriority = "high" | "medium" | "low";

/** Optional payment metadata claimed on a resource entry (never live). */
export type AdvertisedPaymentClaim = {
  readonly x402Version?: number | null;
  readonly scheme?: string | null;
  readonly network?: string | null;
  readonly asset?: string | null;
  readonly assetDecimals?: number | null;
  readonly maxAmountRequired?: string | null;
  readonly payTo?: string | null;
  readonly description?: string | null;
};

/** Raw recoverable claim — fields adapted from D4.3c AdvertisedResourceClaim. */
export type RawAdvertisedResourceInput = {
  readonly url?: string | null;
  readonly method?: string | null;
  readonly description?: string | null;
  readonly sameHostClaim?: boolean | null;
  readonly id?: string | null;
  readonly resourceId?: string | null;
  readonly taskId?: string | null;
  readonly taskType?: string | null;
  readonly claimedTaskTypes?: readonly string[] | null;
  readonly payment?: AdvertisedPaymentClaim | null;
  /** Synthetic fixtures must be labeled. Captured evidence omits this. */
  readonly fixtureKind?: "synthetic" | "captured";
};

export type CatalogSourceEvidence = {
  readonly discoveryId: string;
  readonly provider: string;
  readonly approvedUrl: string;
  readonly contentSha256: string | null;
  readonly byteLength: number | null;
  readonly reportedResourceCount: number;
  readonly recoverableResourceCount: number;
  readonly truncated: boolean;
  readonly recognitionKind: string | null;
  readonly x402Version: number | null;
  readonly fullBodyRecoverable: boolean;
  readonly sourcePath: string;
  readonly resources: readonly RawAdvertisedResourceInput[];
};

export type UrlSafetyFlags = {
  readonly ok: boolean;
  readonly scheme: string | null;
  readonly hasCredentials: boolean;
  readonly hasPathTemplate: boolean;
  readonly hasQuery: boolean;
  readonly hasFragment: boolean;
  readonly literalIpHost: boolean;
  readonly literalIpBlocked: boolean;
  readonly hasSecretQuery: boolean;
  readonly methodKnown: boolean;
  readonly methodSafeGetCandidate: boolean;
  readonly notes: readonly string[];
};

export type AdvertisedResource = {
  readonly resourceId: string;
  readonly sourceDiscoveryId: string;
  readonly provider: string;
  readonly url: string | null;
  readonly sanitizedUrl: string | null;
  /** Claimed method only — never defaulted to GET. */
  readonly method: string | null;
  readonly description: string | null;
  readonly sameHostClaim: boolean | null;
  readonly inspectionStatus: "notChecked";
  readonly categories: readonly ResourceCategory[];
  readonly taskRelevance: ResourceTaskRelevance;
  readonly taskRelevanceNotes: string;
  readonly adapterNeeds: string | null;
  readonly paymentAssessment: AdvertisedPaymentAssessment;
  readonly paymentNotes: string;
  readonly urlSafety: UrlSafetyFlags;
  readonly family: string;
  readonly fixtureKind: "synthetic" | "captured";
  readonly duplicateUrl: boolean;
  readonly duplicateId: boolean;
};

export type ResourceInspectionCandidate = {
  readonly resourceId: string;
  readonly provider: string;
  readonly sourceDiscoveryId: string;
  readonly sanitizedUrl: string | null;
  readonly method: string | null;
  readonly categories: readonly ResourceCategory[];
  readonly taskRelevance: ResourceTaskRelevance;
  readonly priority: CandidatePriority;
  readonly score: number;
  readonly rationale: string;
  readonly adapterNeeds: string | null;
  readonly paymentAssessment: AdvertisedPaymentAssessment;
  readonly approvedForNetworkExecution: false;
  readonly b4Upgrades: {
    readonly endpointReachable: false;
    readonly challengeVerified: false;
    readonly paymentCompatible: false;
    readonly paidVerified: false;
  };
};

export type CoverageSummary = {
  readonly coverage: CatalogCoverage;
  readonly reportedResourceCount: number;
  readonly recoverableResourceCount: number;
  readonly rawEntryCount: number;
  readonly uniqueUrlCount: number;
  readonly uniqueMethodUrlCount: number;
  readonly uniqueIdCount: number;
  readonly familyCounts: Readonly<Record<string, number>>;
  readonly categoryCounts: Readonly<Record<ResourceCategory, number>>;
  readonly taskRelevanceCounts: Readonly<
    Record<ResourceTaskRelevance, number>
  >;
  readonly paymentAssessmentCounts: Readonly<
    Record<AdvertisedPaymentAssessment, number>
  >;
  readonly sampleLimitObserved: number | null;
  readonly orderingPreserved: true;
  readonly sources: readonly {
    readonly discoveryId: string;
    readonly provider: string;
    readonly sourcePath: string;
    readonly contentSha256: string | null;
    readonly byteLength: number | null;
    readonly reportedResourceCount: number;
    readonly recoverableResourceCount: number;
    readonly truncated: boolean;
    readonly fullBodyRecoverable: boolean;
    readonly notes: string;
  }[];
  readonly honestyNotes: readonly string[];
};

export type ResourceCatalogAnalysisDocument = {
  readonly schemaVersion: "1.0";
  readonly mode: typeof RESOURCE_ANALYSIS_MODE;
  readonly kind: "resourceCatalogAnalysis";
  readonly analysisVersion: typeof RESOURCE_ANALYSIS_VERSION;
  readonly mvpTaskId: typeof MVP_TASK_ID;
  readonly coverage: CoverageSummary;
  readonly resources: readonly AdvertisedResource[];
  readonly shortlist: readonly ResourceInspectionCandidate[];
  readonly b4Upgrades: {
    readonly endpointReachable: false;
    readonly challengeVerified: false;
    readonly paymentCompatible: false;
    readonly paidVerified: false;
  };
};

export type ResourceInspectionShortlistDocument = {
  readonly schemaVersion: "1.0";
  readonly mode: typeof RESOURCE_ANALYSIS_MODE;
  readonly kind: "resourceInspectionShortlist";
  readonly analysisVersion: typeof RESOURCE_ANALYSIS_VERSION;
  readonly mvpTaskId: typeof MVP_TASK_ID;
  readonly coverage: CatalogCoverage;
  readonly candidateCount: number;
  readonly maxCandidates: 3;
  readonly approvedForNetworkExecutionTrue: 0;
  readonly candidates: readonly ResourceInspectionCandidate[];
  readonly notes: readonly string[];
};

const SECRET_QUERY_KEYS = new Set([
  "api_key",
  "apikey",
  "token",
  "access_token",
  "auth",
  "authorization",
  "password",
  "secret",
  "key",
  "signature",
  "sig",
]);

const PATH_TEMPLATE_RE = /\{[^/{}]+\}|%7B[^/%]+%7D/i;

const KNOWN_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const EXPLICIT_TASK_TOKENS = new Set([
  MVP_TASK_ID,
  "wallet-activity-summary",
  "wallet-activity-summary@1.0",
]);

/** Concrete wallet/chain function tokens (not mere keyword similarity). */
const ADAPTABLE_FUNCTION_HINTS = [
  "wallet activity",
  "wallet-activity",
  "wallet_activity",
  "transaction history",
  "tx history",
  "transaction receipt",
  "getblockbynumber",
  "eth_getblockbynumber",
  "eth_gettransactionreceipt",
  "block range",
  "native value",
  "wallet transactions",
  "address transactions",
  "base mainnet transactions",
] as const;

const POTENTIALLY_RELATED_HINTS = [
  "wallet",
  "blockchain",
  "transaction",
  "transactions",
  "on-chain",
  "onchain",
  "evm",
  "ethereum",
  "base mainnet",
  "defi",
  "portfolio",
  "token transfer",
  "financial analysis",
] as const;

const CATEGORY_RULES: readonly {
  readonly category: ResourceCategory;
  readonly patterns: readonly RegExp[];
}[] = [
  {
    category: "walletAnalytics",
    patterns: [
      /\bwallet[-_ ]?(activity|analytics|summary|portfolio)\b/i,
      /\baddress[-_ ]?(activity|analytics)\b/i,
    ],
  },
  {
    category: "blockchainData",
    patterns: [
      /\b(block|blocks|receipt|receipts|tx|txs|transaction)\b/i,
      /\beth[_-]?get/i,
      /\bon[-_]?chain\b/i,
      /\bblockchain\b/i,
      /\bevm\b/i,
    ],
  },
  {
    category: "defi",
    patterns: [/\bdefi\b/i, /\blending\b/i, /\blyield\b/i, /\blp\b/i],
  },
  {
    category: "marketData",
    patterns: [
      /\bmarket[-_ ]?data\b/i,
      /\bprice(s)?\b/i,
      /\bticker\b/i,
      /\bohlc\b/i,
    ],
  },
  {
    category: "research",
    patterns: [
      /\bresearch\b/i,
      /\bdiligence\b/i,
      /\bfilings?\b/i,
      /\breport(s)?\b/i,
    ],
  },
  {
    category: "aiInference",
    patterns: [
      /\bllm\b/i,
      /\binference\b/i,
      /\bopenai\b/i,
      /\banthropic\b/i,
      /\bmodel[-_ ]?call/i,
    ],
  },
  {
    category: "agentDiscovery",
    patterns: [
      /\bwell-known\b/i,
      /\bagent[-_ ]?card\b/i,
      /\bcatalog[-_ ]?find\b/i,
      /\bx402[-_ ]?index\b/i,
      /\bdiscovery\b/i,
    ],
  },
  {
    category: "developerInfrastructure",
    patterns: [
      /\b(hash|hmac|base64|hex|uuid|ulid|jwt|password|dns|meta)\b/i,
      /\bopenapi\b/i,
      /\bmemory\b/i,
      /\burl-code\b/i,
      /\bextract\b/i,
    ],
  },
  {
    category: "payments",
    patterns: [
      /\bx402\b/i,
      /\bpayment\b/i,
      /\bfacilitator\b/i,
      /\bsettle(ment)?\b/i,
    ],
  },
  {
    category: "content",
    patterns: [
      /\b(pdf|screenshot|render|image|html|document)\b/i,
      /\bcontent\b/i,
    ],
  },
];

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function normalizeHostname(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function pathHasTemplate(pathname: string, raw: string): boolean {
  if (PATH_TEMPLATE_RE.test(pathname) || PATH_TEMPLATE_RE.test(raw)) {
    return true;
  }
  try {
    return PATH_TEMPLATE_RE.test(decodeURIComponent(pathname));
  } catch {
    return false;
  }
}

function queryHasSecret(url: URL): boolean {
  for (const key of url.searchParams.keys()) {
    if (SECRET_QUERY_KEYS.has(key.toLowerCase())) return true;
  }
  return false;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizeMethod(method: string | null | undefined): string | null {
  if (typeof method !== "string") return null;
  const trimmed = method.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

function resourceFamily(url: string | null): string {
  if (!url) return "unknown";
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 0) return "/";
    if (parts.length === 1) return `/${parts[0]}`;
    return `/${parts[0]}/${parts[1]}`;
  } catch {
    return "invalid";
  }
}

function corpusOf(input: RawAdvertisedResourceInput): string {
  const bits = [
    input.url ?? "",
    input.description ?? "",
    input.taskId ?? "",
    input.taskType ?? "",
    ...(input.claimedTaskTypes ?? []),
    input.payment?.description ?? "",
  ];
  return bits.join(" ").toLowerCase();
}

export function classifyResourceCategories(
  input: RawAdvertisedResourceInput,
): ResourceCategory[] {
  const corpus = corpusOf(input);
  if (!corpus.trim()) return ["unknown"];
  const hits = new Set<ResourceCategory>();
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((re) => re.test(corpus))) {
      hits.add(rule.category);
    }
  }
  if (hits.size === 0) return ["other"];
  return [...hits].sort();
}

function claimedTaskTokens(input: RawAdvertisedResourceInput): string[] {
  const out: string[] = [];
  if (input.taskId) out.push(input.taskId.trim().toLowerCase());
  if (input.taskType) out.push(input.taskType.trim().toLowerCase());
  for (const t of input.claimedTaskTypes ?? []) {
    if (typeof t === "string" && t.trim()) out.push(t.trim().toLowerCase());
  }
  return out;
}

/**
 * §7 TaskRelevance for wallet-activity-summary@1.0.
 * Different task id ≠ automatically useless; keyword similarity alone ≠ adaptable.
 */
export function assessResourceTaskRelevance(
  input: RawAdvertisedResourceInput,
): {
  readonly relevance: ResourceTaskRelevance;
  readonly notes: string;
  readonly adapterNeeds: string | null;
} {
  const tokens = claimedTaskTokens(input);
  const corpus = corpusOf(input);
  const description =
    typeof input.description === "string" ? input.description.trim() : "";

  const explicit = tokens.some((t) => EXPLICIT_TASK_TOKENS.has(t));
  if (explicit) {
    const interfaceHint =
      /request|response|schema|block\s*range|fromBlock|toBlock|metrics/i.test(
        description,
      );
    if (interfaceHint) {
      return {
        relevance: "explicitMatch",
        notes: `Explicitly documents ${MVP_TASK_ID} with request/response interface hints`,
        adapterNeeds: null,
      };
    }
    return {
      relevance: "explicitMatch",
      notes: `Explicit task identifier for ${MVP_TASK_ID}; full B1/B2 field compatibility still unproven offline`,
      adapterNeeds:
        "Verify Base Mainnet 8453, 1–100 block range, exact B1 request / B2 response fields, and provenance/coverage semantics before binding",
    };
  }

  const hasConcreteFunction = ADAPTABLE_FUNCTION_HINTS.some((hint) =>
    corpus.includes(hint),
  );
  const hasConcreteInterface =
    description.length > 0 &&
    (/block/i.test(description) ||
      /transaction/i.test(description) ||
      /receipt/i.test(description) ||
      /wallet/i.test(description)) &&
    (/address|range|from|to|hash|receipt|count|value/i.test(description) ||
      /eth_/i.test(description));

  if (hasConcreteFunction && hasConcreteInterface) {
    return {
      relevance: "adaptableCandidate",
      notes:
        "Documents concrete wallet/blockchain functions that might be composed into B1/B2; exact compatibility unverified",
      adapterNeeds:
        "Adapter would need to map caller wallet+blockRange into provider inputs, restrict to Base Mainnet 8453 public txs/receipts, project exact B2 summary fields, and prove coverage/provenance — none of which is verified offline",
    };
  }

  // Keyword similarity without concrete interface → potentiallyRelated or unrelated.
  const relatedKeyword = POTENTIALLY_RELATED_HINTS.some((hint) =>
    corpus.includes(hint),
  );
  if (relatedKeyword) {
    if (!hasConcreteInterface) {
      return {
        relevance: "potentiallyRelated",
        notes:
          "Mentions blockchain/wallet/financial themes, but interface is not sufficiently documented for adaptation (keyword similarity alone is not adaptability)",
        adapterNeeds: null,
      };
    }
    return {
      relevance: "potentiallyRelated",
      notes:
        "Blockchain/wallet-related surface without enough concrete function documentation to treat as adaptable",
      adapterNeeds: null,
    };
  }

  if (!corpus.trim() || (!input.url && !description && tokens.length === 0)) {
    return {
      relevance: "unknown",
      notes: "Insufficient information to assess task relevance",
      adapterNeeds: null,
    };
  }

  return {
    relevance: "unrelated",
    notes: `Advertised purpose does not concern ${MVP_TASK_ID} / wallet-activity analysis`,
    adapterNeeds: null,
  };
}

function assetMatchesClaimNetwork(asset: string, network: string): boolean {
  const approved = approvedUsdcForNetwork(network);
  if (!approved) return false;
  try {
    return isAddressEqual(getAddress(asset), getAddress(approved));
  } catch {
    return false;
  }
}

/**
 * Metadata-only payment claim assessment vs AgentHire dual-network policy.
 * Never equals a live challenge parse/policy pass.
 */
export function assessAdvertisedPaymentClaim(
  claim: AdvertisedPaymentClaim | null | undefined,
): {
  readonly assessment: AdvertisedPaymentAssessment;
  readonly notes: string;
} {
  if (!claim) {
    return {
      assessment: "insufficientInformation",
      notes: "No per-resource payment metadata claimed",
    };
  }

  const present: string[] = [];
  const mismatches: string[] = [];
  const missing: string[] = [];

  if (claim.x402Version != null) {
    present.push("x402Version");
    if (claim.x402Version !== APPROVED_X402_VERSION) {
      mismatches.push(
        `x402Version ${claim.x402Version} ≠ approved ${APPROVED_X402_VERSION}`,
      );
    }
  } else {
    missing.push("x402Version");
  }

  if (claim.scheme != null && String(claim.scheme).trim()) {
    present.push("scheme");
    if (String(claim.scheme).trim() !== APPROVED_X402_SCHEME) {
      mismatches.push(
        `scheme "${claim.scheme}" ≠ approved "${APPROVED_X402_SCHEME}"`,
      );
    }
  } else {
    missing.push("scheme");
  }

  const network =
    claim.network != null && String(claim.network).trim()
      ? String(claim.network).trim()
      : null;
  if (network) {
    present.push("network");
    if (!isApprovedPaymentNetwork(network)) {
      mismatches.push(
        `network "${network}" ∉ approved [${APPROVED_PAYMENT_NETWORKS.join(", ")}]`,
      );
    }
  } else {
    missing.push("network");
  }

  if (claim.asset != null && String(claim.asset).trim()) {
    present.push("asset");
    const asset = String(claim.asset).trim();
    if (!network || !isApprovedPaymentNetwork(network)) {
      mismatches.push(
        `asset ${asset} cannot be validated without an approved payment network`,
      );
    } else if (!assetMatchesClaimNetwork(asset, network)) {
      const expected = APPROVED_USDC_BY_NETWORK[network];
      mismatches.push(
        `asset ${asset} ≠ approved USDC ${expected} for ${network} (cross-network substitution rejected)`,
      );
    }
  } else {
    missing.push("asset");
  }

  if (claim.assetDecimals != null) {
    present.push("assetDecimals");
    if (claim.assetDecimals !== 6) {
      mismatches.push(`assetDecimals ${claim.assetDecimals} ≠ 6`);
    }
  } else {
    missing.push("assetDecimals");
  }

  if (claim.maxAmountRequired != null && String(claim.maxAmountRequired).trim()) {
    present.push("maxAmountRequired");
    if (!/^[0-9]+$/.test(String(claim.maxAmountRequired).trim())) {
      mismatches.push("maxAmountRequired is not an unsigned integer string");
    }
  } else {
    missing.push("maxAmountRequired");
  }

  if (claim.payTo != null && String(claim.payTo).trim()) {
    present.push("payTo");
    if (!isAddress(String(claim.payTo).trim(), { strict: false })) {
      mismatches.push("payTo is not a valid EVM address (unknown recipient)");
    }
  } else {
    missing.push("payTo");
  }

  if (mismatches.length > 0) {
    return {
      assessment: "claimsPolicyMismatch",
      notes: `Payment claim contradicts dual-network policy: ${mismatches.join("; ")} (metadata only — not a live challenge)`,
    };
  }

  const requiredForMatch = [
    "x402Version",
    "scheme",
    "network",
    "asset",
    "assetDecimals",
  ] as const;
  const missingRequired = requiredForMatch.filter((k) => missing.includes(k));
  if (missingRequired.length > 0 || missing.includes("maxAmountRequired") || missing.includes("payTo")) {
    return {
      assessment: "insufficientInformation",
      notes:
        present.length === 0
          ? "No usable payment claim fields"
          : `Payment claim incomplete for dual-network policy match (missing: ${[...missingRequired, ...missing.filter((m) => m === "maxAmountRequired" || m === "payTo")].join(", ") || missing.join(", ")}); metadata only — not a live challenge`,
    };
  }

  return {
    assessment: "claimsPolicyMatch",
    notes: `Advertised payment metadata claims match v2/exact/${network}/${approvedUsdcForNetwork(network!)}/6 — metadata only; not a live challenge and not policyPass`,
  };
}

export function assessResourceUrlSafety(
  url: string | null,
  method: string | null,
): UrlSafetyFlags {
  const notes: string[] = [];
  if (!url) {
    return {
      ok: false,
      scheme: null,
      hasCredentials: false,
      hasPathTemplate: false,
      hasQuery: false,
      hasFragment: false,
      literalIpHost: false,
      literalIpBlocked: false,
      hasSecretQuery: false,
      methodKnown: method != null && KNOWN_METHODS.has(method),
      methodSafeGetCandidate: false,
      notes: ["urlMissing"],
    };
  }
  if (hasControlCharacters(url)) {
    return {
      ok: false,
      scheme: null,
      hasCredentials: false,
      hasPathTemplate: PATH_TEMPLATE_RE.test(url),
      hasQuery: false,
      hasFragment: false,
      literalIpHost: false,
      literalIpBlocked: false,
      hasSecretQuery: false,
      methodKnown: method != null && KNOWN_METHODS.has(method),
      methodSafeGetCandidate: false,
      notes: ["controlCharacters"],
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      scheme: null,
      hasCredentials: false,
      hasPathTemplate: PATH_TEMPLATE_RE.test(url),
      hasQuery: false,
      hasFragment: false,
      literalIpHost: false,
      literalIpBlocked: false,
      hasSecretQuery: false,
      methodKnown: method != null && KNOWN_METHODS.has(method),
      methodSafeGetCandidate: false,
      notes: ["urlInvalid"],
    };
  }

  const scheme = parsed.protocol.replace(/:$/, "");
  const hasCredentials = Boolean(parsed.username || parsed.password);
  const hasFragment = parsed.hash !== "" && parsed.hash !== "#";
  const hasQuery = parsed.search !== "" && parsed.search !== "?";
  const hasPathTemplate = pathHasTemplate(parsed.pathname, url);
  const host = normalizeHostname(parsed.hostname);
  const literalIpHost = isIP(host) !== 0;
  const literalIpBlocked = literalIpHost && isBlockedIpAddress(host);
  const hasSecretQuery = queryHasSecret(parsed);
  const methodKnown = method != null && KNOWN_METHODS.has(method);

  if (scheme !== "https") notes.push("schemeNotHttps");
  if (hasCredentials) notes.push("embeddedCredentials");
  if (literalIpBlocked) notes.push("literalBlockedIp");
  else if (literalIpHost) notes.push("literalPublicIpHost");
  if (hasFragment) notes.push("urlFragmentPresent");
  if (hasPathTemplate) notes.push("pathTemplateUnresolved");
  if (hasQuery) notes.push("queryStringPresent");
  if (hasSecretQuery) notes.push("secretQueryRedacted");
  if (method == null) notes.push("methodUnspecified");
  else if (!methodKnown) notes.push("methodUnknown");
  else if (method !== "GET") notes.push("methodNotGet");

  const hardReject =
    scheme !== "https" ||
    hasCredentials ||
    literalIpBlocked ||
    hasFragment ||
    !host;

  if (!hardReject && !hasPathTemplate) {
    notes.push("structurallyParsable");
  }

  return {
    ok: !hardReject,
    scheme,
    hasCredentials,
    hasPathTemplate,
    hasQuery,
    hasFragment,
    literalIpHost,
    literalIpBlocked,
    hasSecretQuery,
    methodKnown,
    methodSafeGetCandidate: !hardReject && method === "GET" && !hasPathTemplate,
    notes,
  };
}

function deterministicResourceId(
  discoveryId: string,
  index: number,
  input: RawAdvertisedResourceInput,
): string {
  if (typeof input.resourceId === "string" && input.resourceId.trim()) {
    return input.resourceId.trim();
  }
  if (typeof input.id === "string" && input.id.trim()) {
    return input.id.trim();
  }
  const method = normalizeMethod(input.method) ?? "METHOD_UNSPECIFIED";
  const url = input.url?.trim() || "URL_MISSING";
  return `${discoveryId}:${index}:${method}:${url}`;
}

export function normalizeAdvertisedResource(
  input: RawAdvertisedResourceInput,
  context: {
    readonly discoveryId: string;
    readonly provider: string;
    readonly index: number;
    readonly fixtureKind?: "synthetic" | "captured";
  },
): AdvertisedResource {
  const method = normalizeMethod(input.method);
  const url =
    typeof input.url === "string" && input.url.trim() ? input.url.trim() : null;
  const sanitizedUrl = url ? sanitizeEndpointForArtifact(url) : null;
  const categories = classifyResourceCategories(input);
  const task = assessResourceTaskRelevance(input);
  const payment = assessAdvertisedPaymentClaim(input.payment);
  const urlSafety = assessResourceUrlSafety(url, method);
  const fixtureKind =
    input.fixtureKind ?? context.fixtureKind ?? "captured";

  return {
    resourceId: deterministicResourceId(context.discoveryId, context.index, input),
    sourceDiscoveryId: context.discoveryId,
    provider: context.provider,
    url,
    sanitizedUrl,
    method,
    description:
      typeof input.description === "string" ? input.description : null,
    sameHostClaim:
      typeof input.sameHostClaim === "boolean" ? input.sameHostClaim : null,
    inspectionStatus: "notChecked",
    categories,
    taskRelevance: task.relevance,
    taskRelevanceNotes: task.notes,
    adapterNeeds: task.adapterNeeds,
    paymentAssessment: payment.assessment,
    paymentNotes: payment.notes,
    urlSafety,
    family: resourceFamily(url),
    fixtureKind,
    duplicateUrl: false,
    duplicateId: false,
  };
}

function markDuplicates(
  resources: readonly AdvertisedResource[],
): AdvertisedResource[] {
  const urlCounts = new Map<string, number>();
  const idCounts = new Map<string, number>();
  for (const r of resources) {
    if (r.url) urlCounts.set(r.url, (urlCounts.get(r.url) ?? 0) + 1);
    idCounts.set(r.resourceId, (idCounts.get(r.resourceId) ?? 0) + 1);
  }
  return resources.map((r) => ({
    ...r,
    duplicateUrl: r.url != null && (urlCounts.get(r.url) ?? 0) > 1,
    duplicateId: (idCounts.get(r.resourceId) ?? 0) > 1,
  }));
}

function emptyCategoryCounts(): Record<ResourceCategory, number> {
  return {
    walletAnalytics: 0,
    blockchainData: 0,
    defi: 0,
    marketData: 0,
    research: 0,
    aiInference: 0,
    agentDiscovery: 0,
    developerInfrastructure: 0,
    payments: 0,
    content: 0,
    other: 0,
    unknown: 0,
  };
}

function emptyTaskCounts(): Record<ResourceTaskRelevance, number> {
  return {
    explicitMatch: 0,
    adaptableCandidate: 0,
    potentiallyRelated: 0,
    unrelated: 0,
    unknown: 0,
  };
}

function emptyPaymentCounts(): Record<AdvertisedPaymentAssessment, number> {
  return {
    claimsPolicyMatch: 0,
    claimsPolicyMismatch: 0,
    insufficientInformation: 0,
  };
}

/**
 * Transparent scoring for shortlist ranking (higher is better).
 * Prefer wallet/tx/blockchain-data over discovery URLs.
 */
export function scoreResourceCandidate(resource: AdvertisedResource): {
  readonly score: number;
  readonly priority: CandidatePriority;
  readonly rationale: string;
} {
  let score = 0;
  const reasons: string[] = [];

  if (resource.taskRelevance === "explicitMatch") {
    score += 100;
    reasons.push("explicitMatch(+100)");
  } else if (resource.taskRelevance === "adaptableCandidate") {
    score += 70;
    reasons.push("adaptableCandidate(+70)");
  } else if (resource.taskRelevance === "potentiallyRelated") {
    score += 25;
    reasons.push("potentiallyRelated(+25)");
  } else if (resource.taskRelevance === "unknown") {
    score += 5;
    reasons.push("unknown(+5)");
  } else {
    reasons.push("unrelated(+0)");
  }

  if (resource.categories.includes("walletAnalytics")) {
    score += 20;
    reasons.push("walletAnalytics(+20)");
  }
  if (resource.categories.includes("blockchainData")) {
    score += 18;
    reasons.push("blockchainData(+18)");
  }
  if (resource.categories.includes("agentDiscovery")) {
    score -= 15;
    reasons.push("agentDiscovery(-15)");
  }
  if (resource.categories.includes("developerInfrastructure")) {
    score -= 5;
    reasons.push("developerInfrastructure(-5)");
  }

  if (resource.urlSafety.ok) {
    score += 10;
    reasons.push("urlOk(+10)");
  } else {
    score -= 40;
    reasons.push("urlUnsafe(-40)");
  }
  if (resource.urlSafety.hasPathTemplate) {
    score -= 20;
    reasons.push("pathTemplate(-20)");
  }
  if (resource.urlSafety.hasSecretQuery || resource.urlSafety.hasCredentials) {
    score -= 30;
    reasons.push("secrets(-30)");
  }
  if (resource.urlSafety.methodSafeGetCandidate) {
    score += 8;
    reasons.push("methodGET(+8)");
  } else if (resource.method == null) {
    score -= 5;
    reasons.push("methodUnspecified(-5)");
  } else if (!resource.urlSafety.methodKnown) {
    score -= 15;
    reasons.push("methodUnknown(-15)");
  }

  if (resource.paymentAssessment === "claimsPolicyMatch") {
    score += 5;
    reasons.push("paymentClaimsMatch(+5)");
  } else if (resource.paymentAssessment === "claimsPolicyMismatch") {
    score -= 5;
    reasons.push("paymentClaimsMismatch(-5)");
  }

  if (resource.duplicateUrl || resource.duplicateId) {
    score -= 10;
    reasons.push("duplicate(-10)");
  }

  let priority: CandidatePriority;
  if (
    score >= 80 &&
    (resource.taskRelevance === "explicitMatch" ||
      resource.taskRelevance === "adaptableCandidate") &&
    resource.urlSafety.ok
  ) {
    priority = "high";
  } else if (
    score >= 40 &&
    (resource.taskRelevance === "adaptableCandidate" ||
      resource.taskRelevance === "potentiallyRelated" ||
      resource.taskRelevance === "explicitMatch")
  ) {
    priority = "medium";
  } else {
    priority = "low";
  }

  return {
    score,
    priority,
    rationale: reasons.join(", "),
  };
}

function isShortlistEligible(resource: AdvertisedResource): boolean {
  if (!resource.urlSafety.ok) return false;
  if (resource.urlSafety.hasPathTemplate) return false;
  if (resource.urlSafety.hasCredentials || resource.urlSafety.hasSecretQuery) {
    return false;
  }
  if (resource.taskRelevance === "unrelated") return false;
  if (resource.taskRelevance === "unknown") return false;
  // Prefer wallet/tx/blockchain — discovery-only / pure infra stay out.
  if (
    resource.taskRelevance === "potentiallyRelated" &&
    !resource.categories.includes("walletAnalytics") &&
    !resource.categories.includes("blockchainData") &&
    !resource.categories.includes("defi")
  ) {
    return false;
  }
  return (
    resource.taskRelevance === "explicitMatch" ||
    resource.taskRelevance === "adaptableCandidate" ||
    resource.taskRelevance === "potentiallyRelated"
  );
}

export function buildInspectionShortlist(
  resources: readonly AdvertisedResource[],
  maxCandidates = 3,
): ResourceInspectionCandidate[] {
  const scored = resources
    .filter(isShortlistEligible)
    .map((resource) => {
      const { score, priority, rationale } = scoreResourceCandidate(resource);
      const candidate: ResourceInspectionCandidate = {
        resourceId: resource.resourceId,
        provider: resource.provider,
        sourceDiscoveryId: resource.sourceDiscoveryId,
        sanitizedUrl: resource.sanitizedUrl,
        method: resource.method,
        categories: resource.categories,
        taskRelevance: resource.taskRelevance,
        priority,
        score,
        rationale,
        adapterNeeds: resource.adapterNeeds,
        paymentAssessment: resource.paymentAssessment,
        approvedForNetworkExecution: false,
        b4Upgrades: {
          endpointReachable: false,
          challengeVerified: false,
          paymentCompatible: false,
          paidVerified: false,
        },
      };
      return candidate;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const urlA = a.sanitizedUrl ?? "";
      const urlB = b.sanitizedUrl ?? "";
      if (urlA !== urlB) return urlA < urlB ? -1 : 1;
      const methodA = a.method ?? "";
      const methodB = b.method ?? "";
      if (methodA !== methodB) return methodA < methodB ? -1 : 1;
      return a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0;
    });

  return scored.slice(0, maxCandidates);
}

export function determineCatalogCoverage(
  sources: readonly CatalogSourceEvidence[],
): CatalogCoverage {
  if (sources.length === 0) return "unavailable";
  const reported = sources.reduce((n, s) => n + s.reportedResourceCount, 0);
  const recoverable = sources.reduce(
    (n, s) => n + s.recoverableResourceCount,
    0,
  );
  if (reported === 0 && recoverable === 0) {
    // Empty catalogs (e.g. QuantJourney alone) are complete observations of zero.
    const anyTruncated = sources.some((s) => s.truncated);
    const anyMissingBody = sources.some(
      (s) => s.reportedResourceCount > 0 && !s.fullBodyRecoverable,
    );
    if (anyTruncated || anyMissingBody) return "partial";
    return "complete";
  }
  if (recoverable === 0 && reported > 0) return "unavailable";
  const allComplete = sources.every(
    (s) =>
      !s.truncated &&
      s.fullBodyRecoverable &&
      s.recoverableResourceCount === s.reportedResourceCount,
  );
  if (allComplete && recoverable === reported) return "complete";
  const anyTruncatedSample =
    sources.some((s) => s.truncated) && recoverable > 0 && recoverable < reported;
  if (anyTruncatedSample) return "sampleOnly";
  if (recoverable > 0 && recoverable < reported) return "partial";
  if (recoverable === reported && recoverable > 0) return "complete";
  return "partial";
}

export function analyzeResourceCatalog(
  sources: readonly CatalogSourceEvidence[],
): ResourceCatalogAnalysisDocument {
  const normalized: AdvertisedResource[] = [];
  for (const source of sources) {
    source.resources.forEach((raw, index) => {
      normalized.push(
        normalizeAdvertisedResource(raw, {
          discoveryId: source.discoveryId,
          provider: source.provider,
          index,
          fixtureKind: raw.fixtureKind ?? "captured",
        }),
      );
    });
  }
  const resources = markDuplicates(normalized);
  const shortlist = buildInspectionShortlist(resources, 3);

  const reportedResourceCount = sources.reduce(
    (n, s) => n + s.reportedResourceCount,
    0,
  );
  const recoverableResourceCount = sources.reduce(
    (n, s) => n + s.recoverableResourceCount,
    0,
  );
  const uniqueUrls = new Set(
    resources.map((r) => r.url).filter((u): u is string => u != null),
  );
  const uniqueMethodUrl = new Set(
    resources
      .filter((r) => r.url != null)
      .map((r) => `${r.method ?? "METHOD_UNSPECIFIED"} ${r.url}`),
  );
  const uniqueIds = new Set(resources.map((r) => r.resourceId));
  const familyCounts: Record<string, number> = {};
  for (const r of resources) {
    familyCounts[r.family] = (familyCounts[r.family] ?? 0) + 1;
  }
  const sortedFamilies = Object.fromEntries(
    Object.entries(familyCounts).sort(([a], [b]) => (a < b ? -1 : 1)),
  );

  const categoryCounts = emptyCategoryCounts();
  const taskRelevanceCounts = emptyTaskCounts();
  const paymentAssessmentCounts = emptyPaymentCounts();
  for (const r of resources) {
    for (const c of r.categories) categoryCounts[c] += 1;
    taskRelevanceCounts[r.taskRelevance] += 1;
    paymentAssessmentCounts[r.paymentAssessment] += 1;
  }

  const coverage = determineCatalogCoverage(sources);
  const honestyNotes: string[] = [
    "SHA-256 of a discovery response body does not make that body recoverable",
    "Advertised resources were not fetched; inspectionStatus is always notChecked",
    "Payment assessments are metadata claims only — never a live challenge",
    "No B4 catalog upgrades from this offline analysis",
  ];
  if (coverage === "sampleOnly") {
    honestyNotes.push(
      `Only a sanitized sample is recoverable (${recoverableResourceCount} of ${reportedResourceCount} reported); missing entries were not invented`,
    );
  }

  const sampleLimits = sources
    .filter((s) => s.truncated)
    .map((s) => s.recoverableResourceCount);
  const sampleLimitObserved =
    sampleLimits.length > 0 ? Math.max(...sampleLimits) : null;

  return {
    schemaVersion: "1.0",
    mode: RESOURCE_ANALYSIS_MODE,
    kind: "resourceCatalogAnalysis",
    analysisVersion: RESOURCE_ANALYSIS_VERSION,
    mvpTaskId: MVP_TASK_ID,
    coverage: {
      coverage,
      reportedResourceCount,
      recoverableResourceCount,
      rawEntryCount: resources.length,
      uniqueUrlCount: uniqueUrls.size,
      uniqueMethodUrlCount: uniqueMethodUrl.size,
      uniqueIdCount: uniqueIds.size,
      familyCounts: sortedFamilies,
      categoryCounts,
      taskRelevanceCounts,
      paymentAssessmentCounts,
      sampleLimitObserved,
      orderingPreserved: true,
      sources: sources.map((s) => ({
        discoveryId: s.discoveryId,
        provider: s.provider,
        sourcePath: s.sourcePath,
        contentSha256: s.contentSha256,
        byteLength: s.byteLength,
        reportedResourceCount: s.reportedResourceCount,
        recoverableResourceCount: s.recoverableResourceCount,
        truncated: s.truncated,
        fullBodyRecoverable: s.fullBodyRecoverable,
        notes: s.fullBodyRecoverable
          ? "Full advertised resource list recoverable from local artifacts"
          : s.truncated
            ? `Sample truncated locally; contentSha256=${s.contentSha256 ?? "null"} does not recover omitted entries`
            : s.reportedResourceCount === 0
              ? "Empty advertised resource list observed"
              : "Body not stored locally beyond summary",
      })),
      honestyNotes,
    },
    resources,
    shortlist,
    b4Upgrades: {
      endpointReachable: false,
      challengeVerified: false,
      paymentCompatible: false,
      paidVerified: false,
    },
  };
}

export function buildShortlistDocument(
  analysis: ResourceCatalogAnalysisDocument,
): ResourceInspectionShortlistDocument {
  return {
    schemaVersion: "1.0",
    mode: RESOURCE_ANALYSIS_MODE,
    kind: "resourceInspectionShortlist",
    analysisVersion: RESOURCE_ANALYSIS_VERSION,
    mvpTaskId: MVP_TASK_ID,
    coverage: analysis.coverage.coverage,
    candidateCount: analysis.shortlist.length,
    maxCandidates: 3,
    approvedForNetworkExecutionTrue: 0,
    candidates: analysis.shortlist,
    notes: [
      "All candidates have approvedForNetworkExecution: false",
      "Empty shortlist is valid when recoverable evidence is insufficient",
      "Prefer wallet/tx/blockchain-data over discovery URLs when scoring",
      "No network execution authorized by this document",
    ],
  };
}

/** Evidence file shape (subset) from D4.3c x402-discovery-inspection.json. */
type DiscoveryEvidenceFile = {
  readonly evidences?: readonly {
    readonly discoveryId?: string;
    readonly provider?: string;
    readonly approvedUrl?: string;
    readonly contentSha256?: string | null;
    readonly byteLength?: number | null;
    readonly documentSummary?: {
      readonly recognitionKind?: string | null;
      readonly x402Version?: number | null;
      readonly advertisedResourceCount?: number;
      readonly advertisedResourcesTruncated?: boolean;
      readonly advertisedResources?: readonly RawAdvertisedResourceInput[];
    } | null;
  }[];
};

/**
 * Load catalog sources from local D4.3c discovery evidence.
 * Does not fetch; does not invent omitted resources beyond the stored sample.
 */
export function loadCatalogSourcesFromDiscoveryEvidence(
  fileJson: string,
  sourcePath: string,
): CatalogSourceEvidence[] {
  const parsed = JSON.parse(fileJson) as DiscoveryEvidenceFile;
  const evidences = parsed.evidences ?? [];
  return evidences.map((ev) => {
    const summary = ev.documentSummary ?? null;
    const resources = summary?.advertisedResources ?? [];
    const reported = summary?.advertisedResourceCount ?? resources.length;
    const truncated = summary?.advertisedResourcesTruncated === true;
    const recoverable = resources.length;
    // SHA present without body ≠ full recovery.
    const fullBodyRecoverable =
      !truncated && recoverable === reported && reported >= 0;
    return {
      discoveryId: ev.discoveryId ?? "UNKNOWN",
      provider: ev.provider ?? "unknown",
      approvedUrl: ev.approvedUrl ?? "",
      contentSha256: ev.contentSha256 ?? null,
      byteLength: ev.byteLength ?? null,
      reportedResourceCount: reported,
      recoverableResourceCount: recoverable,
      truncated,
      recognitionKind: summary?.recognitionKind ?? null,
      x402Version: summary?.x402Version ?? null,
      fullBodyRecoverable:
        fullBodyRecoverable &&
        // When truncated, body is definitionally not fully recoverable.
        !truncated,
      sourcePath,
      resources: resources.map((r) => ({
        ...r,
        fixtureKind: "captured" as const,
      })),
    };
  });
}

export function renderResourceCatalogMarkdown(
  analysis: ResourceCatalogAnalysisDocument,
): string {
  const c = analysis.coverage;
  const lines: string[] = [
    "# AgentHire D4.4 — Offline External Resource-Catalog Analysis",
    "",
    `Mode: **${analysis.mode}**`,
    `MVP task: \`${analysis.mvpTaskId}\``,
    `Coverage: **${c.coverage}** · reported ${c.reportedResourceCount} · recoverable ${c.recoverableResourceCount}`,
    "",
    "## A. Summary",
    "",
    c.coverage === "sampleOnly"
      ? `Only a sanitized **${c.recoverableResourceCount}-entry sample** is recoverable locally of **${c.reportedResourceCount}** reported Agent402/QuantJourney advertised resources. Missing entries were **not** invented. SHA-256 of the discovery body does not recover omitted resources.`
      : `Catalog coverage is **${c.coverage}** (reported ${c.reportedResourceCount}, recoverable ${c.recoverableResourceCount}).`,
    "",
    `Shortlist size: **${analysis.shortlist.length}** (max 3). All candidates \`approvedForNetworkExecution: false\`. No B4 upgrades.`,
    "",
    "## B. Coverage",
    "",
    "| Source | Provider | Reported | Recoverable | Truncated | Full body | contentSha256 |",
    "| --- | --- | ---: | ---: | --- | --- | --- |",
  ];
  for (const s of c.sources) {
    lines.push(
      `| ${s.discoveryId} | ${s.provider} | ${s.reportedResourceCount} | ${s.recoverableResourceCount} | ${s.truncated} | ${s.fullBodyRecoverable} | \`${(s.contentSha256 ?? "null").slice(0, 12)}…\` |`,
    );
  }
  lines.push(
    "",
    `| Metric | Value |`,
    `| --- | ---: |`,
    `| uniqueUrlCount | ${c.uniqueUrlCount} |`,
    `| uniqueMethodUrlCount | ${c.uniqueMethodUrlCount} |`,
    `| uniqueIdCount | ${c.uniqueIdCount} |`,
    `| sampleLimitObserved | ${c.sampleLimitObserved ?? "n/a"} |`,
    `| orderingPreserved | ${c.orderingPreserved} |`,
    "",
    "Honesty notes:",
    "",
  );
  for (const n of c.honestyNotes) lines.push(`- ${n}`);

  lines.push("", "## C. Classification (recoverable only)", "");
  if (c.coverage === "sampleOnly") {
    lines.push(
      "_Category and relevance counts below are **sample-labeled** — they do not describe the unrecovered remainder._",
      "",
    );
  }
  lines.push("| Category | Count |", "| --- | ---: |");
  for (const [k, v] of Object.entries(c.categoryCounts)) {
    if (v > 0) lines.push(`| ${k} | ${v} |`);
  }
  lines.push(
    "",
    "| TaskRelevance | Count |",
    "| --- | ---: |",
  );
  for (const [k, v] of Object.entries(c.taskRelevanceCounts)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push(
    "",
    "| Payment assessment | Count |",
    "| --- | ---: |",
  );
  for (const [k, v] of Object.entries(c.paymentAssessmentCounts)) {
    lines.push(`| ${k} | ${v} |`);
  }

  lines.push(
    "",
    "## D. Families",
    "",
    "| Family | Count |",
    "| --- | ---: |",
  );
  for (const [k, v] of Object.entries(c.familyCounts)) {
    lines.push(`| \`${k}\` | ${v} |`);
  }

  lines.push(
    "",
    "## E. Shortlist",
    "",
  );
  if (analysis.shortlist.length === 0) {
    lines.push(
      "Empty shortlist — recoverable sample lacks sufficiently evidenced wallet/tx/blockchain-data candidates for unsigned inspection review. Empty is valid.",
      "",
    );
  } else {
    lines.push(
      "| ID | Provider | Priority | Score | Relevance | Method | URL |",
      "| --- | --- | --- | ---: | --- | --- | --- |",
    );
    for (const cand of analysis.shortlist) {
      lines.push(
        `| \`${cand.resourceId}\` | ${cand.provider} | ${cand.priority} | ${cand.score} | ${cand.taskRelevance} | ${cand.method ?? "null"} | \`${cand.sanitizedUrl ?? "null"}\` |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## F. Payment claims",
    "",
    "All payment assessments are **metadata-only** versus dual-network policy (`v2` / `exact` / `eip155:8453|84532` / matching per-network USDC / 6). They are **not** live challenges and do not set `paymentCompatible`.",
    "",
    "## G. Security / offline posture",
    "",
    "1. No DNS, HTTP, RPC, facilitator, or browser access in this step.",
    "2. Secrets in URLs redacted via `sanitizeEndpointForArtifact`.",
    "3. Methods never defaulted to GET.",
    "4. `inspectionStatus: notChecked` on every resource.",
    "5. `approvedForNetworkExecution: false` on every shortlist candidate.",
    "6. No B4 upgrades.",
    "",
    "## H. Artifacts",
    "",
    "- `docs/day4/evidence/resource-catalog-analysis.json`",
    "- `docs/day4/evidence/resource-inspection-shortlist.json`",
    "- `docs/day4/resource-catalog-analysis.md`",
    "",
    "## I. Limitations",
    "",
    `- Coverage **${c.coverage}**: unrecovered advertised entries cannot be classified.`,
    "- Sample URL paths (utilities/memory/content) do not establish MVP task support.",
    "- Document-level payment/facilitator claim keys without per-resource fields → `insufficientInformation`.",
    "",
    "## J. Next authorization (not executed)",
    "",
    "- Re-authorize storing a full offline resource dump (or raise sample cap) if catalog completeness is required.",
    "- Any follow-up GET of an advertised resource URL requires a new exact allowlist approval.",
    "- Signing / payment / facilitators remain forbidden.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

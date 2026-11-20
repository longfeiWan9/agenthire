/**
 * Offline endpoint inspection planning (D4.1 / D4.2).
 *
 * Pure static policy over ProviderRecord@1.0 services.
 * Zero DNS / HTTP / signing. eligibleForReview ≠ network approved.
 */

import { isIP } from "node:net";
import { isBlockedIpAddress } from "../erc8004/secure-https.ts";
import type { ProviderRecord, ProviderService } from "./types.ts";

export const INSPECTION_POLICY_VERSION = "1.0" as const;
export const MVP_TASK_ID = "wallet-activity-summary@1.0" as const;
export const MVP_TASK_TYPE = "wallet-activity-summary" as const;
export const MVP_TASK_VERSION = "1.0" as const;

export type TaskRelevance =
  | "explicitMatch"
  | "potentiallyRelated"
  | "unrelated"
  | "unknown";

export type InspectionPlanningStatus =
  | "eligibleForReview"
  | "needsMoreInformation"
  | "rejected";

export type InspectionReasonCode =
  | "urlInvalid"
  | "schemeNotHttps"
  | "embeddedCredentials"
  | "literalBlockedIp"
  | "literalPublicIpHost"
  | "urlFragmentPresent"
  | "controlCharacters"
  | "pathTemplateUnresolved"
  | "queryStringPresent"
  | "methodExplicitGet"
  | "methodExplicitPost"
  | "methodOtherNotGet"
  | "methodPostNotAutoSafe"
  | "discoveryDocumentCandidate"
  | "nonDiscoverySurface"
  | "taskExplicitMatch"
  | "taskPotentiallyRelated"
  | "taskUnrelated"
  | "taskUnknown"
  | "noClaimedTaskTypes"
  | "noDocumentedRequestSchema"
  | "requestSchemaNotChecked"
  | "x402ProviderScopeOnly"
  | "staticUrlStructurallySafe"
  | "runtimeChecksStillRequired"
  | "approvedForNetworkExecutionFalse";

export type StaticUrlAssessment = {
  readonly ok: boolean;
  readonly parsed: URL | null;
  readonly scheme: string | null;
  readonly host: string | null;
  readonly pathname: string | null;
  readonly hasCredentials: boolean;
  readonly hasFragment: boolean;
  readonly hasQuery: boolean;
  readonly hasControlCharacters: boolean;
  readonly hasPathTemplate: boolean;
  readonly literalIpBlocked: boolean;
  readonly literalIpHost: boolean;
  readonly sanitizedEndpointUrl: string;
  readonly reasonCodes: readonly InspectionReasonCode[];
};

export type InspectionAssessment = {
  readonly providerId: string;
  readonly agentId: string;
  readonly registryChainId: 8453 | 84532;
  readonly serviceId: string;
  readonly endpointUrl: string;
  readonly sanitizedEndpointUrl: string;
  readonly catalogMethod: ProviderService["method"];
  readonly proposedProbeMethod: "GET" | "POST" | null;
  readonly exactRouteScope: string | null;
  readonly taskRelevance: TaskRelevance;
  readonly planningStatus: InspectionPlanningStatus;
  readonly reasonCodes: readonly InspectionReasonCode[];
  readonly x402AdvertisedScope: "provider" | "none" | "unknown";
  readonly advertisedNetworks: readonly string[];
  readonly endpointStatus: ProviderService["endpointStatus"];
  readonly requestSchemaStatus: ProviderService["requestSchemaStatus"];
  readonly claimedTaskTypes: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly approvedForNetworkExecution: false;
  readonly notes: string;
};

export type InspectionManifestEntry = InspectionAssessment & {
  readonly shortlistedForHumanReview: boolean;
};

export type InspectionManifestDocument = {
  readonly schemaVersion: "1.0";
  readonly mode: "READ_ONLY / NO_SIGNING / NO_NETWORK_INSPECTION";
  readonly kind: "inspectionManifestProposal";
  readonly policyVersion: typeof INSPECTION_POLICY_VERSION;
  readonly catalogSource: {
    readonly path: string;
    readonly snapshotAsOf: string;
    readonly sha256: string;
  };
  readonly summary: {
    readonly providerCount: number;
    readonly serviceCount: number;
    readonly eligibleForReview: number;
    readonly needsMoreInformation: number;
    readonly rejected: number;
    readonly shortlistedForHumanReview: number;
    readonly approvedForNetworkExecutionTrue: 0;
  };
  readonly entries: readonly InspectionManifestEntry[];
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

const RELATED_TASK_HINTS = [
  "wallet-activity",
  "wallet_activity",
  "walletactivity",
  "wallet-summary",
  "wallet_summary",
  "wallet-analytics",
  "wallet_analytics",
  "activity-summary",
] as const;

/** Static discovery documents that may be proposed for unsigned GET review. */
const DISCOVERY_PATHS = new Set([
  "/.well-known/agent-card.json",
  "/.well-known/x402",
  "/openapi.json",
]);

const PATH_TEMPLATE_RE = /\{[^/{}]+\}|%7B[^/%]+%7D/i;

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** URL.hostname may keep IPv6 brackets; strip for net.isIP / SSRF checks. */
export function normalizeHostname(hostname: string): string {
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

/**
 * Redact credential userinfo and sensitive query keys from artifact URLs.
 * Never write secrets into evidence / manifests.
 */
export function sanitizeEndpointForArtifact(raw: string): string {
  if (hasControlCharacters(raw)) {
    return "[redacted-control-characters]";
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "[invalid-url]";
  }
  parsed.username = "";
  parsed.password = "";
  if (parsed.searchParams.size > 0) {
    const keys = [...parsed.searchParams.keys()];
    for (const key of keys) {
      if (SECRET_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, "[redacted]");
      }
    }
  }
  return parsed.toString();
}

export function assessStaticUrl(raw: string): StaticUrlAssessment {
  const reasonCodes: InspectionReasonCode[] = [];
  const control = hasControlCharacters(raw);
  if (control) reasonCodes.push("controlCharacters");

  let parsed: URL | null = null;
  try {
    parsed = new URL(raw);
  } catch {
    reasonCodes.push("urlInvalid");
    return {
      ok: false,
      parsed: null,
      scheme: null,
      host: null,
      pathname: null,
      hasCredentials: false,
      hasFragment: false,
      hasQuery: false,
      hasControlCharacters: control,
      hasPathTemplate: PATH_TEMPLATE_RE.test(raw),
      literalIpBlocked: false,
      literalIpHost: false,
      sanitizedEndpointUrl: sanitizeEndpointForArtifact(raw),
      reasonCodes,
    };
  }

  const scheme = parsed.protocol.replace(/:$/, "");
  const hasCredentials = Boolean(parsed.username || parsed.password);
  const hasFragment = parsed.hash !== "" && parsed.hash !== "#";
  const hasQuery = parsed.search !== "" && parsed.search !== "?";
  const hasPathTemplate = pathHasTemplate(parsed.pathname, raw);
  const host = normalizeHostname(parsed.hostname);
  const literalIpHost = isIP(host) !== 0;
  const literalIpBlocked = literalIpHost && isBlockedIpAddress(host);

  if (parsed.protocol !== "https:") reasonCodes.push("schemeNotHttps");
  if (hasCredentials) reasonCodes.push("embeddedCredentials");
  if (literalIpBlocked) reasonCodes.push("literalBlockedIp");
  else if (literalIpHost) reasonCodes.push("literalPublicIpHost");
  if (hasFragment) reasonCodes.push("urlFragmentPresent");
  if (hasPathTemplate) reasonCodes.push("pathTemplateUnresolved");
  if (hasQuery) reasonCodes.push("queryStringPresent");

  const hardReject =
    control ||
    parsed.protocol !== "https:" ||
    hasCredentials ||
    literalIpBlocked ||
    hasFragment ||
    !host;

  if (!hardReject && !hasPathTemplate && !hasQuery) {
    reasonCodes.push("staticUrlStructurallySafe");
  }

  return {
    ok: !hardReject,
    parsed,
    scheme,
    host,
    pathname: parsed.pathname,
    hasCredentials,
    hasFragment,
    hasQuery,
    hasControlCharacters: control,
    hasPathTemplate,
    literalIpBlocked,
    literalIpHost,
    sanitizedEndpointUrl: sanitizeEndpointForArtifact(raw),
    reasonCodes,
  };
}

function normalizeTaskToken(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Inventory-only task relevance for wallet-activity-summary@1.0.
 * explicitMatch requires exact task id / interface — not keyword similarity.
 */
export function assessTaskRelevance(
  claimedTaskTypes: readonly string[],
): { readonly relevance: TaskRelevance; readonly reasonCodes: readonly InspectionReasonCode[] } {
  const reasonCodes: InspectionReasonCode[] = [];
  if (claimedTaskTypes.length === 0) {
    reasonCodes.push("noClaimedTaskTypes", "taskUnknown");
    return { relevance: "unknown", reasonCodes };
  }

  const normalized = claimedTaskTypes.map(normalizeTaskToken);
  const exact =
    normalized.includes(MVP_TASK_ID) ||
    normalized.includes(`${MVP_TASK_TYPE}@${MVP_TASK_VERSION}`) ||
    normalized.includes(MVP_TASK_TYPE);

  if (exact) {
    reasonCodes.push("taskExplicitMatch");
    return { relevance: "explicitMatch", reasonCodes };
  }

  const potentially = normalized.some((token) =>
    RELATED_TASK_HINTS.some((hint) => token.includes(hint)),
  );
  if (potentially) {
    reasonCodes.push("taskPotentiallyRelated");
    return { relevance: "potentiallyRelated", reasonCodes };
  }

  reasonCodes.push("taskUnrelated");
  return { relevance: "unrelated", reasonCodes };
}

export function isDiscoveryDocumentPath(pathname: string): boolean {
  if (!pathname) return false;
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return DISCOVERY_PATHS.has(normalized);
}

function x402Scope(
  provider: ProviderRecord,
): InspectionAssessment["x402AdvertisedScope"] {
  if (provider.payment.x402Advertised === true) return "provider";
  if (provider.payment.x402Advertised === false) return "none";
  return "unknown";
}

function uniqueReasons(
  codes: readonly InspectionReasonCode[],
): InspectionReasonCode[] {
  const seen = new Set<InspectionReasonCode>();
  const out: InspectionReasonCode[] = [];
  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * Deterministic offline assessment for one catalog service.
 * Does not perform DNS, TLS, redirects, or HTTP.
 */
export function assessServiceForInspection(
  provider: ProviderRecord,
  service: ProviderService,
): InspectionAssessment {
  const url = assessStaticUrl(service.endpointUrl);
  const task = assessTaskRelevance(service.claimedTaskTypes);
  const reasons: InspectionReasonCode[] = [
    ...url.reasonCodes,
    ...task.reasonCodes,
  ];

  reasons.push("requestSchemaNotChecked", "noDocumentedRequestSchema");
  reasons.push("runtimeChecksStillRequired", "approvedForNetworkExecutionFalse");

  const scope = x402Scope(provider);
  if (scope === "provider") reasons.push("x402ProviderScopeOnly");

  let proposedProbeMethod: "GET" | "POST" | null = null;
  let planningStatus: InspectionPlanningStatus;
  let exactRouteScope: string | null = null;
  let notes: string;

  if (!url.ok || url.parsed == null) {
    planningStatus = "rejected";
    notes =
      "Rejected by static URL safety policy. No network inspection is authorized.";
  } else if (service.method === "POST") {
    reasons.push("methodExplicitPost", "methodPostNotAutoSafe");
    planningStatus = "needsMoreInformation";
    notes =
      "Explicit POST is not auto-safe for unsigned inspection without a documented request schema and human review of body semantics.";
  } else if (service.method === "GET") {
    reasons.push("methodExplicitGet");
    if (url.hasPathTemplate || url.hasQuery) {
      planningStatus = "needsMoreInformation";
      notes =
        "Explicit GET with unresolved path template or query requires more information before review.";
    } else if (task.relevance === "unrelated" && !isDiscoveryDocumentPath(url.pathname ?? "")) {
      planningStatus = "needsMoreInformation";
      reasons.push("nonDiscoverySurface");
      notes =
        "Explicit GET is structurally safer, but task relevance is unrelated and the route is not a recognized discovery document.";
    } else {
      planningStatus = "eligibleForReview";
      proposedProbeMethod = "GET";
      exactRouteScope = `${url.parsed.origin}${url.parsed.pathname}`;
      if (isDiscoveryDocumentPath(url.pathname ?? "")) {
        reasons.push("discoveryDocumentCandidate");
      }
      notes =
        "Structurally eligible for human-reviewed unsigned GET inspection only. approvedForNetworkExecution remains false until D4.3 authorization.";
    }
  } else {
    // catalog method OTHER — must not be treated as GET
    reasons.push("methodOtherNotGet");
    const discovery = isDiscoveryDocumentPath(url.pathname ?? "");
    if (discovery && !url.hasPathTemplate && !url.hasQuery) {
      reasons.push("discoveryDocumentCandidate");
      planningStatus = "eligibleForReview";
      proposedProbeMethod = "GET";
      exactRouteScope = `${url.parsed.origin}${url.parsed.pathname}`;
      notes =
        "Catalog method is OTHER (not an advertised GET). Route matches a known static discovery document pattern and may be proposed for human-reviewed unsigned GET only. Still not network-approved.";
    } else {
      reasons.push("nonDiscoverySurface");
      planningStatus = "needsMoreInformation";
      notes = url.hasPathTemplate
        ? "Path template must be resolved before any inspection proposal. Catalog method OTHER is not GET."
        : "Catalog method OTHER is not treated as GET. Non-discovery (or ambiguous) surfaces need method/schema clarification before review.";
    }
  }

  return {
    providerId: provider.providerId,
    agentId: provider.identity.agentId,
    registryChainId: provider.identity.registryChainId,
    serviceId: service.serviceId,
    endpointUrl: service.endpointUrl,
    sanitizedEndpointUrl: url.sanitizedEndpointUrl,
    catalogMethod: service.method,
    proposedProbeMethod,
    exactRouteScope,
    taskRelevance: task.relevance,
    planningStatus,
    reasonCodes: uniqueReasons(reasons),
    x402AdvertisedScope: scope,
    advertisedNetworks: [...provider.payment.advertisedNetworks],
    endpointStatus: service.endpointStatus,
    requestSchemaStatus: service.requestSchemaStatus,
    claimedTaskTypes: [...service.claimedTaskTypes],
    evidenceIds: [...provider.operational.evidenceIds],
    approvedForNetworkExecution: false,
    notes,
  };
}

export function assessProviderServices(
  provider: ProviderRecord,
): InspectionAssessment[] {
  const assessments = provider.services.map((service) =>
    assessServiceForInspection(provider, service),
  );
  assessments.sort((a, b) => {
    const byProvider = a.providerId.localeCompare(b.providerId);
    if (byProvider !== 0) return byProvider;
    return a.serviceId.localeCompare(b.serviceId);
  });
  return assessments;
}

export function assessCatalog(
  providers: readonly ProviderRecord[],
): InspectionAssessment[] {
  const sortedProviders = [...providers].sort((a, b) =>
    a.providerId.localeCompare(b.providerId),
  );
  const out: InspectionAssessment[] = [];
  for (const provider of sortedProviders) {
    out.push(...assessProviderServices(provider));
  }
  return out;
}

export function buildInspectionManifest(input: {
  readonly providers: readonly ProviderRecord[];
  readonly catalogPath: string;
  readonly catalogSnapshotAsOf: string;
  readonly catalogSha256: string;
}): InspectionManifestDocument {
  const assessments = assessCatalog(input.providers);
  const entries: InspectionManifestEntry[] = assessments.map((a) => ({
    ...a,
    shortlistedForHumanReview: a.planningStatus === "eligibleForReview",
    approvedForNetworkExecution: false,
  }));

  let eligibleForReview = 0;
  let needsMoreInformation = 0;
  let rejected = 0;
  for (const entry of entries) {
    if (entry.planningStatus === "eligibleForReview") eligibleForReview += 1;
    else if (entry.planningStatus === "needsMoreInformation")
      needsMoreInformation += 1;
    else rejected += 1;
    if (entry.approvedForNetworkExecution !== false) {
      throw new Error("Inspection manifest must never approve network execution");
    }
  }

  return {
    schemaVersion: "1.0",
    mode: "READ_ONLY / NO_SIGNING / NO_NETWORK_INSPECTION",
    kind: "inspectionManifestProposal",
    policyVersion: INSPECTION_POLICY_VERSION,
    catalogSource: {
      path: input.catalogPath,
      snapshotAsOf: input.catalogSnapshotAsOf,
      sha256: input.catalogSha256,
    },
    summary: {
      providerCount: input.providers.length,
      serviceCount: entries.length,
      eligibleForReview,
      needsMoreInformation,
      rejected,
      shortlistedForHumanReview: eligibleForReview,
      approvedForNetworkExecutionTrue: 0,
    },
    entries,
  };
}

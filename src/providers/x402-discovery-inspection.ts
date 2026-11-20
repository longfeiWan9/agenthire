/**
 * D4.3c approved unsigned x402 discovery GET inspection.
 *
 * Mode: READ_ONLY / NO_SIGNING / NO_PAYMENT / TWO_APPROVED_GET_TARGETS_ONLY
 * Layers (kept separate):
 *   1. transport
 *   2. document recognition
 *   3. x402 protocol parse
 *   4. Sepolia offer policy
 *
 * Exact two allowlisted URLs only. Reuses D3.5 secure HTTPS.
 * No retries, no cookies/auth/body, concurrency ≤ 2, 0 redirects.
 * Dry-run performs zero network I/O. Manifest claims are never fetched.
 */

import {
  SECURE_FETCH_MAX_CONCURRENCY,
  SecureFetchError,
  createConcurrencyLimiter,
  secureHttpsExchange,
  type SecureHttpsDeps,
  type SecureHttpsExchange,
} from "../erc8004/secure-https.ts";
import { sanitizeEndpointForArtifact } from "./inspection-policy.ts";
import {
  APPROVED_X402_DISCOVERY_TARGETS,
  assertExactX402DiscoveryDestination,
  listApprovedX402DiscoveryTargets,
  type X402DiscoveryAllowlistEntry,
  type X402DiscoveryTargetId,
} from "./x402-discovery-allowlist.ts";
import {
  evaluateCapturedChallenge,
  parseX402DiscoveryDocumentBytes,
  type X402DiscoveryDocumentSummary,
} from "./x402-discovery-document.ts";
import type {
  ChallengeParseResult,
  OfferPolicyResult,
} from "../x402/challenge-types.ts";
import { MVP_TASK_ID } from "../x402/challenge-types.ts";

export const X402_DISCOVERY_INSPECTION_SCHEMA_VERSION = "1.0" as const;
export const X402_DISCOVERY_INSPECTION_MODE =
  "READ_ONLY / NO_SIGNING / NO_PAYMENT / TWO_APPROVED_GET_TARGETS_ONLY" as const;

/** Spec revisions consulted for PAYMENT-REQUIRED validation (research ≠ approval). */
export const X402_SPEC_REVISIONS = {
  specificationV2Url:
    "https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md",
  httpTransportV2Url:
    "https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md",
  /** Recorded at implementation time via `git ls-remote … HEAD`. */
  repositoryHeadCommit: "971e64f0a5945896e47ab9dec26af056f992cd1b",
} as const;

export type X402DiscoveryInspectionStatus =
  | "success"
  | "notFound"
  | "unauthorized"
  | "paymentRequired"
  | "redirectRejected"
  | "unsafeDestination"
  | "tlsFailure"
  | "timeout"
  | "oversized"
  | "invalidJson"
  | "invalidDocument"
  | "httpError"
  | "networkError";

export type X402DiscoveryRunMode = "dry-run" | "approved-live";

export type X402DiscoveryTransport = (
  url: string,
  deps?: SecureHttpsDeps,
) => Promise<SecureHttpsExchange>;

const REDACTED_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "payment-signature",
  "x-payment",
  "x-payment-response",
]);

export type X402DiscoveryLayerOutcomes = {
  readonly transport: X402DiscoveryInspectionStatus | "planned" | "ok";
  readonly documentRecognition:
    | X402DiscoveryDocumentSummary["recognitionKind"]
    | "notAttempted"
    | "planned";
  readonly x402Parse:
    | "notAttempted"
    | "planned"
    | "ok"
    | "failed"
    | "notHttp402";
  readonly sepoliaPolicy:
    | "notAttempted"
    | "planned"
    | "structurallyCompatible"
    | "failed"
    | "noOffer";
};

export type X402DiscoveryInspectionEvidence = {
  readonly schemaVersion: typeof X402_DISCOVERY_INSPECTION_SCHEMA_VERSION;
  readonly discoveryId: X402DiscoveryTargetId;
  readonly provider: string;
  readonly priorProposalId: "PSI-001" | "PSI-002";
  readonly approvedUrl: string;
  readonly sanitizedUrl: string;
  readonly method: "GET";
  readonly runMode: X402DiscoveryRunMode;
  readonly status: X402DiscoveryInspectionStatus | "planned";
  readonly observedAt: string;
  readonly httpStatus: number | null;
  readonly contentType: string | null;
  readonly contentSha256: string | null;
  readonly byteLength: number | null;
  readonly pinnedAddress: string | null;
  readonly resolvedAddresses: readonly string[] | null;
  readonly elapsedMs: number | null;
  readonly redirectLocation: string | null;
  readonly sanitizedResponseHeaders: Readonly<Record<string, string>> | null;
  readonly paymentRequiredObserved: boolean;
  readonly paymentRequiredHeaderPresent: boolean;
  readonly layers: X402DiscoveryLayerOutcomes;
  readonly documentSummary: X402DiscoveryDocumentSummary | null;
  readonly challengeParse: ChallengeParseResult | null;
  readonly offerPolicy: OfferPolicyResult | null;
  readonly mvpTaskBound: false;
  readonly b4Upgrades: {
    readonly endpointReachable: false;
    readonly challengeVerified: false;
    readonly paymentCompatible: false;
    readonly paidVerified: false;
  };
  readonly error: string | null;
  readonly errorClass: string | null;
};

export type X402DiscoveryInspectionBatch = {
  readonly schemaVersion: typeof X402_DISCOVERY_INSPECTION_SCHEMA_VERSION;
  readonly mode: typeof X402_DISCOVERY_INSPECTION_MODE;
  readonly kind: "x402DiscoveryInspectionEvidence";
  readonly allowlistVersion: "1.0";
  readonly runMode: X402DiscoveryRunMode;
  readonly capturedAt: string;
  readonly source: "dry-run-plan" | "live-https-allowlisted";
  readonly targetCount: number;
  readonly successCount: number;
  readonly paymentRequiredCount: number;
  readonly approvedUrls: readonly string[];
  readonly specRevisions: typeof X402_SPEC_REVISIONS;
  readonly mvpTaskId: typeof MVP_TASK_ID;
  readonly evidences: readonly X402DiscoveryInspectionEvidence[];
};

function sanitizeHeaderValue(name: string, value: string): string {
  if (REDACTED_HEADER_NAMES.has(name.toLowerCase())) {
    return "[redacted]";
  }
  if (value.length > 256) {
    return `${value.slice(0, 256)}…[truncated]`;
  }
  return value;
}

export function sanitizeX402ResponseHeaders(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (rawValue == null) continue;
    const joined = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
    out[name] = sanitizeHeaderValue(name, joined);
  }
  return out;
}

function headerPresent(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): boolean {
  const lower = name.toLowerCase();
  for (const [key, raw] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower) continue;
    if (typeof raw === "string" && raw.trim()) return true;
    if (Array.isArray(raw) && raw.some((v) => typeof v === "string" && v.trim())) {
      return true;
    }
  }
  return false;
}

function mapHttpStatus(statusCode: number): X402DiscoveryInspectionStatus {
  if (statusCode === 404) return "notFound";
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 402) return "paymentRequired";
  if (statusCode >= 200 && statusCode < 300) return "success";
  return "httpError";
}

function mapSecureError(error: SecureFetchError): {
  readonly status: X402DiscoveryInspectionStatus;
  readonly redirectLocation: string | null;
} {
  switch (error.errorClass) {
    case "redirect": {
      const m = error.message.match(/to\s+(.+)$/);
      return {
        status: "redirectRejected",
        redirectLocation: m?.[1] ?? null,
      };
    }
    case "blockedIp":
    case "invalidUrl":
      return { status: "unsafeDestination", redirectLocation: null };
    case "tls":
      return { status: "tlsFailure", redirectLocation: null };
    case "timeout":
      return { status: "timeout", redirectLocation: null };
    case "oversized":
      return { status: "oversized", redirectLocation: null };
    case "dns":
    case "connection":
    case "transient":
    case "unknown":
      return { status: "networkError", redirectLocation: null };
    case "httpError":
      return { status: "httpError", redirectLocation: null };
    default:
      return { status: "networkError", redirectLocation: null };
  }
}

function emptyB4() {
  return {
    endpointReachable: false as const,
    challengeVerified: false as const,
    paymentCompatible: false as const,
    paidVerified: false as const,
  };
}

function plannedEvidence(
  target: X402DiscoveryAllowlistEntry,
  observedAt: string,
): X402DiscoveryInspectionEvidence {
  return {
    schemaVersion: X402_DISCOVERY_INSPECTION_SCHEMA_VERSION,
    discoveryId: target.id,
    provider: target.provider,
    priorProposalId: target.priorProposalId,
    approvedUrl: target.url,
    sanitizedUrl: sanitizeEndpointForArtifact(target.url),
    method: "GET",
    runMode: "dry-run",
    status: "planned",
    observedAt,
    httpStatus: null,
    contentType: null,
    contentSha256: null,
    byteLength: null,
    pinnedAddress: null,
    resolvedAddresses: null,
    elapsedMs: null,
    redirectLocation: null,
    sanitizedResponseHeaders: null,
    paymentRequiredObserved: false,
    paymentRequiredHeaderPresent: false,
    layers: {
      transport: "planned",
      documentRecognition: "planned",
      x402Parse: "planned",
      sepoliaPolicy: "planned",
    },
    documentSummary: null,
    challengeParse: null,
    offerPolicy: null,
    mvpTaskBound: false,
    b4Upgrades: emptyB4(),
    error: null,
    errorClass: null,
  };
}

function failureEvidence(
  target: X402DiscoveryAllowlistEntry,
  observedAt: string,
  status: X402DiscoveryInspectionStatus,
  error: string,
  errorClass: string | null,
  extra?: Partial<X402DiscoveryInspectionEvidence>,
): X402DiscoveryInspectionEvidence {
  return {
    schemaVersion: X402_DISCOVERY_INSPECTION_SCHEMA_VERSION,
    discoveryId: target.id,
    provider: target.provider,
    priorProposalId: target.priorProposalId,
    approvedUrl: target.url,
    sanitizedUrl: sanitizeEndpointForArtifact(target.url),
    method: "GET",
    runMode: "approved-live",
    status,
    observedAt,
    httpStatus: null,
    contentType: null,
    contentSha256: null,
    byteLength: null,
    pinnedAddress: null,
    resolvedAddresses: null,
    elapsedMs: null,
    redirectLocation: null,
    sanitizedResponseHeaders: null,
    paymentRequiredObserved: status === "paymentRequired",
    paymentRequiredHeaderPresent: false,
    layers: {
      transport: status,
      documentRecognition: "notAttempted",
      x402Parse: "notAttempted",
      sepoliaPolicy: "notAttempted",
    },
    documentSummary: null,
    challengeParse: null,
    offerPolicy: null,
    mvpTaskBound: false,
    b4Upgrades: emptyB4(),
    error,
    errorClass,
    ...extra,
  };
}

function policyLayer(
  policy: OfferPolicyResult | null,
): X402DiscoveryLayerOutcomes["sepoliaPolicy"] {
  if (!policy) return "notAttempted";
  if (!policy.parseOk) return "failed";
  if (policy.anyStructurallyCompatible) return "structurallyCompatible";
  return "noOffer";
}

function parseLayer(
  parse: ChallengeParseResult | null,
  httpStatus: number | null,
): X402DiscoveryLayerOutcomes["x402Parse"] {
  if (!parse) {
    return httpStatus === 402 ? "failed" : "notAttempted";
  }
  if (parse.ok) return "ok";
  if (parse.reason === "notHttp402") return "notHttp402";
  return "failed";
}

export async function inspectX402DiscoveryTarget(input: {
  readonly target: X402DiscoveryAllowlistEntry;
  readonly observedAt: string;
  readonly transport: X402DiscoveryTransport;
  readonly deps?: SecureHttpsDeps;
}): Promise<X402DiscoveryInspectionEvidence> {
  const { target, observedAt, transport, deps } = input;

  try {
    assertExactX402DiscoveryDestination(target.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failureEvidence(
      target,
      observedAt,
      "unsafeDestination",
      message,
      "invalidUrl",
    );
  }

  let exchange: SecureHttpsExchange;
  try {
    exchange = await transport(target.url, {
      ...deps,
      accept: "application/json",
      userAgent: "AgentHire-x402-discovery-inspection/0.1 (READ_ONLY)",
    });
  } catch (error) {
    if (error instanceof SecureFetchError) {
      const mapped = mapSecureError(error);
      return failureEvidence(
        target,
        observedAt,
        mapped.status,
        error.message,
        error.errorClass,
        { redirectLocation: mapped.redirectLocation },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return failureEvidence(
      target,
      observedAt,
      "networkError",
      message,
      "unknown",
    );
  }

  const headers = sanitizeX402ResponseHeaders(exchange.headers);
  const paymentRequiredHeaderPresent = headerPresent(
    exchange.headers,
    "payment-required",
  );
  const base = {
    httpStatus: exchange.statusCode,
    contentType: exchange.contentType,
    contentSha256: exchange.sha256,
    byteLength: exchange.byteLength,
    pinnedAddress: exchange.pinnedAddress.address,
    resolvedAddresses: exchange.resolvedAddresses.map((a) => a.address),
    elapsedMs: exchange.elapsedMs,
    sanitizedResponseHeaders: headers,
    paymentRequiredHeaderPresent,
  };

  const httpStatusKind = mapHttpStatus(exchange.statusCode);

  // HTTP 402: validate PAYMENT-REQUIRED per v2 HTTP transport; no signing.
  if (httpStatusKind === "paymentRequired") {
    const { challengeParse, policy } = evaluateCapturedChallenge({
      fixtureKind: "captured",
      httpStatus: 402,
      headers: exchange.headers,
      body: exchange.body,
    });
    // Optionally also recognize JSON body shape without treating as success.
    let documentSummary: X402DiscoveryDocumentSummary | null = null;
    if (exchange.body.length > 0) {
      const doc = parseX402DiscoveryDocumentBytes(exchange.body, {
        manifestUrl: target.url,
      });
      if (doc.ok) documentSummary = doc.summary;
    }

    return failureEvidence(
      target,
      observedAt,
      "paymentRequired",
      "HTTP 402 Payment Required (unsigned observation only)",
      "httpError",
      {
        ...base,
        paymentRequiredObserved: true,
        layers: {
          transport: "ok",
          documentRecognition: documentSummary?.recognitionKind ?? "notAttempted",
          x402Parse: parseLayer(challengeParse, 402),
          sepoliaPolicy: policyLayer(policy),
        },
        documentSummary,
        challengeParse,
        offerPolicy: policy,
      },
    );
  }

  if (httpStatusKind !== "success") {
    return failureEvidence(
      target,
      observedAt,
      httpStatusKind,
      `HTTP ${exchange.statusCode}`,
      "httpError",
      {
        ...base,
        paymentRequiredObserved: false,
        layers: {
          transport: httpStatusKind,
          documentRecognition: "notAttempted",
          x402Parse: "notAttempted",
          sepoliaPolicy: "notAttempted",
        },
      },
    );
  }

  const parsed = parseX402DiscoveryDocumentBytes(exchange.body, {
    manifestUrl: target.url,
  });
  if (!parsed.ok) {
    return failureEvidence(
      target,
      observedAt,
      parsed.reason === "emptyBody" ? "invalidDocument" : parsed.reason,
      parsed.message,
      parsed.reason,
      {
        ...base,
        layers: {
          transport: "ok",
          documentRecognition:
            parsed.reason === "invalidJson" ? "nonJson" : "empty",
          x402Parse: "notAttempted",
          sepoliaPolicy: "notAttempted",
        },
      },
    );
  }

  const challengeParse = parsed.bodyChallengeParse;
  const offerPolicy = parsed.bodyPolicy;

  return {
    schemaVersion: X402_DISCOVERY_INSPECTION_SCHEMA_VERSION,
    discoveryId: target.id,
    provider: target.provider,
    priorProposalId: target.priorProposalId,
    approvedUrl: target.url,
    sanitizedUrl: sanitizeEndpointForArtifact(target.url),
    method: "GET",
    runMode: "approved-live",
    status: "success",
    observedAt,
    ...base,
    redirectLocation: null,
    paymentRequiredObserved: false,
    layers: {
      transport: "ok",
      documentRecognition: parsed.summary.recognitionKind,
      x402Parse: parseLayer(challengeParse, exchange.statusCode),
      sepoliaPolicy: policyLayer(offerPolicy),
    },
    documentSummary: parsed.summary,
    challengeParse,
    offerPolicy,
    mvpTaskBound: false,
    b4Upgrades: emptyB4(),
    error: null,
    errorClass: null,
  };
}

export async function inspectX402DiscoveryBatch(input: {
  readonly runMode: X402DiscoveryRunMode;
  readonly observedAt?: string;
  readonly targets?: readonly X402DiscoveryAllowlistEntry[];
  readonly transport?: X402DiscoveryTransport;
  readonly deps?: SecureHttpsDeps;
  readonly concurrency?: number;
}): Promise<X402DiscoveryInspectionBatch> {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const targets = input.targets ?? listApprovedX402DiscoveryTargets();
  const runMode = input.runMode;

  for (const target of targets) {
    assertExactX402DiscoveryDestination(target.url);
  }

  if (runMode === "dry-run") {
    const evidences = targets.map((t) => plannedEvidence(t, observedAt));
    return {
      schemaVersion: X402_DISCOVERY_INSPECTION_SCHEMA_VERSION,
      mode: X402_DISCOVERY_INSPECTION_MODE,
      kind: "x402DiscoveryInspectionEvidence",
      allowlistVersion: "1.0",
      runMode: "dry-run",
      capturedAt: observedAt,
      source: "dry-run-plan",
      targetCount: evidences.length,
      successCount: 0,
      paymentRequiredCount: 0,
      approvedUrls: targets.map((t) => t.url),
      specRevisions: X402_SPEC_REVISIONS,
      mvpTaskId: MVP_TASK_ID,
      evidences,
    };
  }

  const transport = input.transport ?? secureHttpsExchange;
  const limit = createConcurrencyLimiter(
    input.concurrency ?? SECURE_FETCH_MAX_CONCURRENCY,
  );

  const evidences = await Promise.all(
    targets.map((target) =>
      limit(() =>
        inspectX402DiscoveryTarget({
          target,
          observedAt,
          transport,
          deps: input.deps,
        }),
      ),
    ),
  );

  const order = new Map(
    APPROVED_X402_DISCOVERY_TARGETS.map((t, i) => [t.id, i] as const),
  );
  const sorted = [...evidences].sort((a, b) => {
    return (order.get(a.discoveryId) ?? 99) - (order.get(b.discoveryId) ?? 99);
  });

  const successCount = sorted.filter((e) => e.status === "success").length;
  const paymentRequiredCount = sorted.filter(
    (e) => e.status === "paymentRequired",
  ).length;

  return {
    schemaVersion: X402_DISCOVERY_INSPECTION_SCHEMA_VERSION,
    mode: X402_DISCOVERY_INSPECTION_MODE,
    kind: "x402DiscoveryInspectionEvidence",
    allowlistVersion: "1.0",
    runMode: "approved-live",
    capturedAt: observedAt,
    source: "live-https-allowlisted",
    targetCount: sorted.length,
    successCount,
    paymentRequiredCount,
    approvedUrls: targets.map((t) => t.url),
    specRevisions: X402_SPEC_REVISIONS,
    mvpTaskId: MVP_TASK_ID,
    evidences: sorted,
  };
}

export function countSuccessfulX402DiscoveryReads(
  evidences: readonly X402DiscoveryInspectionEvidence[],
): number {
  return evidences.filter((e) => e.status === "success").length;
}

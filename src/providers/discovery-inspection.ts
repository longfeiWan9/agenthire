/**
 * D4.3a approved discovery GET inspection.
 *
 * Mode: READ_ONLY / NO_SIGNING / APPROVED_DISCOVERY_GET_ONLY
 * - Exact four allowlisted URLs only
 * - Reuses D3.5 secure HTTPS (TLS verify, DNS/IP pin, no redirects, size/timeout)
 * - No retries, no cookies/auth/body, concurrency ≤ 2
 * - Continues on per-target failure
 * - Dry-run performs zero network I/O
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
  APPROVED_DISCOVERY_TARGETS,
  assertExactDiscoveryDestination,
  type DiscoveryAllowlistEntry,
  type DiscoveryDocumentKind,
  type DiscoveryTargetId,
  listApprovedDiscoveryTargets,
} from "./discovery-allowlist.ts";
import {
  parseDiscoveryDocumentBytes,
  type DocumentationCompatibility,
  type ParsedDiscoveryDocument,
} from "./discovery-document.ts";

export const DISCOVERY_INSPECTION_SCHEMA_VERSION = "1.0" as const;
export const DISCOVERY_INSPECTION_MODE =
  "READ_ONLY / NO_SIGNING / APPROVED_DISCOVERY_GET_ONLY" as const;

export type DiscoveryInspectionStatus =
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

export type DiscoveryRunMode = "dry-run" | "approved-live";

export type DiscoveryTransport = (
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

export type DiscoveryInspectionEvidence = {
  readonly schemaVersion: typeof DISCOVERY_INSPECTION_SCHEMA_VERSION;
  readonly discoveryId: DiscoveryTargetId;
  readonly provider: string;
  readonly approvedUrl: string;
  readonly sanitizedUrl: string;
  readonly documentKind: DiscoveryDocumentKind;
  readonly method: "GET";
  readonly runMode: DiscoveryRunMode;
  readonly status: DiscoveryInspectionStatus | "planned";
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
  readonly error: string | null;
  readonly errorClass: string | null;
  readonly documentSummary: ParsedDiscoveryDocument | null;
  readonly documentationCompatibility: DocumentationCompatibility | null;
};

export type DiscoveryInspectionBatch = {
  readonly schemaVersion: typeof DISCOVERY_INSPECTION_SCHEMA_VERSION;
  readonly mode: typeof DISCOVERY_INSPECTION_MODE;
  readonly kind: "discoveryInspectionEvidence";
  readonly allowlistVersion: "1.0";
  readonly runMode: DiscoveryRunMode;
  readonly capturedAt: string;
  readonly source: "dry-run-plan" | "live-https-allowlisted";
  readonly targetCount: number;
  readonly successCount: number;
  readonly approvedUrls: readonly string[];
  readonly evidences: readonly DiscoveryInspectionEvidence[];
};

function sanitizeHeaderValue(name: string, value: string): string {
  if (REDACTED_HEADER_NAMES.has(name.toLowerCase())) {
    return "[redacted]";
  }
  // Avoid leaking long challenge bodies via WWW-Authenticate-like headers.
  if (value.length > 256) {
    return `${value.slice(0, 256)}…[truncated]`;
  }
  return value;
}

export function sanitizeResponseHeaders(
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

function mapHttpStatus(statusCode: number): DiscoveryInspectionStatus {
  if (statusCode === 404) return "notFound";
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 402) return "paymentRequired";
  if (statusCode >= 200 && statusCode < 300) return "success";
  return "httpError";
}

function mapSecureError(error: SecureFetchError): {
  readonly status: DiscoveryInspectionStatus;
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

function plannedEvidence(
  target: DiscoveryAllowlistEntry,
  observedAt: string,
): DiscoveryInspectionEvidence {
  return {
    schemaVersion: DISCOVERY_INSPECTION_SCHEMA_VERSION,
    discoveryId: target.id,
    provider: target.provider,
    approvedUrl: target.url,
    sanitizedUrl: sanitizeEndpointForArtifact(target.url),
    documentKind: target.documentKind,
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
    error: null,
    errorClass: null,
    documentSummary: null,
    documentationCompatibility: null,
  };
}

function failureEvidence(
  target: DiscoveryAllowlistEntry,
  observedAt: string,
  status: DiscoveryInspectionStatus,
  error: string,
  errorClass: string | null,
  extra?: Partial<DiscoveryInspectionEvidence>,
): DiscoveryInspectionEvidence {
  return {
    schemaVersion: DISCOVERY_INSPECTION_SCHEMA_VERSION,
    discoveryId: target.id,
    provider: target.provider,
    approvedUrl: target.url,
    sanitizedUrl: sanitizeEndpointForArtifact(target.url),
    documentKind: target.documentKind,
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
    error,
    errorClass,
    documentSummary: null,
    documentationCompatibility: null,
    ...extra,
  };
}

export async function inspectDiscoveryTarget(input: {
  readonly target: DiscoveryAllowlistEntry;
  readonly observedAt: string;
  readonly transport: DiscoveryTransport;
  readonly deps?: SecureHttpsDeps;
}): Promise<DiscoveryInspectionEvidence> {
  const { target, observedAt, transport, deps } = input;

  try {
    assertExactDiscoveryDestination(target.url);
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
      userAgent: "AgentHire-discovery-inspection/0.1 (READ_ONLY)",
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

  const headers = sanitizeResponseHeaders(exchange.headers);
  const base = {
    httpStatus: exchange.statusCode,
    contentType: exchange.contentType,
    contentSha256: exchange.sha256,
    byteLength: exchange.byteLength,
    pinnedAddress: exchange.pinnedAddress.address,
    resolvedAddresses: exchange.resolvedAddresses.map((a) => a.address),
    elapsedMs: exchange.elapsedMs,
    sanitizedResponseHeaders: headers,
  };

  const httpStatusKind = mapHttpStatus(exchange.statusCode);
  if (httpStatusKind !== "success") {
    return failureEvidence(
      target,
      observedAt,
      httpStatusKind,
      `HTTP ${exchange.statusCode}`,
      httpStatusKind === "paymentRequired" ? "httpError" : "httpError",
      {
        ...base,
        paymentRequiredObserved: httpStatusKind === "paymentRequired",
        // For 402 keep hash/headers only — do not embed raw payment challenge body.
        contentSha256: exchange.sha256,
      },
    );
  }

  const parsed = parseDiscoveryDocumentBytes(
    target.documentKind,
    exchange.body,
  );
  if (!parsed.ok) {
    return failureEvidence(
      target,
      observedAt,
      parsed.reason,
      parsed.message,
      parsed.reason,
      base,
    );
  }

  return {
    schemaVersion: DISCOVERY_INSPECTION_SCHEMA_VERSION,
    discoveryId: target.id,
    provider: target.provider,
    approvedUrl: target.url,
    sanitizedUrl: sanitizeEndpointForArtifact(target.url),
    documentKind: target.documentKind,
    method: "GET",
    runMode: "approved-live",
    status: "success",
    observedAt,
    ...base,
    redirectLocation: null,
    paymentRequiredObserved: false,
    error: null,
    errorClass: null,
    documentSummary: parsed.document,
    documentationCompatibility: parsed.compatibility,
  };
}

export async function inspectDiscoveryBatch(input: {
  readonly runMode: DiscoveryRunMode;
  readonly observedAt?: string;
  readonly targets?: readonly DiscoveryAllowlistEntry[];
  readonly transport?: DiscoveryTransport;
  readonly deps?: SecureHttpsDeps;
  readonly concurrency?: number;
}): Promise<DiscoveryInspectionBatch> {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const targets = input.targets ?? listApprovedDiscoveryTargets();
  const runMode = input.runMode;

  if (targets.length !== APPROVED_DISCOVERY_TARGETS.length && !input.targets) {
    // defensive — listApprovedDiscoveryTargets is authoritative
  }

  for (const target of targets) {
    assertExactDiscoveryDestination(target.url);
  }

  if (runMode === "dry-run") {
    const evidences = targets.map((t) => plannedEvidence(t, observedAt));
    return {
      schemaVersion: DISCOVERY_INSPECTION_SCHEMA_VERSION,
      mode: DISCOVERY_INSPECTION_MODE,
      kind: "discoveryInspectionEvidence",
      allowlistVersion: "1.0",
      runMode: "dry-run",
      capturedAt: observedAt,
      source: "dry-run-plan",
      targetCount: evidences.length,
      successCount: 0,
      approvedUrls: targets.map((t) => t.url),
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
        inspectDiscoveryTarget({
          target,
          observedAt,
          transport,
          deps: input.deps,
        }),
      ),
    ),
  );

  // Stable order by discovery id.
  const order = new Map(
    APPROVED_DISCOVERY_TARGETS.map((t, i) => [t.id, i] as const),
  );
  const sorted = [...evidences].sort((a, b) => {
    return (order.get(a.discoveryId) ?? 99) - (order.get(b.discoveryId) ?? 99);
  });

  const successCount = sorted.filter((e) => e.status === "success").length;

  return {
    schemaVersion: DISCOVERY_INSPECTION_SCHEMA_VERSION,
    mode: DISCOVERY_INSPECTION_MODE,
    kind: "discoveryInspectionEvidence",
    allowlistVersion: "1.0",
    runMode: "approved-live",
    capturedAt: observedAt,
    source: "live-https-allowlisted",
    targetCount: sorted.length,
    successCount,
    approvedUrls: targets.map((t) => t.url),
    evidences: sorted,
  };
}

export function countSuccessfulDiscoveryReads(
  evidences: readonly DiscoveryInspectionEvidence[],
): number {
  return evidences.filter((e) => e.status === "success").length;
}

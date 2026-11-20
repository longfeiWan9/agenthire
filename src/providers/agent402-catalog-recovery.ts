/**
 * D4.4b — Full Agent402 resource-catalog recovery (CATALOG-001).
 *
 * Mode: READ_ONLY / NO_SIGNING / NO_PAYMENT / ONE_APPROVED_DISCOVERY_GET_ONLY
 *
 * Exactly one approved GET: https://agent402.tools/.well-known/x402
 * Reuses D3.5 secure HTTPS (TLS verify+SNI, public IP pin, 0 redirects,
 * ≤10s, ≤256 KiB, concurrency 1, 0 retries, no cookies/auth/body).
 *
 * Single-use attempt marker is written BEFORE network I/O. Existing marker
 * blocks re-run. No auto-reset / force-retry. Crash/timeout after marker
 * write does not silently re-approve.
 *
 * Raw response bytes are hashed then deleted (not committed by default).
 * Preserves all safely normalized resource entries (not the D4.3c 25-sample).
 * Does not overwrite D4.3c evidence history.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  SecureFetchError,
  secureHttpsExchange,
  type SecureHttpsDeps,
  type SecureHttpsExchange,
} from "../erc8004/secure-https.ts";
import { MVP_TASK_ID } from "../x402/challenge-types.ts";
import { sanitizeEndpointForArtifact } from "./inspection-policy.ts";
import {
  analyzeResourceCatalog,
  buildShortlistDocument,
  normalizeAdvertisedResource,
  sha256Hex as sha256Text,
  stableStringify,
  type AdvertisedResource,
  type CatalogCoverage,
  type CatalogSourceEvidence,
  type RawAdvertisedResourceInput,
  type ResourceCatalogAnalysisDocument,
  type ResourceInspectionShortlistDocument,
} from "./resource-analysis.ts";
import {
  parseX402DiscoveryDocumentBytes,
  sha256Hex as sha256Buffer,
  type AdvertisedResourceClaim,
  type X402DiscoveryDocumentSummary,
} from "./x402-discovery-document.ts";

export const CATALOG_RECOVERY_SCHEMA_VERSION = "1.0" as const;
export const CATALOG_RECOVERY_MODE =
  "READ_ONLY / NO_SIGNING / NO_PAYMENT / ONE_APPROVED_DISCOVERY_GET_ONLY" as const;

export const CATALOG_001_REQUEST_ID = "CATALOG-001" as const;
export const CATALOG_001_APPROVED_URL =
  "https://agent402.tools/.well-known/x402" as const;
export const CATALOG_001_PROVIDER = "Agent402" as const;
export const CATALOG_001_METHOD = "GET" as const;

/** Relative marker path (repo root). Documented; no auto-reset. */
export const CATALOG_001_ATTEMPT_MARKER_REL =
  "docs/day4/evidence/catalog-001-live-attempt.marker" as const;

/** Relative temp dir for raw bytes (gitignored); deleted after hash. */
export const CATALOG_001_RAW_TEMP_REL =
  ".tmp/agent402-catalog-raw" as const;

/** D4.3c XDISC-001 body SHA-256 (full response; sample was truncated in evidence). */
export const D43C_AGENT402_CONTENT_SHA256 =
  "57182ef89b91cd5cba86d4c3c1203888e6b48f500970cafe8ef676f36f445011" as const;

export type CatalogRecoveryRunMode = "dry-run" | "approved-live";

export type CatalogRecoveryStatus =
  | "planned"
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
  | "networkError"
  | "attemptBlocked";

/** User §6 — CatalogRecoverySummary. */
export type CatalogRecoverySummary = {
  readonly sourceUrl: string;
  readonly httpStatus: number | null;
  readonly observedAt: string;
  readonly rawResponseBytes: number | null;
  readonly rawResponseSha256: string | null;
  readonly advertisedResourceCount: number | null;
  readonly parsedResourceCount: number;
  readonly normalizedResourceCount: number;
  readonly safelyRetainedResourceCount: number;
  readonly omittedResourceCount: number;
  readonly parseFailureCount: number;
  readonly coverage: CatalogCoverage;
  readonly matchesPreviousResponseHash: boolean | null;
};

export type Catalog001AllowlistEntry = {
  readonly id: typeof CATALOG_001_REQUEST_ID;
  readonly provider: typeof CATALOG_001_PROVIDER;
  readonly url: typeof CATALOG_001_APPROVED_URL;
  readonly method: typeof CATALOG_001_METHOD;
  readonly priorDiscoveryId: "XDISC-001";
};

export const CATALOG_001_TARGET = {
  id: CATALOG_001_REQUEST_ID,
  provider: CATALOG_001_PROVIDER,
  url: CATALOG_001_APPROVED_URL,
  method: CATALOG_001_METHOD,
  priorDiscoveryId: "XDISC-001",
} as const satisfies Catalog001AllowlistEntry;

export type CatalogRecoveryTransport = (
  url: string,
  deps?: SecureHttpsDeps,
) => Promise<SecureHttpsExchange>;

export type AttemptMarkerRecord = {
  readonly schemaVersion: "1.0";
  readonly requestId: typeof CATALOG_001_REQUEST_ID;
  readonly approvedUrl: typeof CATALOG_001_APPROVED_URL;
  readonly method: typeof CATALOG_001_METHOD;
  readonly writtenAt: string;
  readonly purpose: "single-use-live-attempt-guard";
  readonly note: string;
};

export type Agent402FullResourceCatalogDocument = {
  readonly schemaVersion: typeof CATALOG_RECOVERY_SCHEMA_VERSION;
  readonly mode: typeof CATALOG_RECOVERY_MODE;
  readonly kind: "agent402FullResourceCatalog";
  readonly requestId: typeof CATALOG_001_REQUEST_ID;
  readonly provider: typeof CATALOG_001_PROVIDER;
  readonly approvedUrl: typeof CATALOG_001_APPROVED_URL;
  readonly sanitizedUrl: string;
  readonly method: typeof CATALOG_001_METHOD;
  readonly runMode: CatalogRecoveryRunMode;
  readonly status: CatalogRecoveryStatus;
  readonly summary: CatalogRecoverySummary;
  readonly priorD43cContentSha256: typeof D43C_AGENT402_CONTENT_SHA256;
  readonly documentSummary: {
    readonly recognitionKind: X402DiscoveryDocumentSummary["recognitionKind"] | null;
    readonly x402Version: number | null;
    readonly name: string | null;
    readonly notes: string | null;
  } | null;
  readonly resources: readonly AdvertisedResource[];
  readonly mvpTaskBound: false;
  readonly b4Upgrades: {
    readonly endpointReachable: false;
    readonly challengeVerified: false;
    readonly paymentCompatible: false;
    readonly paidVerified: false;
  };
  readonly attemptMarkerPath: string;
  readonly rawBodyCommitted: false;
  readonly error: string | null;
  readonly errorClass: string | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Exact string match only — trailing slash / query / host-only rejected. */
export function isApprovedCatalog001Url(url: string): boolean {
  return url === CATALOG_001_APPROVED_URL;
}

/**
 * Structural gate for CATALOG-001: https, exact host+path, no credentials,
 * no query, no fragment, default port only.
 */
export function assertExactCatalog001Destination(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid CATALOG-001 URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`CATALOG-001 URL must be https: (got ${parsed.protocol})`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("CATALOG-001 URL must not embed credentials");
  }
  if (parsed.search !== "" && parsed.search !== "?") {
    throw new Error("CATALOG-001 URL must not include a query string");
  }
  if (parsed.hash !== "" && parsed.hash !== "#") {
    throw new Error("CATALOG-001 URL must not include a fragment");
  }
  if (parsed.port !== "" && parsed.port !== "443") {
    throw new Error(`CATALOG-001 URL unexpected port: ${parsed.port}`);
  }
  if (!isApprovedCatalog001Url(url)) {
    throw new Error(`URL not approved for CATALOG-001: ${url}`);
  }
  const canonical = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  if (canonical !== url) {
    throw new Error(`CATALOG-001 URL is not canonical allowlist form: ${url}`);
  }
  return parsed;
}

export function defaultAttemptMarkerPath(repoRoot: string): string {
  return join(repoRoot, CATALOG_001_ATTEMPT_MARKER_REL);
}

export function defaultRawTempDir(repoRoot: string): string {
  return join(repoRoot, CATALOG_001_RAW_TEMP_REL);
}

export function readPriorD43cAgent402Sha256(repoRoot: string): string | null {
  const path = join(
    repoRoot,
    "docs/day4/evidence/x402-discovery-inspection.json",
  );
  if (!existsSync(path)) return null;
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as {
      evidences?: readonly {
        discoveryId?: string;
        contentSha256?: string | null;
      }[];
    };
    const hit = json.evidences?.find((e) => e.discoveryId === "XDISC-001");
    return typeof hit?.contentSha256 === "string" ? hit.contentSha256 : null;
  } catch {
    return null;
  }
}

export function attemptMarkerExists(markerPath: string): boolean {
  return existsSync(markerPath);
}

/**
 * Write single-use attempt marker BEFORE network I/O.
 * Uses write-temp + rename for crash-safe creation. No overwrite of existing.
 */
export function writeAttemptMarker(input: {
  readonly markerPath: string;
  readonly writtenAt: string;
}): AttemptMarkerRecord {
  if (existsSync(input.markerPath)) {
    throw new Error(
      `CATALOG-001 single-use attempt marker already exists at ${input.markerPath}. ` +
        `Re-run is blocked (no auto-reset / force-retry). Crash/timeout after a prior ` +
        `marker write does not silently re-approve live access.`,
    );
  }
  const record: AttemptMarkerRecord = {
    schemaVersion: "1.0",
    requestId: CATALOG_001_REQUEST_ID,
    approvedUrl: CATALOG_001_APPROVED_URL,
    method: CATALOG_001_METHOD,
    writtenAt: input.writtenAt,
    purpose: "single-use-live-attempt-guard",
    note:
      "Written before network I/O. Presence blocks any further --approved-live run. " +
      "No CLI force-reset. Manual marker removal is out of band and not provided.",
  };
  mkdirSync(dirname(input.markerPath), { recursive: true });
  const tmp = `${input.markerPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  try {
    renameSync(tmp, input.markerPath);
  } catch (error) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // ignore cleanup
    }
    if (existsSync(input.markerPath)) {
      throw new Error(
        `CATALOG-001 single-use attempt marker already exists at ${input.markerPath}. Re-run blocked.`,
      );
    }
    throw error;
  }
  return record;
}

function mapSecureError(error: SecureFetchError): CatalogRecoveryStatus {
  switch (error.errorClass) {
    case "redirect":
      return "redirectRejected";
    case "blockedIp":
    case "invalidUrl":
      return "unsafeDestination";
    case "tls":
      return "tlsFailure";
    case "timeout":
      return "timeout";
    case "oversized":
      return "oversized";
    case "dns":
    case "connection":
    case "transient":
    case "unknown":
      return "networkError";
    case "httpError":
      return "httpError";
    default:
      return "networkError";
  }
}

function mapHttpStatus(statusCode: number): CatalogRecoveryStatus {
  if (statusCode === 404) return "notFound";
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 402) return "paymentRequired";
  if (statusCode >= 200 && statusCode < 300) return "success";
  return "httpError";
}

function emptyB4() {
  return {
    endpointReachable: false as const,
    challengeVerified: false as const,
    paymentCompatible: false as const,
    paidVerified: false as const,
  };
}

function plannedSummary(observedAt: string): CatalogRecoverySummary {
  return {
    sourceUrl: CATALOG_001_APPROVED_URL,
    httpStatus: null,
    observedAt,
    rawResponseBytes: null,
    rawResponseSha256: null,
    advertisedResourceCount: null,
    parsedResourceCount: 0,
    normalizedResourceCount: 0,
    safelyRetainedResourceCount: 0,
    omittedResourceCount: 0,
    parseFailureCount: 0,
    coverage: "unavailable",
    matchesPreviousResponseHash: null,
  };
}

/**
 * Classify raw `resources` array entries into parseable claims vs failures.
 * String URLs and plain objects are parseable; other shapes are parse failures.
 */
export function classifyRawResourceEntries(
  resourcesRaw: readonly unknown[],
  manifestHost: string | null,
): {
  readonly parsed: RawAdvertisedResourceInput[];
  readonly parseFailureCount: number;
} {
  const parsed: RawAdvertisedResourceInput[] = [];
  let parseFailureCount = 0;
  for (const entry of resourcesRaw) {
    if (typeof entry === "string") {
      const same =
        manifestHost != null
          ? (() => {
              try {
                const host = new URL(entry).hostname.toLowerCase();
                return (
                  host === manifestHost || host.endsWith(`.${manifestHost}`)
                );
              } catch {
                return null;
              }
            })()
          : null;
      parsed.push({
        url: entry,
        method: null,
        description: null,
        sameHostClaim: same,
        fixtureKind: "captured",
      });
      continue;
    }
    if (!isPlainObject(entry)) {
      parseFailureCount += 1;
      continue;
    }
    const url =
      typeof entry.url === "string" && entry.url.trim()
        ? entry.url.trim()
        : null;
    const method =
      typeof entry.method === "string" && entry.method.trim()
        ? entry.method.trim().toUpperCase()
        : null;
    const description =
      typeof entry.description === "string" ? entry.description : null;
    let sameHostClaim: boolean | null = null;
    if (url && manifestHost != null) {
      try {
        const host = new URL(url).hostname.toLowerCase();
        sameHostClaim =
          host === manifestHost || host.endsWith(`.${manifestHost}`);
      } catch {
        sameHostClaim = null;
      }
    }
    parsed.push({
      url,
      method,
      description,
      sameHostClaim,
      fixtureKind: "captured",
    });
  }
  return { parsed, parseFailureCount };
}

function claimsToRawInputs(
  claims: readonly AdvertisedResourceClaim[],
): RawAdvertisedResourceInput[] {
  return claims.map((c) => ({
    url: c.url,
    method: c.method,
    description: c.description,
    sameHostClaim: c.sameHostClaim,
    fixtureKind: "captured" as const,
  }));
}

export function buildCatalogRecoverySummary(input: {
  readonly observedAt: string;
  readonly httpStatus: number | null;
  readonly rawResponseBytes: number | null;
  readonly rawResponseSha256: string | null;
  readonly advertisedResourceCount: number | null;
  readonly parsedResourceCount: number;
  readonly normalizedResourceCount: number;
  readonly safelyRetainedResourceCount: number;
  readonly parseFailureCount: number;
  readonly priorSha256: string | null;
}): CatalogRecoverySummary {
  const advertised = input.advertisedResourceCount;
  const retained = input.safelyRetainedResourceCount;
  const omitted =
    advertised == null
      ? input.parseFailureCount
      : Math.max(0, advertised - retained);
  let coverage: CatalogCoverage;
  if (advertised == null && retained === 0) {
    coverage = "unavailable";
  } else if (
    advertised != null &&
    retained === advertised &&
    input.parseFailureCount === 0
  ) {
    coverage = "complete";
  } else if (retained > 0 && advertised != null && retained < advertised) {
    coverage = "partial";
  } else if (retained > 0) {
    coverage = "partial";
  } else {
    coverage = "unavailable";
  }

  const matchesPreviousResponseHash =
    input.rawResponseSha256 == null || input.priorSha256 == null
      ? null
      : input.rawResponseSha256 === input.priorSha256;

  return {
    sourceUrl: CATALOG_001_APPROVED_URL,
    httpStatus: input.httpStatus,
    observedAt: input.observedAt,
    rawResponseBytes: input.rawResponseBytes,
    rawResponseSha256: input.rawResponseSha256,
    advertisedResourceCount: advertised,
    parsedResourceCount: input.parsedResourceCount,
    normalizedResourceCount: input.normalizedResourceCount,
    safelyRetainedResourceCount: retained,
    omittedResourceCount: omitted,
    parseFailureCount: input.parseFailureCount,
    coverage,
    matchesPreviousResponseHash,
  };
}

/**
 * Persist raw bytes under temp dir for hashing, then delete.
 * Never commits raw by default.
 */
export function hashAndDiscardRawBody(input: {
  readonly rawTempDir: string;
  readonly body: Buffer;
}): { readonly sha256: string; readonly byteLength: number } {
  mkdirSync(input.rawTempDir, { recursive: true });
  const rawPath = join(input.rawTempDir, "CATALOG-001-raw.bin");
  try {
    writeFileSync(rawPath, input.body);
    const sha256 = sha256Buffer(input.body);
    return { sha256, byteLength: input.body.length };
  } finally {
    try {
      rmSync(input.rawTempDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Normalize then sanitize for artifact retention.
 * Secrets must not appear in committed catalog URL / resourceId fields.
 */
function normalizeRetainedResources(
  raw: readonly RawAdvertisedResourceInput[],
): AdvertisedResource[] {
  return raw.map((entry, index) => {
    const normalized = normalizeAdvertisedResource(entry, {
      discoveryId: CATALOG_001_REQUEST_ID,
      provider: CATALOG_001_PROVIDER,
      index,
      fixtureKind: entry.fixtureKind ?? "captured",
    });
    const needsRedaction =
      normalized.urlSafety.hasSecretQuery ||
      normalized.urlSafety.hasCredentials;
    if (!needsRedaction || !normalized.sanitizedUrl) {
      return normalized;
    }
    const safeUrl = normalized.sanitizedUrl;
    const method = normalized.method ?? "METHOD_UNSPECIFIED";
    return {
      ...normalized,
      url: safeUrl,
      resourceId: `${CATALOG_001_REQUEST_ID}:${index}:${method}:${safeUrl}`,
    };
  });
}

function catalogDocument(input: {
  readonly runMode: CatalogRecoveryRunMode;
  readonly status: CatalogRecoveryStatus;
  readonly summary: CatalogRecoverySummary;
  readonly resources: readonly AdvertisedResource[];
  readonly documentSummary: Agent402FullResourceCatalogDocument["documentSummary"];
  readonly attemptMarkerPath: string;
  readonly error: string | null;
  readonly errorClass: string | null;
}): Agent402FullResourceCatalogDocument {
  return {
    schemaVersion: CATALOG_RECOVERY_SCHEMA_VERSION,
    mode: CATALOG_RECOVERY_MODE,
    kind: "agent402FullResourceCatalog",
    requestId: CATALOG_001_REQUEST_ID,
    provider: CATALOG_001_PROVIDER,
    approvedUrl: CATALOG_001_APPROVED_URL,
    sanitizedUrl: sanitizeEndpointForArtifact(CATALOG_001_APPROVED_URL),
    method: CATALOG_001_METHOD,
    runMode: input.runMode,
    status: input.status,
    summary: input.summary,
    priorD43cContentSha256: D43C_AGENT402_CONTENT_SHA256,
    documentSummary: input.documentSummary,
    resources: input.resources,
    mvpTaskBound: false,
    b4Upgrades: emptyB4(),
    attemptMarkerPath: input.attemptMarkerPath,
    rawBodyCommitted: false,
    error: input.error,
    errorClass: input.errorClass,
  };
}

export function catalogSourceFromRecovery(
  catalog: Agent402FullResourceCatalogDocument,
  sourcePath: string,
): CatalogSourceEvidence {
  const resources: RawAdvertisedResourceInput[] = catalog.resources.map(
    (r) => ({
      url: r.url,
      method: r.method,
      description: r.description,
      sameHostClaim: r.sameHostClaim,
      resourceId: r.resourceId,
      fixtureKind: r.fixtureKind,
    }),
  );
  const reported =
    catalog.summary.advertisedResourceCount ??
    catalog.summary.safelyRetainedResourceCount;
  const recoverable = catalog.summary.safelyRetainedResourceCount;
  const truncated =
    catalog.summary.coverage === "sampleOnly" ||
    (catalog.summary.advertisedResourceCount != null &&
      recoverable < catalog.summary.advertisedResourceCount);
  return {
    discoveryId: CATALOG_001_REQUEST_ID,
    provider: CATALOG_001_PROVIDER,
    approvedUrl: CATALOG_001_APPROVED_URL,
    contentSha256: catalog.summary.rawResponseSha256,
    byteLength: catalog.summary.rawResponseBytes,
    reportedResourceCount: reported,
    recoverableResourceCount: recoverable,
    truncated,
    recognitionKind: catalog.documentSummary?.recognitionKind ?? null,
    x402Version: catalog.documentSummary?.x402Version ?? null,
    fullBodyRecoverable:
      catalog.summary.coverage === "complete" &&
      !truncated &&
      recoverable === reported,
    sourcePath,
    resources,
  };
}

export async function recoverAgent402Catalog(input: {
  readonly runMode: CatalogRecoveryRunMode;
  readonly observedAt?: string;
  readonly repoRoot: string;
  readonly markerPath?: string;
  readonly rawTempDir?: string;
  readonly priorSha256?: string | null;
  readonly transport?: CatalogRecoveryTransport;
  readonly deps?: SecureHttpsDeps;
  /** Test-only: skip marker write (dry-run never writes anyway). */
  readonly skipMarkerWrite?: boolean;
}): Promise<Agent402FullResourceCatalogDocument> {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const markerPathAbs =
    input.markerPath ?? defaultAttemptMarkerPath(input.repoRoot);
  /** Prefer repo-relative marker path in committed artifacts. */
  const markerPathForArtifact = markerPathAbs.startsWith(input.repoRoot)
    ? markerPathAbs.slice(input.repoRoot.length).replace(/^\//, "")
    : markerPathAbs;
  const markerPath = markerPathAbs;
  const rawTempDir = input.rawTempDir ?? defaultRawTempDir(input.repoRoot);
  const priorSha256 =
    input.priorSha256 === undefined
      ? (readPriorD43cAgent402Sha256(input.repoRoot) ??
        D43C_AGENT402_CONTENT_SHA256)
      : input.priorSha256;

  assertExactCatalog001Destination(CATALOG_001_APPROVED_URL);

  if (input.runMode === "dry-run") {
    return catalogDocument({
      runMode: "dry-run",
      status: "planned",
      summary: plannedSummary(observedAt),
      resources: [],
      documentSummary: null,
      attemptMarkerPath: markerPathForArtifact,
      error: null,
      errorClass: null,
    });
  }

  // --- approved-live: single-use guard BEFORE any network I/O ---
  if (!input.skipMarkerWrite) {
    if (attemptMarkerExists(markerPath)) {
      return catalogDocument({
        runMode: "approved-live",
        status: "attemptBlocked",
        summary: {
          ...plannedSummary(observedAt),
          coverage: "unavailable",
        },
        resources: [],
        documentSummary: null,
        attemptMarkerPath: markerPathForArtifact,
        error: `Single-use attempt marker exists at ${markerPathForArtifact}; live re-run blocked`,
        errorClass: "attemptBlocked",
      });
    }
    writeAttemptMarker({ markerPath, writtenAt: observedAt });
  }

  const transport = input.transport ?? secureHttpsExchange;
  let exchange: SecureHttpsExchange;
  try {
    exchange = await transport(CATALOG_001_APPROVED_URL, {
      ...input.deps,
      accept: "application/json",
      userAgent: "AgentHire-agent402-catalog-recovery/0.1 (READ_ONLY)",
    });
  } catch (error) {
    if (error instanceof SecureFetchError) {
      return catalogDocument({
        runMode: "approved-live",
        status: mapSecureError(error),
        summary: buildCatalogRecoverySummary({
          observedAt,
          httpStatus: null,
          rawResponseBytes: null,
          rawResponseSha256: null,
          advertisedResourceCount: null,
          parsedResourceCount: 0,
          normalizedResourceCount: 0,
          safelyRetainedResourceCount: 0,
          parseFailureCount: 0,
          priorSha256,
        }),
        resources: [],
        documentSummary: null,
        attemptMarkerPath: markerPathForArtifact,
        error: error.message,
        errorClass: error.errorClass,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    return catalogDocument({
      runMode: "approved-live",
      status: "networkError",
      summary: buildCatalogRecoverySummary({
        observedAt,
        httpStatus: null,
        rawResponseBytes: null,
        rawResponseSha256: null,
        advertisedResourceCount: null,
        parsedResourceCount: 0,
        normalizedResourceCount: 0,
        safelyRetainedResourceCount: 0,
        parseFailureCount: 0,
        priorSha256,
      }),
      resources: [],
      documentSummary: null,
      attemptMarkerPath: markerPathForArtifact,
      error: message,
      errorClass: "unknown",
    });
  }

  const { sha256, byteLength } = hashAndDiscardRawBody({
    rawTempDir,
    body: exchange.body,
  });

  const httpKind = mapHttpStatus(exchange.statusCode);
  if (httpKind !== "success") {
    return catalogDocument({
      runMode: "approved-live",
      status: httpKind,
      summary: buildCatalogRecoverySummary({
        observedAt,
        httpStatus: exchange.statusCode,
        rawResponseBytes: byteLength,
        rawResponseSha256: sha256,
        advertisedResourceCount: null,
        parsedResourceCount: 0,
        normalizedResourceCount: 0,
        safelyRetainedResourceCount: 0,
        parseFailureCount: 0,
        priorSha256,
      }),
      resources: [],
      documentSummary: null,
      attemptMarkerPath: markerPathForArtifact,
      error: `HTTP ${exchange.statusCode}`,
      errorClass: "httpError",
    });
  }

  const parsedDoc = parseX402DiscoveryDocumentBytes(exchange.body, {
    manifestUrl: CATALOG_001_APPROVED_URL,
    resourceSampleLimit: "all",
  });

  if (!parsedDoc.ok) {
    return catalogDocument({
      runMode: "approved-live",
      status:
        parsedDoc.reason === "emptyBody" ? "invalidDocument" : parsedDoc.reason,
      summary: buildCatalogRecoverySummary({
        observedAt,
        httpStatus: exchange.statusCode,
        rawResponseBytes: byteLength,
        rawResponseSha256: sha256,
        advertisedResourceCount: null,
        parsedResourceCount: 0,
        normalizedResourceCount: 0,
        safelyRetainedResourceCount: 0,
        parseFailureCount: 1,
        priorSha256,
      }),
      resources: [],
      documentSummary: null,
      attemptMarkerPath: markerPathForArtifact,
      error: parsedDoc.message,
      errorClass: parsedDoc.reason,
    });
  }

  // Re-walk raw JSON resources for precise parseFailure accounting.
  let resourcesRaw: unknown[] = [];
  let parseFailureCount = 0;
  try {
    const json = JSON.parse(exchange.body.toString("utf8")) as unknown;
    if (isPlainObject(json) && Array.isArray(json.resources)) {
      resourcesRaw = json.resources;
    }
  } catch {
    // already validated by parseX402DiscoveryDocumentBytes
  }
  const manifestHost = "agent402.tools";
  const classified = classifyRawResourceEntries(resourcesRaw, manifestHost);
  parseFailureCount = classified.parseFailureCount;

  // Prefer full retained claims from document parser (resourceSampleLimit: "all").
  const rawInputs =
    parsedDoc.summary.advertisedResources.length > 0
      ? claimsToRawInputs(parsedDoc.summary.advertisedResources)
      : classified.parsed;

  const normalized = normalizeRetainedResources(rawInputs);
  // "Safely retained" = all normalized entries with secrets already redacted
  // via sanitizeEndpointForArtifact inside normalizeAdvertisedResource.
  const retained = normalized;

  const summary = buildCatalogRecoverySummary({
    observedAt,
    httpStatus: exchange.statusCode,
    rawResponseBytes: byteLength,
    rawResponseSha256: sha256,
    advertisedResourceCount: parsedDoc.summary.advertisedResourceCount,
    parsedResourceCount: rawInputs.length,
    normalizedResourceCount: normalized.length,
    safelyRetainedResourceCount: retained.length,
    parseFailureCount,
    priorSha256,
  });

  return catalogDocument({
    runMode: "approved-live",
    status: "success",
    summary,
    resources: retained,
    documentSummary: {
      recognitionKind: parsedDoc.summary.recognitionKind,
      x402Version: parsedDoc.summary.x402Version,
      name: parsedDoc.summary.name,
      notes: parsedDoc.summary.notes,
    },
    attemptMarkerPath: markerPathForArtifact,
    error: null,
    errorClass: null,
  });
}

export function analyzeRecoveredAgent402Catalog(
  catalog: Agent402FullResourceCatalogDocument,
  sourcePath: string,
): {
  readonly analysis: ResourceCatalogAnalysisDocument;
  readonly shortlist: ResourceInspectionShortlistDocument;
} {
  const source = catalogSourceFromRecovery(catalog, sourcePath);
  const analysis = analyzeResourceCatalog([source]);
  const shortlist = buildShortlistDocument(analysis);
  return { analysis, shortlist };
}

export function renderFullCatalogAnalysisMarkdown(
  analysis: ResourceCatalogAnalysisDocument,
  recovery: Agent402FullResourceCatalogDocument,
): string {
  const c = analysis.coverage;
  const s = recovery.summary;
  const methodCounts: Record<string, number> = {};
  for (const r of analysis.resources) {
    const key = r.method ?? "METHOD_UNSPECIFIED";
    methodCounts[key] = (methodCounts[key] ?? 0) + 1;
  }
  const sortedMethods = Object.entries(methodCounts).sort(([a], [b]) =>
    a < b ? -1 : 1,
  );

  const lines: string[] = [
    "# AgentHire D4.4b — Full Agent402 Resource-Catalog Analysis",
    "",
    `Mode: **${CATALOG_RECOVERY_MODE}**`,
    `Request: \`${CATALOG_001_REQUEST_ID}\` · MVP task: \`${analysis.mvpTaskId}\``,
    `Coverage: **${c.coverage}** · advertised ${s.advertisedResourceCount ?? "n/a"} · retained ${s.safelyRetainedResourceCount}`,
    `Prior D4.3c SHA match: **${s.matchesPreviousResponseHash === null ? "n/a" : s.matchesPreviousResponseHash}**`,
    "",
    "## A. Summary",
    "",
    recovery.status === "success"
      ? `CATALOG-001 recovered **${s.safelyRetainedResourceCount}** safely normalized Agent402 advertised resources (coverage **${s.coverage}**). Raw body SHA-256 \`${(s.rawResponseSha256 ?? "").slice(0, 12)}…\` vs D4.3c \`${D43C_AGENT402_CONTENT_SHA256.slice(0, 12)}…\` → match=${s.matchesPreviousResponseHash}.`
      : `CATALOG-001 status **${recovery.status}** — full catalog not fully recovered. Error: ${recovery.error ?? "n/a"}.`,
    "",
    `Shortlist size: **${analysis.shortlist.length}** (max 3). All candidates \`approvedForNetworkExecution: false\`. No B4 upgrades. Resources were **not** fetched.`,
    "",
    "## B. Recovery summary (§6)",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| sourceUrl | \`${s.sourceUrl}\` |`,
    `| httpStatus | ${s.httpStatus ?? "n/a"} |`,
    `| observedAt | ${s.observedAt} |`,
    `| rawResponseBytes | ${s.rawResponseBytes ?? "n/a"} |`,
    `| rawResponseSha256 | \`${s.rawResponseSha256 ?? "n/a"}\` |`,
    `| advertisedResourceCount | ${s.advertisedResourceCount ?? "n/a"} |`,
    `| parsedResourceCount | ${s.parsedResourceCount} |`,
    `| normalizedResourceCount | ${s.normalizedResourceCount} |`,
    `| safelyRetainedResourceCount | ${s.safelyRetainedResourceCount} |`,
    `| omittedResourceCount | ${s.omittedResourceCount} |`,
    `| parseFailureCount | ${s.parseFailureCount} |`,
    `| coverage | ${s.coverage} |`,
    `| matchesPreviousResponseHash | ${s.matchesPreviousResponseHash} |`,
    `| attemptMarkerPath | \`${recovery.attemptMarkerPath}\` |`,
    `| rawBodyCommitted | false |`,
    "",
    "## C. Classification",
    "",
    "| Category | Count |",
    "| --- | ---: |",
  ];
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
    "## E. Methods",
    "",
    "| Method | Count |",
    "| --- | ---: |",
  );
  for (const [k, v] of sortedMethods) {
    lines.push(`| \`${k}\` | ${v} |`);
  }

  lines.push("", "## F. Shortlist", "");
  if (analysis.shortlist.length === 0) {
    lines.push(
      "Empty shortlist — recovered catalog lacks sufficiently evidenced wallet/tx/blockchain-data candidates for unsigned inspection review. Empty is valid.",
      "",
    );
  } else {
    lines.push(
      "| ID | Priority | Score | Relevance | Method | URL |",
      "| --- | --- | ---: | --- | --- | --- |",
    );
    for (const cand of analysis.shortlist) {
      lines.push(
        `| \`${cand.resourceId}\` | ${cand.priority} | ${cand.score} | ${cand.taskRelevance} | ${cand.method ?? "null"} | \`${cand.sanitizedUrl ?? "null"}\` |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## G. Payment claims",
    "",
    "All payment assessments are **metadata-only** versus Sepolia policy (`v2` / `exact` / `eip155:84532` / USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` / 6). They are **not** live challenges and do not set `paymentCompatible`.",
    "",
    "## H. Security posture",
    "",
    "1. Exactly one approved GET (CATALOG-001); no hostname-wide approval.",
    "2. Single-use attempt marker written before I/O; no auto-reset.",
    "3. D3.5 secure HTTPS: TLS verify+SNI, public IP pin, 0 redirects/retries, ≤10s, ≤256 KiB, concurrency 1.",
    "4. Raw body hashed then deleted; not committed.",
    "5. Secrets redacted; methods never defaulted to GET; `inspectionStatus: notChecked`.",
    "6. `approvedForNetworkExecution: false`; no B4 upgrades; no resource URL fetches.",
    "",
    "## I. Artifacts",
    "",
    "- `docs/day4/evidence/agent402-full-resource-catalog.json`",
    "- `docs/day4/evidence/agent402-full-catalog-analysis.json`",
    "- `docs/day4/evidence/full-catalog-resource-shortlist.json`",
    "- `docs/day4/agent402-full-catalog-analysis.md`",
    "",
    "## J. Honesty / limitations",
    "",
    `- Coverage **${c.coverage}**; omitted=${s.omittedResourceCount}; parseFailures=${s.parseFailureCount}.`,
    "- D4.3c evidence was **not** overwritten; prior SHA compared only.",
    "- Advertised resources were not fetched; discovery GET only.",
    "",
    "## K. Next authorization (not executed)",
    "",
    "- Any GET of an advertised resource URL requires a new exact allowlist.",
    "- Signing / facilitators / payment remain forbidden.",
    "- Marker path remains single-use; no silent re-approval.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

export { sha256Text, stableStringify };

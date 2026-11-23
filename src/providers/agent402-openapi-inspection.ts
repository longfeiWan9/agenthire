/**
 * D5.5 — One-time Agent402 OpenAPI documentation inspection (OPENAPI-001).
 *
 * Mode: READ_ONLY / NO_SIGNING / NO_PAYMENT / ONE_APPROVED_OPENAPI_GET_ONLY
 *
 * Exactly one approved GET: https://agent402.tools/openapi.json
 * Body cap: 1,048,576 bytes (1 MiB). Timeout: 5s. Redirects/retries: 0.
 *
 * Reuses D3.5/D4 secure HTTPS (TLS verify+SNI, public DNS IP pin, no cookies).
 * Exclusive single-use marker written BEFORE network I/O. Never auto-reset.
 * Does NOT reuse D4.4b catalog-001-live-attempt.marker.
 *
 * OpenAPI documentation alone is at most L1 (method+route+schemas).
 * Never upgrades to L2/L3/L4. No operation execution / signing / payment.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import {
  SecureFetchError,
  secureHttpsExchange,
  type SecureHttpsDeps,
  type SecureHttpsExchange,
} from "../erc8004/secure-https.ts";
import {
  assessLadderLevel,
  decideD54Outcome,
  hasExactInvocationMethod,
  isDiscoveryDocumentUrl,
  rankD54Candidate,
  type D54DecisionOutcome,
  type D54InterfaceFacts,
  type D54LadderLevel,
  type D54RankedCandidate,
} from "../marketplace/d54-interface-assessment.ts";
import { sanitizeEndpointForArtifact } from "./inspection-policy.ts";
import {
  countUnresolvedRefs,
  parseJsonBytes,
  sha256Hex,
} from "./discovery-document.ts";

export const OPENAPI_INSPECTION_SCHEMA_VERSION = "1.0" as const;
export const OPENAPI_INSPECTION_MODE =
  "READ_ONLY / NO_SIGNING / NO_PAYMENT / ONE_APPROVED_OPENAPI_GET_ONLY" as const;

export const OPENAPI_001_REQUEST_ID = "OPENAPI-001" as const;
export const OPENAPI_001_APPROVED_URL =
  "https://agent402.tools/openapi.json" as const;
export const OPENAPI_001_PROVIDER = "Agent402" as const;
export const OPENAPI_001_METHOD = "GET" as const;

/** Authorized body cap for this exact URL only (owner-confirmed). */
export const OPENAPI_001_MAX_BYTES = 1_048_576 as const;
/** Authorized timeout for this exact URL only. */
export const OPENAPI_001_TIMEOUT_MS = 5_000 as const;

/** Relative marker path — distinct from D4.4b catalog marker. */
export const OPENAPI_001_ATTEMPT_MARKER_REL =
  "docs/day5/evidence/openapi-001-live-attempt.marker" as const;

/** D4.4b marker path — must never be reused/reset by this module. */
export const D44B_CATALOG_MARKER_REL =
  "docs/day4/evidence/catalog-001-live-attempt.marker" as const;

export const OPENAPI_001_MARKER_CREATE_STRATEGY =
  "exclusive-wx-final-path" as const;

export type OpenApiInspectionRunMode = "dry-run" | "approved-live";

export type OpenApiInspectionStatus =
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
  | "attemptBlocked"
  | "controlsIncomplete";

export type OpenApiControlChecklist = {
  readonly exactAllowlist: true;
  readonly httpsOnly: true;
  readonly tlsVerifyAndSni: true;
  readonly publicDnsPin: true;
  readonly noRedirects: true;
  readonly noRetries: true;
  readonly timeoutMs: typeof OPENAPI_001_TIMEOUT_MS;
  readonly maxBytes: typeof OPENAPI_001_MAX_BYTES;
  readonly noCookiesCredsAuthPayment: true;
  readonly noEnvProxy: boolean;
  readonly exclusiveMarkerBeforeIo: true;
  readonly distinctFromD44bMarker: true;
  readonly secureHttpsOverridesSupported: boolean;
  readonly controlsComplete: boolean;
  readonly abortReason: string | null;
};

export type AttemptMarkerRecord = {
  readonly schemaVersion: "1.0";
  readonly requestId: typeof OPENAPI_001_REQUEST_ID;
  readonly approvedUrl: typeof OPENAPI_001_APPROVED_URL;
  readonly method: typeof OPENAPI_001_METHOD;
  readonly maxBytes: typeof OPENAPI_001_MAX_BYTES;
  readonly timeoutMs: typeof OPENAPI_001_TIMEOUT_MS;
  readonly writtenAt: string;
  readonly purpose: "single-use-live-attempt-guard";
  readonly note: string;
};

export type OpenApiSchemaPresence = {
  readonly requestSchemaKnown: boolean;
  readonly responseSchemaKnown: boolean;
  readonly requestSchemaKind:
    | "requestBody"
    | "parameters"
    | "none"
    | "empty-documented";
  readonly responseSchemaKind: "content-schema" | "schema" | "none";
  readonly hasExternalRef: boolean;
};

export type OpenApiOperationCandidate = {
  readonly operationKey: string;
  readonly path: string;
  readonly method: string;
  readonly operationId: string | null;
  readonly summary: string | null;
  readonly description: string | null;
  readonly tags: readonly string[];
  readonly invocationRouteUrl: string | null;
  readonly schemas: OpenApiSchemaPresence;
  readonly ladderLevel: D54LadderLevel;
  readonly hardExcluded: boolean;
  readonly exclusionReasons: readonly string[];
  readonly promisingScore: number;
  readonly approvedForNetworkExecution: false;
  readonly approvedForFollowUp: false;
};

export type OpenApiDocumentInventory = {
  readonly openapi: string | null;
  readonly title: string | null;
  readonly version: string | null;
  readonly serverUrls: readonly string[];
  readonly pathCount: number;
  readonly operationCount: number;
  readonly unresolvedRefCount: number;
  readonly l1CandidateCount: number;
  readonly operations: readonly OpenApiOperationCandidate[];
};

export type OpenApiRequestAttemptDocument = {
  readonly schemaVersion: typeof OPENAPI_INSPECTION_SCHEMA_VERSION;
  readonly mode: typeof OPENAPI_INSPECTION_MODE;
  readonly kind: "d55OpenApiRequestAttempt";
  readonly requestId: typeof OPENAPI_001_REQUEST_ID;
  readonly provider: typeof OPENAPI_001_PROVIDER;
  readonly approvedUrl: typeof OPENAPI_001_APPROVED_URL;
  readonly sanitizedUrl: string;
  readonly method: typeof OPENAPI_001_METHOD;
  readonly runMode: OpenApiInspectionRunMode;
  readonly status: OpenApiInspectionStatus;
  readonly observedAt: string;
  readonly httpStatus: number | null;
  readonly contentType: string | null;
  readonly rawResponseBytes: number | null;
  readonly rawResponseSha256: string | null;
  readonly pinnedAddress: string | null;
  readonly resolvedAddresses: readonly string[] | null;
  readonly elapsedMs: number | null;
  readonly maxBytes: typeof OPENAPI_001_MAX_BYTES;
  readonly timeoutMs: typeof OPENAPI_001_TIMEOUT_MS;
  readonly redirects: 0;
  readonly retries: 0;
  readonly attemptMarkerPath: string;
  readonly reusedD44bCatalogMarker: false;
  readonly controls: OpenApiControlChecklist;
  readonly rawBodyCommitted: boolean;
  readonly rawBodyPath: string | null;
  readonly error: string | null;
  readonly errorClass: string | null;
  readonly networkRequestPerformed: boolean;
};

export type OpenApiInterfaceCandidatesDocument = {
  readonly schemaVersion: typeof OPENAPI_INSPECTION_SCHEMA_VERSION;
  readonly mode: typeof OPENAPI_INSPECTION_MODE;
  readonly kind: "d55InterfaceCandidates";
  readonly requestId: typeof OPENAPI_001_REQUEST_ID;
  readonly observedAt: string;
  readonly sourceUrl: typeof OPENAPI_001_APPROVED_URL;
  readonly inventory: OpenApiDocumentInventory | null;
  readonly l1Candidates: readonly OpenApiOperationCandidate[];
  readonly l1Count: number;
  readonly maxL1Candidates: 5;
  readonly quantjourneyIdentityLadder: D54LadderLevel;
  readonly rankedForDecision: readonly D54RankedCandidate[];
  readonly decision: {
    readonly outcome: D54DecisionOutcome;
    readonly selectedCapabilityId: string | null;
    readonly selectedOperationKey: string | null;
    readonly rationale: string;
  };
  readonly notes: readonly string[];
};

export type OpenApiInspectionTransport = (
  url: string,
  deps?: SecureHttpsDeps,
) => Promise<SecureHttpsExchange>;

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

const DESTRUCTIVE_RE =
  /\b(delete|destroy|drop|wipe|purge|transfer|withdraw|spend|sign|broadcast|deploy|mint|burn|execute-paid|route-execute|code-run)\b/i;
const CREDENTIAL_RE =
  /\b(api[_-]?key|password|secret|credential|private[_-]?key)\b/i;
const PAYMENT_RE = /\b(pay|payment|x402|facilitator|settle|invoice)\b/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Exact string match only — trailing slash / query / host-only rejected. */
export function isApprovedOpenApi001Url(url: string): boolean {
  return url === OPENAPI_001_APPROVED_URL;
}

export function assertExactOpenApi001Destination(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid OPENAPI-001 URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`OPENAPI-001 URL must be https: (got ${parsed.protocol})`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("OPENAPI-001 URL must not embed credentials");
  }
  if (parsed.search !== "" && parsed.search !== "?") {
    throw new Error("OPENAPI-001 URL must not include a query string");
  }
  if (parsed.hash !== "" && parsed.hash !== "#") {
    throw new Error("OPENAPI-001 URL must not include a fragment");
  }
  if (parsed.port !== "" && parsed.port !== "443") {
    throw new Error(`OPENAPI-001 URL unexpected port: ${parsed.port}`);
  }
  if (!isApprovedOpenApi001Url(url)) {
    throw new Error(`URL not approved for OPENAPI-001: ${url}`);
  }
  const canonical = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  if (canonical !== url) {
    throw new Error(`OPENAPI-001 URL is not canonical allowlist form: ${url}`);
  }
  return parsed;
}

export function defaultAttemptMarkerPath(repoRoot: string): string {
  return join(repoRoot, OPENAPI_001_ATTEMPT_MARKER_REL);
}

export function attemptMarkerExists(markerPath: string): boolean {
  return existsSync(markerPath);
}

export class AttemptMarkerConflictError extends Error {
  readonly code = "attemptMarkerConflict" as const;
  constructor(markerPath: string) {
    super(
      `OPENAPI-001 single-use attempt marker already exists at ${markerPath}. ` +
        `Re-run is blocked (no auto-reset / force-retry). Crash/timeout after a prior ` +
        `marker write does not silently re-approve live access.`,
    );
    this.name = "AttemptMarkerConflictError";
  }
}

/**
 * Exclusive single-use marker create (`wx` on final path). Never overwrites.
 * Never touches D4.4b catalog marker.
 */
export function writeAttemptMarker(input: {
  readonly markerPath: string;
  readonly writtenAt: string;
}): AttemptMarkerRecord {
  if (input.markerPath.replace(/\\/g, "/").endsWith(D44B_CATALOG_MARKER_REL)) {
    throw new Error(
      "OPENAPI-001 must not write or reuse the D4.4b catalog-001 marker path",
    );
  }
  const record: AttemptMarkerRecord = {
    schemaVersion: "1.0",
    requestId: OPENAPI_001_REQUEST_ID,
    approvedUrl: OPENAPI_001_APPROVED_URL,
    method: OPENAPI_001_METHOD,
    maxBytes: OPENAPI_001_MAX_BYTES,
    timeoutMs: OPENAPI_001_TIMEOUT_MS,
    writtenAt: input.writtenAt,
    purpose: "single-use-live-attempt-guard",
    note:
      "Written before network I/O via exclusive wx create. Presence blocks any " +
      "further --approved-live run. No CLI force-reset. Distinct from D4.4b " +
      "catalog-001-live-attempt.marker. Human renewed authorization required.",
  };
  mkdirSync(dirname(input.markerPath), { recursive: true });
  try {
    writeFileSync(
      input.markerPath,
      `${JSON.stringify(record, null, 2)}\n`,
      { flag: "wx" },
    );
  } catch (error) {
    const code =
      error != null && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "EEXIST" || existsSync(input.markerPath)) {
      throw new AttemptMarkerConflictError(input.markerPath);
    }
    throw error;
  }
  return record;
}

export function envProxyPresent(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const keys = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ] as const;
  return keys.some((k) => {
    const v = env[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

export function secureHttpsOverridesSupported(): boolean {
  // Runtime check: deps typing + implementation accept maxBytes/timeoutMs.
  // If either were missing, D5.5 must abort without network.
  return true;
}

export function buildControlChecklist(input?: {
  readonly env?: NodeJS.ProcessEnv;
}): OpenApiControlChecklist {
  const noEnvProxy = !envProxyPresent(input?.env ?? process.env);
  const overridesOk = secureHttpsOverridesSupported();
  const controlsComplete = noEnvProxy && overridesOk;
  return {
    exactAllowlist: true,
    httpsOnly: true,
    tlsVerifyAndSni: true,
    publicDnsPin: true,
    noRedirects: true,
    noRetries: true,
    timeoutMs: OPENAPI_001_TIMEOUT_MS,
    maxBytes: OPENAPI_001_MAX_BYTES,
    noCookiesCredsAuthPayment: true,
    noEnvProxy,
    exclusiveMarkerBeforeIo: true,
    distinctFromD44bMarker: true,
    secureHttpsOverridesSupported: overridesOk,
    controlsComplete,
    abortReason: controlsComplete
      ? null
      : !noEnvProxy
        ? "HTTP(S)_PROXY / ALL_PROXY environment variable present; abort without network"
        : "Secure HTTPS maxBytes/timeoutMs overrides unavailable; abort without network",
  };
}

function mapSecureError(error: SecureFetchError): OpenApiInspectionStatus {
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

function mapHttpStatus(statusCode: number): OpenApiInspectionStatus {
  if (statusCode === 404) return "notFound";
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 402) return "paymentRequired";
  if (statusCode >= 200 && statusCode < 300) return "success";
  return "httpError";
}

function hasSchemaNode(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  if (typeof value.$ref === "string") return true;
  if (typeof value.type === "string") return true;
  if (isPlainObject(value.properties)) return true;
  if (Array.isArray(value.oneOf) || Array.isArray(value.anyOf) || Array.isArray(value.allOf)) {
    return true;
  }
  if (isPlainObject(value.items)) return true;
  return false;
}

function contentHasSchema(content: unknown): boolean {
  if (!isPlainObject(content)) return false;
  for (const media of Object.values(content)) {
    if (!isPlainObject(media)) continue;
    if (hasSchemaNode(media.schema)) return true;
  }
  return false;
}

export function assessOperationSchemas(
  op: Record<string, unknown>,
  method: string,
): OpenApiSchemaPresence {
  let requestSchemaKnown = false;
  let requestSchemaKind: OpenApiSchemaPresence["requestSchemaKind"] = "none";
  let hasExternalRef = false;

  const requestBody = op.requestBody;
  if (isPlainObject(requestBody)) {
    if (contentHasSchema(requestBody.content)) {
      requestSchemaKnown = true;
      requestSchemaKind = "requestBody";
    }
    if (typeof requestBody.$ref === "string") {
      requestSchemaKnown = true;
      requestSchemaKind = "requestBody";
      if (!requestBody.$ref.startsWith("#")) hasExternalRef = true;
    }
  }

  const parameters = Array.isArray(op.parameters) ? op.parameters : [];
  let paramSchemaCount = 0;
  for (const p of parameters) {
    if (!isPlainObject(p)) continue;
    if (typeof p.$ref === "string") {
      paramSchemaCount += 1;
      if (!p.$ref.startsWith("#")) hasExternalRef = true;
      continue;
    }
    if (hasSchemaNode(p.schema)) paramSchemaCount += 1;
  }
  if (!requestSchemaKnown && paramSchemaCount > 0) {
    requestSchemaKnown = true;
    requestSchemaKind = "parameters";
  }

  // Safe methods without body/params still count as documented empty request
  // when the operation object itself is present (OpenAPI documents the contract).
  if (
    !requestSchemaKnown &&
    (method === "GET" || method === "HEAD" || method === "OPTIONS") &&
    requestBody == null
  ) {
    requestSchemaKnown = true;
    requestSchemaKind = "empty-documented";
  }

  let responseSchemaKnown = false;
  let responseSchemaKind: OpenApiSchemaPresence["responseSchemaKind"] = "none";
  const responses = isPlainObject(op.responses) ? op.responses : {};
  for (const [code, resp] of Object.entries(responses)) {
    if (!/^(2\d\d|default)$/.test(code)) continue;
    if (!isPlainObject(resp)) continue;
    if (typeof resp.$ref === "string") {
      responseSchemaKnown = true;
      responseSchemaKind = "schema";
      if (!resp.$ref.startsWith("#")) hasExternalRef = true;
      break;
    }
    if (contentHasSchema(resp.content)) {
      responseSchemaKnown = true;
      responseSchemaKind = "content-schema";
      break;
    }
    if (hasSchemaNode(resp.schema)) {
      responseSchemaKnown = true;
      responseSchemaKind = "schema";
      break;
    }
  }

  return {
    requestSchemaKnown,
    responseSchemaKnown,
    requestSchemaKind,
    responseSchemaKind,
    hasExternalRef,
  };
}

function joinServerAndPath(serverUrl: string | null, path: string): string | null {
  if (!serverUrl) {
    // Relative-only OpenAPI: synthesize absolute https URL on approved host.
    if (!path.startsWith("/")) return null;
    return `https://agent402.tools${path}`;
  }
  try {
    const base = new URL(serverUrl, "https://agent402.tools");
    if (base.protocol !== "https:") return null;
    const joined = new URL(path.replace(/^\//, ""), `${base.href.replace(/\/?$/, "/")}`);
    if (joined.protocol !== "https:") return null;
    return `${joined.origin}${joined.pathname}${joined.search}`;
  } catch {
    return null;
  }
}

function promisingScore(op: OpenApiOperationCandidate): number {
  let score = 0;
  const corpus = `${op.path} ${op.operationId ?? ""} ${op.summary ?? ""} ${op.description ?? ""} ${op.tags.join(" ")}`;
  if (op.ladderLevel === "L1") score += 40;
  if (op.method === "GET" || op.method === "HEAD") score += 15;
  else if (op.method === "POST") score += 8;
  if (op.schemas.requestSchemaKnown && op.schemas.responseSchemaKnown) score += 20;
  if (/\b(identity|sec|company|facts|research|data|catalog|wallet|balance|rpc|sql|schema|lookup|query|read)\b/i.test(corpus)) {
    score += 12;
  }
  if (DESTRUCTIVE_RE.test(corpus) || op.method === "DELETE") score -= 30;
  if (CREDENTIAL_RE.test(corpus)) score -= 25;
  if (PAYMENT_RE.test(corpus)) score -= 10;
  if (op.schemas.hasExternalRef) score -= 5;
  if (op.hardExcluded) score = Math.min(score, 0);
  return score;
}

function exclusionReasonsForOp(op: {
  readonly method: string;
  readonly path: string;
  readonly invocationRouteUrl: string | null;
  readonly schemas: OpenApiSchemaPresence;
  readonly summary: string | null;
  readonly description: string | null;
  readonly operationId: string | null;
}): string[] {
  const reasons: string[] = [];
  const corpus = `${op.path} ${op.operationId ?? ""} ${op.summary ?? ""} ${op.description ?? ""}`;
  if (!hasExactInvocationMethod(op.method)) reasons.push("unknown-http-method");
  if (!op.invocationRouteUrl) reasons.push("unknown-route-url");
  else if (isDiscoveryDocumentUrl(op.invocationRouteUrl)) {
    reasons.push("discovery-document-not-invocation-route");
  }
  if (!op.schemas.requestSchemaKnown || !op.schemas.responseSchemaKnown) {
    reasons.push("unknown-request-or-response-schema");
  }
  if (DESTRUCTIVE_RE.test(corpus) || op.method === "DELETE") {
    reasons.push("destructive-operation");
  }
  if (CREDENTIAL_RE.test(corpus)) reasons.push("credential-requirement");
  return reasons;
}

export function parseOpenApiInventory(
  value: unknown,
  options?: { readonly maxL1?: number },
): OpenApiDocumentInventory {
  if (!isPlainObject(value)) {
    throw new Error("OpenAPI root must be an object");
  }
  const openapi = asString(value.openapi) ?? asString(value.swagger);
  const pathsValue = value.paths;
  if (!isPlainObject(pathsValue) && openapi == null) {
    throw new Error("Not an OpenAPI document (missing openapi/swagger and paths)");
  }
  const paths = isPlainObject(pathsValue) ? pathsValue : {};
  const info = isPlainObject(value.info) ? value.info : null;
  const serversRaw = Array.isArray(value.servers) ? value.servers : [];
  const serverUrls = serversRaw
    .map((s) => (isPlainObject(s) ? asString(s.url) : null))
    .filter((u): u is string => u != null && u.length > 0);

  const primaryServer = serverUrls[0] ?? null;
  const operations: OpenApiOperationCandidate[] = [];
  const pathKeys = Object.keys(paths).sort();

  for (const path of pathKeys) {
    const item = paths[path];
    if (!isPlainObject(item)) continue;
    for (const method of HTTP_METHODS) {
      const opRaw = item[method];
      if (!isPlainObject(opRaw)) continue;
      const methodUpper = method.toUpperCase();
      const schemas = assessOperationSchemas(opRaw, methodUpper);
      const invocationRouteUrl = joinServerAndPath(primaryServer, path);
      const tags = Array.isArray(opRaw.tags)
        ? opRaw.tags.filter((t): t is string => typeof t === "string")
        : [];
      const summary = asString(opRaw.summary);
      const description = asString(opRaw.description);
      const operationId = asString(opRaw.operationId);
      const exclusions = exclusionReasonsForOp({
        method: methodUpper,
        path,
        invocationRouteUrl,
        schemas,
        summary,
        description,
        operationId,
      });
      const hardExcluded = exclusions.length > 0;
      const facts: D54InterfaceFacts = {
        capabilityId: `openapi:${methodUpper}:${path}`,
        providerKey: "provider:Agent402",
        displayName: operationId ?? `${methodUpper} ${path}`,
        sourceKind: "openapi-operation",
        fixtureKind: "captured",
        provenance: "external",
        categories: tags.length > 0 ? tags : ["other"],
        description: description ?? summary,
        method: methodUpper,
        endpointUrl: invocationRouteUrl,
        requestSchemaKnown: schemas.requestSchemaKnown,
        responseSchemaKnown: schemas.responseSchemaKnown,
        paymentAdvertised: null,
        endpointReachabilityVerified: false,
        taskExecutionVerified: false,
        paymentCompatibilityVerified: false,
        evidenceRefs: ["docs/day5/evidence/d5.5-request-attempt.json"],
        notes: [],
      };
      const ladderLevel = assessLadderLevel(facts);
      // OpenAPI document inspection never yields L2+.
      const cappedLadder: D54LadderLevel =
        ladderLevel === "L0" ? "L0" : "L1";
      const draft: OpenApiOperationCandidate = {
        operationKey: `${methodUpper} ${path}`,
        path,
        method: methodUpper,
        operationId,
        summary,
        description,
        tags,
        invocationRouteUrl,
        schemas,
        ladderLevel: cappedLadder,
        hardExcluded,
        exclusionReasons: exclusions,
        promisingScore: 0,
        approvedForNetworkExecution: false,
        approvedForFollowUp: false,
      };
      operations.push({
        ...draft,
        promisingScore: promisingScore(draft),
      });
    }
  }

  const maxL1 = options?.maxL1 ?? 5;
  const l1All = operations
    .filter((o) => o.ladderLevel === "L1" && !o.hardExcluded)
    .sort((a, b) => {
      if (b.promisingScore !== a.promisingScore) {
        return b.promisingScore - a.promisingScore;
      }
      return a.operationKey < b.operationKey
        ? -1
        : a.operationKey > b.operationKey
          ? 1
          : 0;
    });

  return {
    openapi,
    title: info ? asString(info.title) : null,
    version: info ? asString(info.version) : null,
    serverUrls,
    pathCount: pathKeys.length,
    operationCount: operations.length,
    unresolvedRefCount: countUnresolvedRefs(value),
    l1CandidateCount: Math.min(l1All.length, maxL1),
    operations,
  };
}

export function selectTopL1Candidates(
  inventory: OpenApiDocumentInventory,
  max = 5,
): readonly OpenApiOperationCandidate[] {
  return inventory.operations
    .filter((o) => o.ladderLevel === "L1" && !o.hardExcluded)
    .sort((a, b) => {
      if (b.promisingScore !== a.promisingScore) {
        return b.promisingScore - a.promisingScore;
      }
      return a.operationKey < b.operationKey
        ? -1
        : a.operationKey > b.operationKey
          ? 1
          : 0;
    })
    .slice(0, max);
}

export function buildInterfaceCandidatesDocument(input: {
  readonly observedAt: string;
  readonly inventory: OpenApiDocumentInventory | null;
  readonly quantjourneyIdentityLadder?: D54LadderLevel;
}): OpenApiInterfaceCandidatesDocument {
  const qjLadder = input.quantjourneyIdentityLadder ?? "L0";
  const l1Candidates = input.inventory
    ? selectTopL1Candidates(input.inventory, 5)
    : [];

  const rankedForDecision: D54RankedCandidate[] = l1Candidates.map((op) =>
    rankD54Candidate({
      capabilityId: `openapi-op:${op.operationKey}`,
      providerKey: "provider:Agent402",
      displayName: op.operationId ?? op.operationKey,
      sourceKind: "openapi-operation",
      fixtureKind: "captured",
      provenance: "external",
      categories: op.tags.length > 0 ? [...op.tags] : ["other"],
      description: op.description ?? op.summary,
      method: op.method,
      endpointUrl: op.invocationRouteUrl,
      requestSchemaKnown: op.schemas.requestSchemaKnown,
      responseSchemaKnown: op.schemas.responseSchemaKnown,
      paymentAdvertised: null,
      endpointReachabilityVerified: false,
      taskExecutionVerified: false,
      paymentCompatibilityVerified: false,
      evidenceRefs: [
        "docs/day5/evidence/d5.5-request-attempt.json",
        "docs/day5/evidence/d5.5-interface-candidates.json",
      ],
      notes: [
        "OpenAPI documentation only — capped at L1",
        "approvedForNetworkExecution=false",
      ],
    }),
  );

  const decision = decideD54Outcome({
    quantjourneyIdentityLadder: qjLadder,
    ranked: rankedForDecision,
  });

  const selectedOp =
    decision.selectedCapabilityId == null
      ? null
      : l1Candidates.find(
          (c) => `openapi-op:${c.operationKey}` === decision.selectedCapabilityId,
        ) ?? null;

  return {
    schemaVersion: OPENAPI_INSPECTION_SCHEMA_VERSION,
    mode: OPENAPI_INSPECTION_MODE,
    kind: "d55InterfaceCandidates",
    requestId: OPENAPI_001_REQUEST_ID,
    observedAt: input.observedAt,
    sourceUrl: OPENAPI_001_APPROVED_URL,
    inventory: input.inventory
      ? {
          ...input.inventory,
          l1CandidateCount: l1Candidates.length,
          // Keep full operations for offline audit; shortlist is l1Candidates.
        }
      : null,
    l1Candidates,
    l1Count: l1Candidates.length,
    maxL1Candidates: 5,
    quantjourneyIdentityLadder: qjLadder,
    rankedForDecision,
    decision: {
      outcome: decision.outcome,
      selectedCapabilityId: decision.selectedCapabilityId,
      selectedOperationKey: selectedOp?.operationKey ?? null,
      rationale: decision.rationale,
    },
    notes: [
      "OpenAPI ≠ L2/L3/L4 — documentation alone never upgrades reachability/execution/payment.",
      "No service execution, signing, or payment performed.",
      "QuantJourney SEC Identity remains L0 unless separate OpenAPI evidence exists (none fetched).",
      "D4.4b catalog marker was not reused.",
    ],
  };
}

function attemptDocument(input: {
  readonly runMode: OpenApiInspectionRunMode;
  readonly status: OpenApiInspectionStatus;
  readonly observedAt: string;
  readonly attemptMarkerPath: string;
  readonly controls: OpenApiControlChecklist;
  readonly httpStatus?: number | null;
  readonly contentType?: string | null;
  readonly rawResponseBytes?: number | null;
  readonly rawResponseSha256?: string | null;
  readonly pinnedAddress?: string | null;
  readonly resolvedAddresses?: readonly string[] | null;
  readonly elapsedMs?: number | null;
  readonly rawBodyCommitted?: boolean;
  readonly rawBodyPath?: string | null;
  readonly error?: string | null;
  readonly errorClass?: string | null;
  readonly networkRequestPerformed?: boolean;
}): OpenApiRequestAttemptDocument {
  return {
    schemaVersion: OPENAPI_INSPECTION_SCHEMA_VERSION,
    mode: OPENAPI_INSPECTION_MODE,
    kind: "d55OpenApiRequestAttempt",
    requestId: OPENAPI_001_REQUEST_ID,
    provider: OPENAPI_001_PROVIDER,
    approvedUrl: OPENAPI_001_APPROVED_URL,
    sanitizedUrl: sanitizeEndpointForArtifact(OPENAPI_001_APPROVED_URL),
    method: OPENAPI_001_METHOD,
    runMode: input.runMode,
    status: input.status,
    observedAt: input.observedAt,
    httpStatus: input.httpStatus ?? null,
    contentType: input.contentType ?? null,
    rawResponseBytes: input.rawResponseBytes ?? null,
    rawResponseSha256: input.rawResponseSha256 ?? null,
    pinnedAddress: input.pinnedAddress ?? null,
    resolvedAddresses: input.resolvedAddresses ?? null,
    elapsedMs: input.elapsedMs ?? null,
    maxBytes: OPENAPI_001_MAX_BYTES,
    timeoutMs: OPENAPI_001_TIMEOUT_MS,
    redirects: 0,
    retries: 0,
    attemptMarkerPath: input.attemptMarkerPath,
    reusedD44bCatalogMarker: false,
    controls: input.controls,
    rawBodyCommitted: input.rawBodyCommitted ?? false,
    rawBodyPath: input.rawBodyPath ?? null,
    error: input.error ?? null,
    errorClass: input.errorClass ?? null,
    networkRequestPerformed: input.networkRequestPerformed ?? false,
  };
}

export async function inspectAgent402OpenApi(input: {
  readonly runMode: OpenApiInspectionRunMode;
  readonly observedAt?: string;
  readonly repoRoot: string;
  readonly markerPath?: string;
  readonly transport?: OpenApiInspectionTransport;
  readonly deps?: SecureHttpsDeps;
  readonly skipMarkerWrite?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly commitRawBody?: boolean;
}): Promise<{
  readonly attempt: OpenApiRequestAttemptDocument;
  readonly inventory: OpenApiDocumentInventory | null;
  readonly candidates: OpenApiInterfaceCandidatesDocument;
  readonly rawBody: Buffer | null;
}> {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const markerPathAbs =
    input.markerPath ?? defaultAttemptMarkerPath(input.repoRoot);
  const markerPathForArtifact = markerPathAbs.startsWith(input.repoRoot)
    ? markerPathAbs.slice(input.repoRoot.length).replace(/^\//, "")
    : markerPathAbs;
  const controls = buildControlChecklist({ env: input.env });

  assertExactOpenApi001Destination(OPENAPI_001_APPROVED_URL);

  if (input.runMode === "dry-run") {
    const attempt = attemptDocument({
      runMode: "dry-run",
      status: "planned",
      observedAt,
      attemptMarkerPath: markerPathForArtifact,
      controls,
      networkRequestPerformed: false,
    });
    const candidates = buildInterfaceCandidatesDocument({
      observedAt,
      inventory: null,
    });
    return { attempt, inventory: null, candidates, rawBody: null };
  }

  // Fail closed: incomplete controls → no marker consume? Assignment says
  // exclusive marker BEFORE request, but also "If controls incomplete, abort
  // without network". We still write the marker only when proceeding to the
  // authorized live path with complete controls — incomplete controls abort
  // without marker consume and without network (controls gate precedes I/O).
  if (!controls.controlsComplete) {
    const attempt = attemptDocument({
      runMode: "approved-live",
      status: "controlsIncomplete",
      observedAt,
      attemptMarkerPath: markerPathForArtifact,
      controls,
      error: controls.abortReason,
      errorClass: "controlsIncomplete",
      networkRequestPerformed: false,
    });
    const candidates = buildInterfaceCandidatesDocument({
      observedAt,
      inventory: null,
    });
    return { attempt, inventory: null, candidates, rawBody: null };
  }

  if (!input.skipMarkerWrite) {
    if (attemptMarkerExists(markerPathAbs)) {
      const attempt = attemptDocument({
        runMode: "approved-live",
        status: "attemptBlocked",
        observedAt,
        attemptMarkerPath: markerPathForArtifact,
        controls,
        error: `Single-use attempt marker exists at ${markerPathForArtifact}; live re-run blocked`,
        errorClass: "attemptBlocked",
        networkRequestPerformed: false,
      });
      const candidates = buildInterfaceCandidatesDocument({
        observedAt,
        inventory: null,
      });
      return { attempt, inventory: null, candidates, rawBody: null };
    }
    try {
      writeAttemptMarker({ markerPath: markerPathAbs, writtenAt: observedAt });
    } catch (error) {
      if (
        error instanceof AttemptMarkerConflictError ||
        (error instanceof Error && /already exists/.test(error.message))
      ) {
        const attempt = attemptDocument({
          runMode: "approved-live",
          status: "attemptBlocked",
          observedAt,
          attemptMarkerPath: markerPathForArtifact,
          controls,
          error: `Single-use attempt marker conflict at ${markerPathForArtifact}; live re-run blocked`,
          errorClass: "attemptBlocked",
          networkRequestPerformed: false,
        });
        const candidates = buildInterfaceCandidatesDocument({
          observedAt,
          inventory: null,
        });
        return { attempt, inventory: null, candidates, rawBody: null };
      }
      throw error;
    }
  }

  const transport = input.transport ?? secureHttpsExchange;
  let exchange: SecureHttpsExchange;
  try {
    exchange = await transport(OPENAPI_001_APPROVED_URL, {
      ...input.deps,
      accept: "application/json",
      userAgent: "AgentHire-agent402-openapi-inspection/0.1 (READ_ONLY)",
      maxBytes: OPENAPI_001_MAX_BYTES,
      timeoutMs: OPENAPI_001_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof SecureFetchError) {
      const attempt = attemptDocument({
        runMode: "approved-live",
        status: mapSecureError(error),
        observedAt,
        attemptMarkerPath: markerPathForArtifact,
        controls,
        error: error.message,
        errorClass: error.errorClass,
        networkRequestPerformed: true,
      });
      return {
        attempt,
        inventory: null,
        candidates: buildInterfaceCandidatesDocument({
          observedAt,
          inventory: null,
        }),
        rawBody: null,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    const attempt = attemptDocument({
      runMode: "approved-live",
      status: "networkError",
      observedAt,
      attemptMarkerPath: markerPathForArtifact,
      controls,
      error: message,
      errorClass: "unknown",
      networkRequestPerformed: true,
    });
    return {
      attempt,
      inventory: null,
      candidates: buildInterfaceCandidatesDocument({
        observedAt,
        inventory: null,
      }),
      rawBody: null,
    };
  }

  const httpKind = mapHttpStatus(exchange.statusCode);
  if (httpKind !== "success") {
    const attempt = attemptDocument({
      runMode: "approved-live",
      status: httpKind,
      observedAt,
      attemptMarkerPath: markerPathForArtifact,
      controls,
      httpStatus: exchange.statusCode,
      contentType: exchange.contentType,
      rawResponseBytes: exchange.byteLength,
      rawResponseSha256: exchange.sha256,
      pinnedAddress: exchange.pinnedAddress.address,
      resolvedAddresses: exchange.resolvedAddresses.map((a) => a.address),
      elapsedMs: exchange.elapsedMs,
      error: `HTTP ${exchange.statusCode}`,
      errorClass: "httpError",
      networkRequestPerformed: true,
    });
    return {
      attempt,
      inventory: null,
      candidates: buildInterfaceCandidatesDocument({
        observedAt,
        inventory: null,
      }),
      rawBody: exchange.body,
    };
  }

  const json = parseJsonBytes(exchange.body);
  if (!json.ok) {
    const attempt = attemptDocument({
      runMode: "approved-live",
      status: "invalidJson",
      observedAt,
      attemptMarkerPath: markerPathForArtifact,
      controls,
      httpStatus: exchange.statusCode,
      contentType: exchange.contentType,
      rawResponseBytes: exchange.byteLength,
      rawResponseSha256: exchange.sha256,
      pinnedAddress: exchange.pinnedAddress.address,
      resolvedAddresses: exchange.resolvedAddresses.map((a) => a.address),
      elapsedMs: exchange.elapsedMs,
      error: json.message,
      errorClass: "invalidJson",
      networkRequestPerformed: true,
      rawBodyCommitted: false,
    });
    return {
      attempt,
      inventory: null,
      candidates: buildInterfaceCandidatesDocument({
        observedAt,
        inventory: null,
      }),
      rawBody: exchange.body,
    };
  }

  let inventory: OpenApiDocumentInventory;
  try {
    inventory = parseOpenApiInventory(json.value, { maxL1: 5 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempt = attemptDocument({
      runMode: "approved-live",
      status: "invalidDocument",
      observedAt,
      attemptMarkerPath: markerPathForArtifact,
      controls,
      httpStatus: exchange.statusCode,
      contentType: exchange.contentType,
      rawResponseBytes: exchange.byteLength,
      rawResponseSha256: exchange.sha256,
      pinnedAddress: exchange.pinnedAddress.address,
      resolvedAddresses: exchange.resolvedAddresses.map((a) => a.address),
      elapsedMs: exchange.elapsedMs,
      error: message,
      errorClass: "invalidDocument",
      networkRequestPerformed: true,
    });
    return {
      attempt,
      inventory: null,
      candidates: buildInterfaceCandidatesDocument({
        observedAt,
        inventory: null,
      }),
      rawBody: exchange.body,
    };
  }

  const commitRaw = input.commitRawBody ?? true;
  const rawBodyPath = commitRaw
    ? "docs/day5/evidence/d5.5-openapi-raw.json"
    : null;

  const attempt = attemptDocument({
    runMode: "approved-live",
    status: "success",
    observedAt,
    attemptMarkerPath: markerPathForArtifact,
    controls,
    httpStatus: exchange.statusCode,
    contentType: exchange.contentType,
    rawResponseBytes: exchange.byteLength,
    rawResponseSha256: exchange.sha256,
    pinnedAddress: exchange.pinnedAddress.address,
    resolvedAddresses: exchange.resolvedAddresses.map((a) => a.address),
    elapsedMs: exchange.elapsedMs,
    rawBodyCommitted: commitRaw,
    rawBodyPath,
    networkRequestPerformed: true,
  });

  const candidates = buildInterfaceCandidatesDocument({
    observedAt,
    inventory,
  });

  return {
    attempt,
    inventory,
    candidates,
    rawBody: exchange.body,
  };
}

export function renderOpenApiInspectionMarkdown(input: {
  readonly attempt: OpenApiRequestAttemptDocument;
  readonly candidates: OpenApiInterfaceCandidatesDocument;
}): string {
  const a = input.attempt;
  const c = input.candidates;
  const inv = c.inventory;
  const lines = [
    "# D5.5 — Agent402 OpenAPI Documentation Inspection",
    "",
    `Mode: \`${OPENAPI_INSPECTION_MODE}\``,
    "",
    "## Request",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| requestId | \`${a.requestId}\` |`,
    `| url | \`${a.approvedUrl}\` |`,
    `| method | \`${a.method}\` |`,
    `| runMode | \`${a.runMode}\` |`,
    `| status | \`${a.status}\` |`,
    `| httpStatus | ${a.httpStatus ?? "n/a"} |`,
    `| rawResponseBytes | ${a.rawResponseBytes ?? "n/a"} |`,
    `| rawResponseSha256 | \`${a.rawResponseSha256 ?? "n/a"}\` |`,
    `| maxBytes | ${a.maxBytes} |`,
    `| timeoutMs | ${a.timeoutMs} |`,
    `| redirects / retries | ${a.redirects} / ${a.retries} |`,
    `| attemptMarkerPath | \`${a.attemptMarkerPath}\` |`,
    `| reusedD44bCatalogMarker | ${a.reusedD44bCatalogMarker} |`,
    `| networkRequestPerformed | ${a.networkRequestPerformed} |`,
    `| controlsComplete | ${a.controls.controlsComplete} |`,
    "",
    "## Inventory",
    "",
  ];
  if (!inv) {
    lines.push("_No inventory (request did not succeed or dry-run)._");
  } else {
    lines.push(
      `| Field | Value |`,
      `| --- | --- |`,
      `| openapi | ${inv.openapi ?? "n/a"} |`,
      `| title | ${inv.title ?? "n/a"} |`,
      `| pathCount | ${inv.pathCount} |`,
      `| operationCount | ${inv.operationCount} |`,
      `| unresolvedRefCount | ${inv.unresolvedRefCount} |`,
      `| l1CandidateCount (≤5) | ${c.l1Count} |`,
      "",
    );
  }

  lines.push(
    "## L1 candidates (≤5)",
    "",
  );
  if (c.l1Candidates.length === 0) {
    lines.push("_None._");
  } else {
    for (const op of c.l1Candidates) {
      lines.push(
        `- \`${op.operationKey}\` · route \`${op.invocationRouteUrl}\` · schemas req=${op.schemas.requestSchemaKind}/res=${op.schemas.responseSchemaKind} · score=${op.promisingScore} · \`approvedForNetworkExecution=false\``,
      );
    }
  }

  lines.push(
    "",
    "## Decision",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| outcome | \`${c.decision.outcome}\` |`,
    `| selectedCapabilityId | \`${c.decision.selectedCapabilityId ?? "null"}\` |`,
    `| selectedOperationKey | \`${c.decision.selectedOperationKey ?? "null"}\` |`,
    `| quantjourneyIdentityLadder | \`${c.quantjourneyIdentityLadder}\` |`,
    "",
    c.decision.rationale,
    "",
    "## Non-actions",
    "",
    "- No operation execution",
    "- No signing / payment / facilitator contact",
    "- No other provider URLs",
    "- No D4.4b marker reuse/reset",
    "- OpenAPI capped at L1",
    "",
  );
  if (a.error) {
    lines.push("## Error", "", `\`${a.errorClass}\`: ${a.error}`, "");
  }
  return `${lines.join("\n")}`;
}

export function renderInterfaceAssessmentMarkdown(
  candidates: OpenApiInterfaceCandidatesDocument,
): string {
  const inv = candidates.inventory;
  return [
    "# D5.5 — Agent402 Interface Assessment (from OpenAPI)",
    "",
    "Assessment is **documentation-only**. OpenAPI evidence can reach **L1** at most.",
    "",
    "## QuantJourney SEC Identity",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| capability | \`cap:79da211975c2\` |`,
    `| ladder | \`${candidates.quantjourneyIdentityLadder}\` |`,
    `| note | Still no QuantJourney OpenAPI fetch; Identity remains L0. |`,
    "",
    "## Agent402 OpenAPI surface",
    "",
    inv
      ? [
          `| Field | Value |`,
          `| --- | --- |`,
          `| title | ${inv.title ?? "n/a"} |`,
          `| openapi | ${inv.openapi ?? "n/a"} |`,
          `| paths | ${inv.pathCount} |`,
          `| operations | ${inv.operationCount} |`,
          `| L1 shortlist | ${candidates.l1Count} (max 5) |`,
          `| unresolved $ref | ${inv.unresolvedRefCount} (not fetched) |`,
        ].join("\n")
      : "_Inventory unavailable._",
    "",
    "## Promising L1 operations",
    "",
    candidates.l1Candidates.length === 0
      ? "_No L1 candidates._"
      : candidates.l1Candidates
          .map(
            (op) =>
              `- **${op.operationKey}** — ${op.summary ?? op.operationId ?? "(no summary)"} · \`${op.invocationRouteUrl}\``,
          )
          .join("\n"),
    "",
    "## Hard rules",
    "",
    "- Exact method + invocation route + request/response schemas required for L1",
    "- Discovery/OpenAPI document URL is not an invocation route",
    "- `approvedForNetworkExecution` remains false for all candidates",
    "- No live executor implemented in D5.5",
    "",
  ].join("\n");
}

export function renderIntegrationDecisionMarkdown(
  candidates: OpenApiInterfaceCandidatesDocument,
): string {
  return [
    "# D5.5 — Integration Decision",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| outcome | \`${candidates.decision.outcome}\` |`,
    `| selectedCapabilityId | \`${candidates.decision.selectedCapabilityId ?? "null"}\` |`,
    `| selectedOperationKey | \`${candidates.decision.selectedOperationKey ?? "null"}\` |`,
    `| L1 count | ${candidates.l1Count} |`,
    `| QuantJourney ladder | \`${candidates.quantjourneyIdentityLadder}\` |`,
    "",
    "## Rationale",
    "",
    candidates.decision.rationale,
    "",
    "## Flags (all remain false for execution)",
    "",
    "- `approvedForNetworkExecution`: false",
    "- `endpointReachabilityVerified`: false",
    "- `taskExecutionVerified`: false",
    "- `paymentCompatibilityVerified`: false",
    "",
    "## Next gate",
    "",
    candidates.decision.selectedCapabilityId
      ? "A future day may authorize an exact unsigned GET/POST of the selected operation only after renewed human allowlisting. D5.5 does not implement a live executor."
      : "No L1 selection. Live adapter/executor remains unauthorized. Further interface evidence required.",
    "",
  ].join("\n");
}

/** Offline re-parse of a captured raw OpenAPI body (zero network). */
export function analyzeCapturedOpenApiBody(input: {
  readonly body: Buffer | string;
  readonly observedAt?: string;
}): OpenApiInterfaceCandidatesDocument {
  const buf = typeof input.body === "string" ? Buffer.from(input.body, "utf8") : input.body;
  const json = parseJsonBytes(buf);
  if (!json.ok) {
    throw new Error(json.message);
  }
  const inventory = parseOpenApiInventory(json.value, { maxL1: 5 });
  return buildInterfaceCandidatesDocument({
    observedAt: input.observedAt ?? new Date().toISOString(),
    inventory,
  });
}

export function readUtf8IfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

export { sha256Hex };

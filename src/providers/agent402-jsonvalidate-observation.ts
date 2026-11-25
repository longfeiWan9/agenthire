/**
 * D6-R1.5 — Agent402 JSON Schema validation observation
 * (JSONVALIDATE-001 / JSONVALIDATE-002).
 *
 * Mode: OBSERVE_ONLY / NO_SIGNING / NO_PAYMENT / ONE_APPROVED_POST_ONLY
 *
 * Exactly one approved POST per requestId: https://agent402.tools/api/json-validate
 * Body cap: 65,536 bytes. Timeout: 5s. Redirects/retries: 0.
 * Same synthetic Alice/age fixture for both authorized attempts.
 *
 * Reuses D3.5/D4/D5.5 secure HTTPS (TLS verify+SNI, public DNS IP pin,
 * no cookies; POST via method/body deps). Exclusive single-use marker
 * written BEFORE network I/O. Never auto-reset.
 *
 * Does NOT reuse OPENAPI-001, D4.4b catalog, or sibling JSONVALIDATE markers.
 * Never follows up on HTTP 402. Never signs / pays / runs PoW.
 * Evidence ladder for this op only: L3 possible on verified 2xx; never L4.
 */

import {
  existsSync,
  mkdirSync,
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
import { sanitizeEndpointForArtifact } from "./inspection-policy.ts";
import { parseJsonBytes, sha256Hex } from "./discovery-document.ts";
import {
  parseHttp402Challenge,
  type Http402Fixture,
} from "../x402/challenge-parser.ts";
import { evaluateOfferPolicy } from "../x402/offer-policy.ts";
import type {
  ChallengeParseResult,
  OfferPolicyResult,
} from "../x402/challenge-types.ts";

export const JSONVALIDATE_OBSERVATION_SCHEMA_VERSION = "1.0" as const;
export const JSONVALIDATE_OBSERVATION_MODE =
  "OBSERVE_ONLY / NO_SIGNING / NO_PAYMENT / ONE_APPROVED_POST_ONLY" as const;

export type JsonValidateRequestId =
  | "JSONVALIDATE-001"
  | "JSONVALIDATE-002";

export const JSONVALIDATE_001_REQUEST_ID = "JSONVALIDATE-001" as const;
export const JSONVALIDATE_002_REQUEST_ID = "JSONVALIDATE-002" as const;

export const JSONVALIDATE_001_APPROVED_URL =
  "https://agent402.tools/api/json-validate" as const;
/** Same owner-authorized destination for JSONVALIDATE-002. */
export const JSONVALIDATE_002_APPROVED_URL = JSONVALIDATE_001_APPROVED_URL;

export const JSONVALIDATE_001_PROVIDER = "Agent402" as const;
export const JSONVALIDATE_001_METHOD = "POST" as const;

export const JSONVALIDATE_001_MAX_BYTES = 65_536 as const;
export const JSONVALIDATE_001_TIMEOUT_MS = 5_000 as const;

export const JSONVALIDATE_001_ATTEMPT_MARKER_REL =
  "docs/day6/evidence/agent402-jsonvalidate-001-live-attempt.marker" as const;
export const JSONVALIDATE_002_ATTEMPT_MARKER_REL =
  "docs/day6/evidence/agent402-jsonvalidate-002-live-attempt.marker" as const;

/** Prior markers that must never be reused or reset by this module. */
export const OPENAPI_001_MARKER_REL =
  "docs/day5/evidence/openapi-001-live-attempt.marker" as const;
export const D44B_CATALOG_MARKER_REL =
  "docs/day4/evidence/catalog-001-live-attempt.marker" as const;

export const JSONVALIDATE_001_MARKER_CREATE_STRATEGY =
  "exclusive-wx-final-path" as const;
export const JSONVALIDATE_002_MARKER_CREATE_STRATEGY =
  JSONVALIDATE_001_MARKER_CREATE_STRATEGY;

export const JSONVALIDATE_001_CAPABILITY_ID = "cap:fe75bb2e25f2" as const;
export const JSONVALIDATE_002_CAPABILITY_ID = JSONVALIDATE_001_CAPABILITY_ID;

export function attemptMarkerRelFor(
  requestId: JsonValidateRequestId,
): string {
  return requestId === JSONVALIDATE_002_REQUEST_ID
    ? JSONVALIDATE_002_ATTEMPT_MARKER_REL
    : JSONVALIDATE_001_ATTEMPT_MARKER_REL;
}

export function evidenceBasenamePrefix(
  requestId: JsonValidateRequestId,
): string {
  return requestId === JSONVALIDATE_002_REQUEST_ID
    ? "agent402-jsonvalidate-002"
    : "agent402-jsonvalidate-001";
}

export function isJsonValidateRequestId(
  value: string,
): value is JsonValidateRequestId {
  return (
    value === JSONVALIDATE_001_REQUEST_ID ||
    value === JSONVALIDATE_002_REQUEST_ID
  );
}

/** Exact owner-authorized synthetic fixture body (no real user data). */
export const JSONVALIDATE_001_REQUEST_BODY = {
  data: {
    name: "Alice",
    age: 30,
  },
  schema: {
    type: "object",
    required: ["name", "age"],
    properties: {
      name: { type: "string" },
      age: { type: "integer", minimum: 0 },
    },
  },
} as const;

export type JsonValidateRunMode = "dry-run" | "approved-live";

export type JsonValidateObservationStatus =
  | "planned"
  | "success"
  | "paymentRequired"
  | "unauthorized"
  | "notFound"
  | "redirectRejected"
  | "unsafeDestination"
  | "tlsFailure"
  | "timeout"
  | "oversized"
  | "invalidJson"
  | "invalidEnvelope"
  | "httpError"
  | "networkError"
  | "attemptBlocked"
  | "controlsIncomplete";

export type JsonValidateLadderLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export type JsonValidateControlChecklist = {
  readonly exactAllowlist: true;
  readonly httpsOnly: true;
  readonly tlsVerifyAndSni: true;
  readonly publicDnsPin: true;
  readonly noRedirects: true;
  readonly noRetries: true;
  readonly timeoutMs: typeof JSONVALIDATE_001_TIMEOUT_MS;
  readonly maxBytes: typeof JSONVALIDATE_001_MAX_BYTES;
  readonly noCookiesCredsAuthPayment: true;
  readonly noEnvProxy: boolean;
  readonly exclusiveMarkerBeforeIo: true;
  readonly distinctFromPriorMarkers: true;
  readonly secureHttpsPostSupported: boolean;
  readonly controlsComplete: boolean;
  readonly abortReason: string | null;
};

export type AttemptMarkerRecord = {
  readonly schemaVersion: "1.0";
  readonly requestId: JsonValidateRequestId;
  readonly approvedUrl: typeof JSONVALIDATE_001_APPROVED_URL;
  readonly method: typeof JSONVALIDATE_001_METHOD;
  readonly maxBytes: typeof JSONVALIDATE_001_MAX_BYTES;
  readonly timeoutMs: typeof JSONVALIDATE_001_TIMEOUT_MS;
  readonly requestBodySha256: string;
  readonly writtenAt: string;
  readonly purpose: "single-use-live-attempt-guard";
  readonly note: string;
};

export type IndependentValidationResult = {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly fixtureKind: "synthetic-independent";
};

export type ValidateEnvelope = {
  readonly valid: boolean;
  readonly errors: readonly unknown[];
  readonly extraKeys: readonly string[];
};

export type EnvelopeComparison = {
  readonly envelopeOk: boolean;
  readonly providerValid: boolean | null;
  readonly independentValid: boolean;
  readonly agreement: boolean | null;
  readonly notes: readonly string[];
};

export type LadderAssessment = {
  readonly priorLevel: JsonValidateLadderLevel;
  readonly observedLevel: JsonValidateLadderLevel;
  readonly maxAllowed: "L3";
  readonly neverL4: true;
  readonly rationale: string;
};

export type RedactedHeaderMap = Readonly<Record<string, string>>;

export type JsonValidateRequestDocument = {
  readonly schemaVersion: typeof JSONVALIDATE_OBSERVATION_SCHEMA_VERSION;
  readonly mode: typeof JSONVALIDATE_OBSERVATION_MODE;
  readonly kind: "d6r15JsonValidateRequest";
  readonly requestId: JsonValidateRequestId;
  readonly provider: typeof JSONVALIDATE_001_PROVIDER;
  readonly capabilityId: typeof JSONVALIDATE_001_CAPABILITY_ID;
  readonly approvedUrl: typeof JSONVALIDATE_001_APPROVED_URL;
  readonly sanitizedUrl: string;
  readonly method: typeof JSONVALIDATE_001_METHOD;
  readonly contentType: "application/json";
  readonly requestBody: typeof JSONVALIDATE_001_REQUEST_BODY;
  readonly requestBodySha256: string;
  readonly fixtureKind: "synthetic";
  readonly maxBytes: typeof JSONVALIDATE_001_MAX_BYTES;
  readonly timeoutMs: typeof JSONVALIDATE_001_TIMEOUT_MS;
  readonly redirects: 0;
  readonly retries: 0;
};

export type JsonValidateResultDocument = {
  readonly schemaVersion: typeof JSONVALIDATE_OBSERVATION_SCHEMA_VERSION;
  readonly mode: typeof JSONVALIDATE_OBSERVATION_MODE;
  readonly kind: "d6r15JsonValidateResult";
  readonly requestId: JsonValidateRequestId;
  readonly provider: typeof JSONVALIDATE_001_PROVIDER;
  readonly capabilityId: typeof JSONVALIDATE_001_CAPABILITY_ID;
  readonly approvedUrl: typeof JSONVALIDATE_001_APPROVED_URL;
  readonly sanitizedUrl: string;
  readonly method: typeof JSONVALIDATE_001_METHOD;
  readonly runMode: JsonValidateRunMode;
  readonly status: JsonValidateObservationStatus;
  readonly observedAt: string;
  readonly requestBodySha256: string;
  readonly networkRequestPerformed: boolean;
  readonly authorizationConsumed: boolean;
  readonly httpStatus: number | null;
  readonly contentType: string | null;
  readonly rawResponseBytes: number | null;
  readonly rawResponseSha256: string | null;
  readonly redactedHeaders: RedactedHeaderMap | null;
  readonly pinnedAddress: string | null;
  readonly resolvedAddresses: readonly string[] | null;
  readonly elapsedMs: number | null;
  readonly maxBytes: typeof JSONVALIDATE_001_MAX_BYTES;
  readonly timeoutMs: typeof JSONVALIDATE_001_TIMEOUT_MS;
  readonly redirects: 0;
  readonly retries: 0;
  readonly attemptMarkerPath: string;
  readonly reusedOpenApi001Marker: false;
  readonly reusedD44bCatalogMarker: false;
  readonly reusedSiblingJsonValidateMarker: false;
  readonly controls: JsonValidateControlChecklist;
  readonly genuineProvider: boolean | null;
  readonly interpretation:
    | "A_http_402"
    | "B_http_2xx"
    | "C_error_or_unexpected"
    | "planned"
    | "blocked"
    | "controlsIncomplete";
  readonly independentValidation: IndependentValidationResult;
  readonly envelope: ValidateEnvelope | null;
  readonly envelopeComparison: EnvelopeComparison | null;
  readonly challengeParse: ChallengeParseResult | null;
  readonly offerPolicy: OfferPolicyResult | null;
  readonly ladder: LadderAssessment;
  readonly responseSnapshot: unknown | null;
  readonly rawBodyCommitted: boolean;
  readonly rawBodyPath: string | null;
  readonly error: string | null;
  readonly errorClass: string | null;
  readonly nonActions: readonly string[];
};

export type JsonValidateObservationTransport = (
  url: string,
  deps?: SecureHttpsDeps,
) => Promise<SecureHttpsExchange>;

const SENSITIVE_HEADER_RE =
  /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key|api-key|payment|x-payment|x-402|www-authenticate)$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function canonicalRequestBodyJson(): string {
  return JSON.stringify(JSONVALIDATE_001_REQUEST_BODY);
}

export function requestBodySha256(): string {
  return sha256Text(canonicalRequestBodyJson());
}

/** Exact string match only — trailing slash / query / host-only rejected. */
export function isApprovedJsonValidate001Url(url: string): boolean {
  return url === JSONVALIDATE_001_APPROVED_URL;
}

export function assertExactJsonValidate001Destination(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid JSONVALIDATE-001 URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(
      `JSONVALIDATE-001 URL must be https: (got ${parsed.protocol})`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error("JSONVALIDATE-001 URL must not embed credentials");
  }
  if (parsed.search !== "" && parsed.search !== "?") {
    throw new Error("JSONVALIDATE-001 URL must not include a query string");
  }
  if (parsed.hash !== "" && parsed.hash !== "#") {
    throw new Error("JSONVALIDATE-001 URL must not include a fragment");
  }
  if (parsed.port !== "" && parsed.port !== "443") {
    throw new Error(`JSONVALIDATE-001 URL unexpected port: ${parsed.port}`);
  }
  if (!isApprovedJsonValidate001Url(url)) {
    throw new Error(`URL not approved for JSONVALIDATE-001: ${url}`);
  }
  const canonical = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  if (canonical !== url) {
    throw new Error(
      `JSONVALIDATE-001 URL is not canonical allowlist form: ${url}`,
    );
  }
  return parsed;
}

export function defaultAttemptMarkerPath(
  repoRoot: string,
  requestId: JsonValidateRequestId = JSONVALIDATE_001_REQUEST_ID,
): string {
  return join(repoRoot, attemptMarkerRelFor(requestId));
}

export function attemptMarkerExists(markerPath: string): boolean {
  return existsSync(markerPath);
}

export class AttemptMarkerConflictError extends Error {
  readonly code = "attemptMarkerConflict" as const;
  constructor(markerPath: string, requestId?: JsonValidateRequestId) {
    const id = requestId ?? "JSONVALIDATE";
    super(
      `${id} single-use attempt marker already exists at ${markerPath}. ` +
        `Re-run is blocked (no auto-reset / force-retry). Crash/timeout after a prior ` +
        `marker write does not silently re-approve live access.`,
    );
    this.name = "AttemptMarkerConflictError";
  }
}

function isForbiddenPriorMarkerPath(
  markerPath: string,
  requestId: JsonValidateRequestId,
): boolean {
  const normalized = markerPath.replace(/\\/g, "/");
  if (
    normalized.endsWith(OPENAPI_001_MARKER_REL) ||
    normalized.endsWith(D44B_CATALOG_MARKER_REL)
  ) {
    return true;
  }
  const sibling =
    requestId === JSONVALIDATE_002_REQUEST_ID
      ? JSONVALIDATE_001_ATTEMPT_MARKER_REL
      : JSONVALIDATE_002_ATTEMPT_MARKER_REL;
  return normalized.endsWith(sibling);
}

/**
 * Exclusive single-use marker create (`wx` on final path). Never overwrites.
 * Never touches OPENAPI-001, D4.4b, or sibling JSONVALIDATE markers.
 */
export function writeAttemptMarker(input: {
  readonly markerPath: string;
  readonly writtenAt: string;
  readonly requestId?: JsonValidateRequestId;
}): AttemptMarkerRecord {
  const requestId = input.requestId ?? JSONVALIDATE_001_REQUEST_ID;
  const expectedRel = attemptMarkerRelFor(requestId);
  const normalized = input.markerPath.replace(/\\/g, "/");
  if (!normalized.endsWith(expectedRel)) {
    throw new Error(
      `${requestId} marker path must end with ${expectedRel} (got ${input.markerPath})`,
    );
  }
  if (isForbiddenPriorMarkerPath(input.markerPath, requestId)) {
    throw new Error(
      `${requestId} must not write or reuse OPENAPI-001, D4.4b catalog, or sibling JSONVALIDATE markers`,
    );
  }
  const record: AttemptMarkerRecord = {
    schemaVersion: "1.0",
    requestId,
    approvedUrl: JSONVALIDATE_001_APPROVED_URL,
    method: JSONVALIDATE_001_METHOD,
    maxBytes: JSONVALIDATE_001_MAX_BYTES,
    timeoutMs: JSONVALIDATE_001_TIMEOUT_MS,
    requestBodySha256: requestBodySha256(),
    writtenAt: input.writtenAt,
    purpose: "single-use-live-attempt-guard",
    note:
      "Written before network I/O via exclusive wx create. Presence blocks any " +
      `further --approved-live run for ${requestId}. No CLI force-reset. Distinct from OPENAPI-001, ` +
      "D4.4b catalog, and sibling JSONVALIDATE markers. Human renewed authorization required.",
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
      throw new AttemptMarkerConflictError(input.markerPath, requestId);
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

export function secureHttpsPostSupported(): boolean {
  // Runtime contract: secureHttpsExchange accepts method/body/contentType.
  return true;
}

export function buildControlChecklist(input?: {
  readonly env?: NodeJS.ProcessEnv;
}): JsonValidateControlChecklist {
  const noEnvProxy = !envProxyPresent(input?.env ?? process.env);
  const postOk = secureHttpsPostSupported();
  const controlsComplete = noEnvProxy && postOk;
  return {
    exactAllowlist: true,
    httpsOnly: true,
    tlsVerifyAndSni: true,
    publicDnsPin: true,
    noRedirects: true,
    noRetries: true,
    timeoutMs: JSONVALIDATE_001_TIMEOUT_MS,
    maxBytes: JSONVALIDATE_001_MAX_BYTES,
    noCookiesCredsAuthPayment: true,
    noEnvProxy,
    exclusiveMarkerBeforeIo: true,
    distinctFromPriorMarkers: true,
    secureHttpsPostSupported: postOk,
    controlsComplete,
    abortReason: controlsComplete
      ? null
      : !noEnvProxy
        ? "HTTP(S)_PROXY / ALL_PROXY environment variable present; abort without network"
        : "Secure HTTPS POST overrides unavailable; abort without network",
  };
}

/**
 * Independent offline validator for the exact synthetic fixture.
 * Not a general JSON Schema engine — scoped to this authorized body only.
 */
export function validateIndependently(
  body: typeof JSONVALIDATE_001_REQUEST_BODY = JSONVALIDATE_001_REQUEST_BODY,
): IndependentValidationResult {
  const errors: string[] = [];
  const data = body.data as Record<string, unknown>;
  const schema = body.schema;

  if (schema.type !== "object") {
    errors.push('schema.type must be "object"');
  }
  for (const key of schema.required) {
    if (!(key in data)) {
      errors.push(`missing required property "${key}"`);
    }
  }
  if (typeof data.name !== "string") {
    errors.push('"name" must be a string');
  }
  if (typeof data.age !== "number" || !Number.isInteger(data.age)) {
    errors.push('"age" must be an integer');
  } else if (data.age < 0) {
    errors.push('"age" must be >= 0');
  }

  return {
    valid: errors.length === 0,
    errors,
    fixtureKind: "synthetic-independent",
  };
}

export function parseValidateEnvelope(
  value: unknown,
):
  | { readonly ok: true; readonly envelope: ValidateEnvelope }
  | { readonly ok: false; readonly message: string } {
  if (!isPlainObject(value)) {
    return { ok: false, message: "Response root must be an object" };
  }
  if (!("valid" in value) || typeof value.valid !== "boolean") {
    return {
      ok: false,
      message: 'Response must include boolean "valid"',
    };
  }
  if (!("errors" in value)) {
    return {
      ok: false,
      message: 'Response must include "errors" array',
    };
  }
  if (!Array.isArray(value.errors)) {
    return {
      ok: false,
      message: '"errors" must be an array',
    };
  }
  const known = new Set(["valid", "errors"]);
  const extraKeys = Object.keys(value)
    .filter((k) => !known.has(k))
    .sort();
  return {
    ok: true,
    envelope: {
      valid: value.valid,
      errors: value.errors,
      extraKeys,
    },
  };
}

export function compareEnvelopeToIndependent(input: {
  readonly envelope: ValidateEnvelope;
  readonly independent: IndependentValidationResult;
}): EnvelopeComparison {
  const notes: string[] = [];
  const agreement = input.envelope.valid === input.independent.valid;
  if (!agreement) {
    notes.push(
      `Provider valid=${input.envelope.valid} disagrees with independent valid=${input.independent.valid}`,
    );
  } else {
    notes.push(
      `Provider and independent agree valid=${input.envelope.valid}`,
    );
  }
  if (input.envelope.extraKeys.length > 0) {
    notes.push(`Extra keys present: ${input.envelope.extraKeys.join(", ")}`);
  }
  return {
    envelopeOk: true,
    providerValid: input.envelope.valid,
    independentValid: input.independent.valid,
    agreement,
    notes,
  };
}

export function redactResponseHeaders(
  headers: Readonly<Record<string, string | string[] | undefined>>,
): RedactedHeaderMap {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(headers)) {
    const value = Array.isArray(raw) ? raw.join(", ") : (raw ?? "");
    if (SENSITIVE_HEADER_RE.test(key)) {
      out[key.toLowerCase()] = "[redacted]";
      continue;
    }
    // Bound header value size in artifacts.
    const clipped =
      value.length > 512 ? `${value.slice(0, 512)}…[truncated]` : value;
    out[key.toLowerCase()] = clipped;
  }
  return out;
}

export function assessLadder(input: {
  readonly status: JsonValidateObservationStatus;
  readonly httpStatus: number | null;
  readonly networkRequestPerformed: boolean;
  readonly envelopeComparison: EnvelopeComparison | null;
}): LadderAssessment {
  const priorLevel: JsonValidateLadderLevel = "L0";
  let observed: JsonValidateLadderLevel = "L0";
  let rationale: string;

  if (
    input.networkRequestPerformed &&
    input.httpStatus != null &&
    !(input.httpStatus >= 300 && input.httpStatus < 400)
  ) {
    // Exact method + route known from authorization; request schema from
    // authorized body; response envelope observed → at least L2 reachability.
    observed = "L2";
    rationale =
      "Exact POST + URL authorized; request schema known from fixture; " +
      "endpoint reachability verified by live HTTP response (not a redirect).";
  } else if (!input.networkRequestPerformed) {
    rationale =
      "No live network I/O; ladder remains prior L0 for this observation path.";
  } else {
    rationale =
      "Network attempted but no usable HTTP status for reachability credit.";
  }

  if (
    input.status === "success" &&
    input.httpStatus != null &&
    input.httpStatus >= 200 &&
    input.httpStatus < 300 &&
    input.envelopeComparison?.envelopeOk === true &&
    input.envelopeComparison.agreement === true
  ) {
    observed = "L3";
    rationale =
      "HTTP 2xx with {valid,errors} envelope agreeing with independent " +
      "synthetic fixture validation — task execution verified for this op only.";
  }

  return {
    priorLevel,
    observedLevel: observed,
    maxAllowed: "L3",
    neverL4: true,
    rationale: `${rationale} Never L4 (no payment compatibility verification).`,
  };
}

function mapSecureError(
  error: SecureFetchError,
): JsonValidateObservationStatus {
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

function mapHttpStatus(statusCode: number): JsonValidateObservationStatus {
  if (statusCode === 404) return "notFound";
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 402) return "paymentRequired";
  if (statusCode >= 200 && statusCode < 300) return "success";
  return "httpError";
}

const NON_ACTIONS = [
  "No automatic follow-up request (including on HTTP 402)",
  "No signing / payment / settlement / wallet connection",
  "No PoW execution",
  "No facilitator or RPC contact",
  "No OPENAPI-001, D4.4b, or sibling JSONVALIDATE marker reuse/reset",
  "Never upgrade to L4",
] as const;

export function buildRequestDocument(
  requestId: JsonValidateRequestId = JSONVALIDATE_001_REQUEST_ID,
): JsonValidateRequestDocument {
  return {
    schemaVersion: JSONVALIDATE_OBSERVATION_SCHEMA_VERSION,
    mode: JSONVALIDATE_OBSERVATION_MODE,
    kind: "d6r15JsonValidateRequest",
    requestId,
    provider: JSONVALIDATE_001_PROVIDER,
    capabilityId: JSONVALIDATE_001_CAPABILITY_ID,
    approvedUrl: JSONVALIDATE_001_APPROVED_URL,
    sanitizedUrl: sanitizeEndpointForArtifact(JSONVALIDATE_001_APPROVED_URL),
    method: JSONVALIDATE_001_METHOD,
    contentType: "application/json",
    requestBody: JSONVALIDATE_001_REQUEST_BODY,
    requestBodySha256: requestBodySha256(),
    fixtureKind: "synthetic",
    maxBytes: JSONVALIDATE_001_MAX_BYTES,
    timeoutMs: JSONVALIDATE_001_TIMEOUT_MS,
    redirects: 0,
    retries: 0,
  };
}

function resultDocument(input: {
  readonly requestId: JsonValidateRequestId;
  readonly runMode: JsonValidateRunMode;
  readonly status: JsonValidateObservationStatus;
  readonly observedAt: string;
  readonly attemptMarkerPath: string;
  readonly controls: JsonValidateControlChecklist;
  readonly independentValidation: IndependentValidationResult;
  readonly networkRequestPerformed?: boolean;
  readonly authorizationConsumed?: boolean;
  readonly httpStatus?: number | null;
  readonly contentType?: string | null;
  readonly rawResponseBytes?: number | null;
  readonly rawResponseSha256?: string | null;
  readonly redactedHeaders?: RedactedHeaderMap | null;
  readonly pinnedAddress?: string | null;
  readonly resolvedAddresses?: readonly string[] | null;
  readonly elapsedMs?: number | null;
  readonly genuineProvider?: boolean | null;
  readonly interpretation:
    | "A_http_402"
    | "B_http_2xx"
    | "C_error_or_unexpected"
    | "planned"
    | "blocked"
    | "controlsIncomplete";
  readonly envelope?: ValidateEnvelope | null;
  readonly envelopeComparison?: EnvelopeComparison | null;
  readonly challengeParse?: ChallengeParseResult | null;
  readonly offerPolicy?: OfferPolicyResult | null;
  readonly responseSnapshot?: unknown | null;
  readonly rawBodyCommitted?: boolean;
  readonly rawBodyPath?: string | null;
  readonly error?: string | null;
  readonly errorClass?: string | null;
}): JsonValidateResultDocument {
  const ladder = assessLadder({
    status: input.status,
    httpStatus: input.httpStatus ?? null,
    networkRequestPerformed: input.networkRequestPerformed ?? false,
    envelopeComparison: input.envelopeComparison ?? null,
  });
  return {
    schemaVersion: JSONVALIDATE_OBSERVATION_SCHEMA_VERSION,
    mode: JSONVALIDATE_OBSERVATION_MODE,
    kind: "d6r15JsonValidateResult",
    requestId: input.requestId,
    provider: JSONVALIDATE_001_PROVIDER,
    capabilityId: JSONVALIDATE_001_CAPABILITY_ID,
    approvedUrl: JSONVALIDATE_001_APPROVED_URL,
    sanitizedUrl: sanitizeEndpointForArtifact(JSONVALIDATE_001_APPROVED_URL),
    method: JSONVALIDATE_001_METHOD,
    runMode: input.runMode,
    status: input.status,
    observedAt: input.observedAt,
    requestBodySha256: requestBodySha256(),
    networkRequestPerformed: input.networkRequestPerformed ?? false,
    authorizationConsumed: input.authorizationConsumed ?? false,
    httpStatus: input.httpStatus ?? null,
    contentType: input.contentType ?? null,
    rawResponseBytes: input.rawResponseBytes ?? null,
    rawResponseSha256: input.rawResponseSha256 ?? null,
    redactedHeaders: input.redactedHeaders ?? null,
    pinnedAddress: input.pinnedAddress ?? null,
    resolvedAddresses: input.resolvedAddresses ?? null,
    elapsedMs: input.elapsedMs ?? null,
    maxBytes: JSONVALIDATE_001_MAX_BYTES,
    timeoutMs: JSONVALIDATE_001_TIMEOUT_MS,
    redirects: 0,
    retries: 0,
    attemptMarkerPath: input.attemptMarkerPath,
    reusedOpenApi001Marker: false,
    reusedD44bCatalogMarker: false,
    reusedSiblingJsonValidateMarker: false,
    controls: input.controls,
    genuineProvider: input.genuineProvider ?? null,
    interpretation: input.interpretation,
    independentValidation: input.independentValidation,
    envelope: input.envelope ?? null,
    envelopeComparison: input.envelopeComparison ?? null,
    challengeParse: input.challengeParse ?? null,
    offerPolicy: input.offerPolicy ?? null,
    ladder,
    responseSnapshot: input.responseSnapshot ?? null,
    rawBodyCommitted: input.rawBodyCommitted ?? false,
    rawBodyPath: input.rawBodyPath ?? null,
    error: input.error ?? null,
    errorClass: input.errorClass ?? null,
    nonActions: [...NON_ACTIONS],
  };
}

function boundedSnapshot(value: unknown, maxChars = 4_096): unknown {
  const text = JSON.stringify(value);
  if (text == null) return null;
  if (text.length <= maxChars) return value;
  return {
    truncated: true,
    preview: `${text.slice(0, maxChars)}…`,
    originalChars: text.length,
  };
}

function interpret402(exchange: SecureHttpsExchange): {
  readonly challengeParse: ChallengeParseResult;
  readonly offerPolicy: OfferPolicyResult;
} {
  const fixture: Http402Fixture = {
    fixtureKind: "captured",
    httpStatus: exchange.statusCode,
    headers: { ...exchange.headers },
    body: exchange.body,
  };
  const challengeParse = parseHttp402Challenge(fixture);
  const offerPolicy = evaluateOfferPolicy(challengeParse, {
    paymentApprovalGranted: false,
    expectedResource: JSONVALIDATE_001_APPROVED_URL,
  });
  return { challengeParse, offerPolicy };
}

export async function observeAgent402JsonValidate(input: {
  readonly runMode: JsonValidateRunMode;
  readonly requestId?: JsonValidateRequestId;
  readonly observedAt?: string;
  readonly repoRoot: string;
  readonly markerPath?: string;
  readonly transport?: JsonValidateObservationTransport;
  readonly deps?: SecureHttpsDeps;
  readonly skipMarkerWrite?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly commitRawBody?: boolean;
}): Promise<{
  readonly request: JsonValidateRequestDocument;
  readonly result: JsonValidateResultDocument;
  readonly rawBody: Buffer | null;
}> {
  const requestId = input.requestId ?? JSONVALIDATE_001_REQUEST_ID;
  const observedAt = input.observedAt ?? new Date().toISOString();
  const markerPathAbs =
    input.markerPath ?? defaultAttemptMarkerPath(input.repoRoot, requestId);
  const markerPathForArtifact = markerPathAbs.startsWith(input.repoRoot)
    ? markerPathAbs.slice(input.repoRoot.length).replace(/^\//, "")
    : markerPathAbs;
  const controls = buildControlChecklist({ env: input.env });
  const independentValidation = validateIndependently();
  const request = buildRequestDocument(requestId);
  const withId = (
    fields: Omit<Parameters<typeof resultDocument>[0], "requestId">,
  ): JsonValidateResultDocument => resultDocument({ requestId, ...fields });

  assertExactJsonValidate001Destination(JSONVALIDATE_001_APPROVED_URL);

  if (input.runMode === "dry-run") {
    return {
      request,
      result: withId({
        runMode: "dry-run",
        status: "planned",
        observedAt,
        attemptMarkerPath: markerPathForArtifact,
        controls,
        independentValidation,
        interpretation: "planned",
        networkRequestPerformed: false,
        authorizationConsumed: false,
      }),
      rawBody: null,
    };
  }

  if (!controls.controlsComplete) {
    return {
      request,
      result: withId({
        runMode: "approved-live",
        status: "controlsIncomplete",
        observedAt,
        attemptMarkerPath: markerPathForArtifact,
        controls,
        independentValidation,
        interpretation: "controlsIncomplete",
        error: controls.abortReason,
        errorClass: "controlsIncomplete",
        networkRequestPerformed: false,
        authorizationConsumed: false,
      }),
      rawBody: null,
    };
  }

  if (!input.skipMarkerWrite) {
    if (attemptMarkerExists(markerPathAbs)) {
      return {
        request,
        result: withId({
          runMode: "approved-live",
          status: "attemptBlocked",
          observedAt,
          attemptMarkerPath: markerPathForArtifact,
          controls,
          independentValidation,
          interpretation: "blocked",
          error: `Single-use attempt marker exists at ${markerPathForArtifact}; live re-run blocked`,
          errorClass: "attemptBlocked",
          networkRequestPerformed: false,
          authorizationConsumed: false,
        }),
        rawBody: null,
      };
    }
    try {
      writeAttemptMarker({
        markerPath: markerPathAbs,
        writtenAt: observedAt,
        requestId,
      });
    } catch (error) {
      if (
        error instanceof AttemptMarkerConflictError ||
        (error instanceof Error && /already exists/.test(error.message))
      ) {
        return {
          request,
          result: withId({
            runMode: "approved-live",
            status: "attemptBlocked",
            observedAt,
            attemptMarkerPath: markerPathForArtifact,
            controls,
            independentValidation,
            interpretation: "blocked",
            error: `Single-use attempt marker conflict at ${markerPathForArtifact}; live re-run blocked`,
            errorClass: "attemptBlocked",
            networkRequestPerformed: false,
            authorizationConsumed: false,
          }),
          rawBody: null,
        };
      }
      throw error;
    }
  }

  const bodyJson = canonicalRequestBodyJson();
  const transport = input.transport ?? secureHttpsExchange;
  let exchange: SecureHttpsExchange;
  try {
    exchange = await transport(JSONVALIDATE_001_APPROVED_URL, {
      ...input.deps,
      method: "POST",
      body: bodyJson,
      contentType: "application/json",
      accept: "application/json",
      userAgent:
        "AgentHire-agent402-jsonvalidate-observation/0.1 (OBSERVE_ONLY)",
      maxBytes: JSONVALIDATE_001_MAX_BYTES,
      timeoutMs: JSONVALIDATE_001_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof SecureFetchError) {
      return {
        request,
        result: withId({
          runMode: "approved-live",
          status: mapSecureError(error),
          observedAt,
          attemptMarkerPath: markerPathForArtifact,
          controls,
          independentValidation,
          interpretation: "C_error_or_unexpected",
          error: error.message,
          errorClass: error.errorClass,
          networkRequestPerformed: true,
          authorizationConsumed: true,
          genuineProvider: null,
        }),
        rawBody: null,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      request,
      result: withId({
        runMode: "approved-live",
        status: "networkError",
        observedAt,
        attemptMarkerPath: markerPathForArtifact,
        controls,
        independentValidation,
        interpretation: "C_error_or_unexpected",
        error: message,
        errorClass: "unknown",
        networkRequestPerformed: true,
        authorizationConsumed: true,
      }),
      rawBody: null,
    };
  }

  const redactedHeaders = redactResponseHeaders(exchange.headers);
  const baseExchangeFields = {
    httpStatus: exchange.statusCode,
    contentType: exchange.contentType,
    rawResponseBytes: exchange.byteLength,
    rawResponseSha256: exchange.sha256,
    redactedHeaders,
    pinnedAddress: exchange.pinnedAddress.address,
    resolvedAddresses: exchange.resolvedAddresses.map((a) => a.address),
    elapsedMs: exchange.elapsedMs,
    networkRequestPerformed: true as const,
    authorizationConsumed: true as const,
    genuineProvider: true as const,
  };

  const httpKind = mapHttpStatus(exchange.statusCode);

  if (httpKind === "paymentRequired") {
    const { challengeParse, offerPolicy } = interpret402(exchange);
    let snapshot: unknown = null;
    const json = parseJsonBytes(exchange.body);
    if (json.ok) {
      snapshot = boundedSnapshot(json.value);
    } else {
      snapshot = {
        truncated: true,
        preview: exchange.body.toString("utf8").slice(0, 512),
        note: "non-json or partial 402 body preview",
      };
    }
    return {
      request,
      result: withId({
        runMode: "approved-live",
        status: "paymentRequired",
        observedAt,
        attemptMarkerPath: markerPathForArtifact,
        controls,
        independentValidation,
        interpretation: "A_http_402",
        ...baseExchangeFields,
        challengeParse,
        offerPolicy,
        responseSnapshot: snapshot,
        error: "HTTP 402 Payment Required — challenge preserved; no pay/sign/retry",
        errorClass: "paymentRequired",
      }),
      rawBody: exchange.body,
    };
  }

  if (httpKind !== "success") {
    const errJson = parseJsonBytes(exchange.body);
    return {
      request,
      result: withId({
        runMode: "approved-live",
        status: httpKind,
        observedAt,
        attemptMarkerPath: markerPathForArtifact,
        controls,
        independentValidation,
        interpretation: "C_error_or_unexpected",
        ...baseExchangeFields,
        responseSnapshot: boundedSnapshot(
          errJson.ok ? errJson.value : exchange.body.toString("utf8").slice(0, 512),
        ),
        error: `HTTP ${exchange.statusCode}`,
        errorClass: "httpError",
      }),
      rawBody: exchange.body,
    };
  }

  const json = parseJsonBytes(exchange.body);
  if (!json.ok) {
    return {
      request,
      result: withId({
        runMode: "approved-live",
        status: "invalidJson",
        observedAt,
        attemptMarkerPath: markerPathForArtifact,
        controls,
        independentValidation,
        interpretation: "C_error_or_unexpected",
        ...baseExchangeFields,
        error: json.message,
        errorClass: "invalidJson",
      }),
      rawBody: exchange.body,
    };
  }

  const parsed = parseValidateEnvelope(json.value);
  if (!parsed.ok) {
    return {
      request,
      result: withId({
        runMode: "approved-live",
        status: "invalidEnvelope",
        observedAt,
        attemptMarkerPath: markerPathForArtifact,
        controls,
        independentValidation,
        interpretation: "C_error_or_unexpected",
        ...baseExchangeFields,
        responseSnapshot: boundedSnapshot(json.value),
        error: parsed.message,
        errorClass: "invalidEnvelope",
      }),
      rawBody: exchange.body,
    };
  }

  const envelopeComparison = compareEnvelopeToIndependent({
    envelope: parsed.envelope,
    independent: independentValidation,
  });

  const commitRaw = input.commitRawBody ?? true;
  const prefix = evidenceBasenamePrefix(requestId);
  const rawBodyPath = commitRaw
    ? `docs/day6/evidence/${prefix}-response-raw.json`
    : null;

  return {
    request,
    result: withId({
      runMode: "approved-live",
      status: "success",
      observedAt,
      attemptMarkerPath: markerPathForArtifact,
      controls,
      independentValidation,
      interpretation: "B_http_2xx",
      ...baseExchangeFields,
      envelope: parsed.envelope,
      envelopeComparison,
      responseSnapshot: boundedSnapshot(json.value),
      rawBodyCommitted: commitRaw,
      rawBodyPath,
    }),
    rawBody: exchange.body,
  };
}

export function renderObservationMarkdown(input: {
  readonly request: JsonValidateRequestDocument;
  readonly result: JsonValidateResultDocument;
}): string {
  const r = input.result;
  const q = input.request;
  const lines = [
    "# D6-R1.5 — Agent402 JSON Schema Validation Observation",
    "",
    `Mode: \`${JSONVALIDATE_OBSERVATION_MODE}\``,
    "",
    "## Request",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| requestId | \`${q.requestId}\` |`,
    `| url | \`${q.approvedUrl}\` |`,
    `| method | \`${q.method}\` |`,
    `| requestBodySha256 | \`${q.requestBodySha256}\` |`,
    `| fixtureKind | \`${q.fixtureKind}\` |`,
    `| maxBytes | ${q.maxBytes} |`,
    `| timeoutMs | ${q.timeoutMs} |`,
    "",
    "## Result",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| runMode | \`${r.runMode}\` |`,
    `| status | \`${r.status}\` |`,
    `| interpretation | \`${r.interpretation}\` |`,
    `| httpStatus | ${r.httpStatus ?? "n/a"} |`,
    `| rawResponseBytes | ${r.rawResponseBytes ?? "n/a"} |`,
    `| rawResponseSha256 | \`${r.rawResponseSha256 ?? "n/a"}\` |`,
    `| networkRequestPerformed | ${r.networkRequestPerformed} |`,
    `| authorizationConsumed | ${r.authorizationConsumed} |`,
    `| genuineProvider | ${r.genuineProvider ?? "n/a"} |`,
    `| attemptMarkerPath | \`${r.attemptMarkerPath}\` |`,
    `| ladder prior → observed | \`${r.ladder.priorLevel}\` → \`${r.ladder.observedLevel}\` |`,
    `| controlsComplete | ${r.controls.controlsComplete} |`,
    "",
    "## Independent validation",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| valid | ${r.independentValidation.valid} |`,
    `| errors | ${r.independentValidation.errors.length === 0 ? "(none)" : r.independentValidation.errors.join("; ")} |`,
    "",
  ];

  if (r.envelopeComparison) {
    lines.push(
      "## Envelope comparison",
      "",
      `| Field | Value |`,
      `| --- | --- |`,
      `| providerValid | ${r.envelopeComparison.providerValid} |`,
      `| independentValid | ${r.envelopeComparison.independentValid} |`,
      `| agreement | ${r.envelopeComparison.agreement} |`,
      "",
      ...r.envelopeComparison.notes.map((n) => `- ${n}`),
      "",
    );
  }

  if (r.interpretation === "A_http_402") {
    lines.push(
      "## HTTP 402 offline parse + policy",
      "",
      `- challengeParse.ok: ${r.challengeParse?.ok ?? "n/a"}`,
      `- offerPolicy.anyStructurallyCompatible: ${r.offerPolicy?.anyStructurallyCompatible ?? "n/a"}`,
      `- offerPolicy.anyPolicyPass: ${r.offerPolicy?.anyPolicyPass ?? "n/a"}`,
      "- No sign / pay / PoW / follow-up request",
      "",
    );
  }

  lines.push(
    "## Ladder",
    "",
    r.ladder.rationale,
    "",
    "## Non-actions",
    "",
    ...r.nonActions.map((n) => `- ${n}`),
    "",
  );
  if (r.error) {
    lines.push("## Error", "", `\`${r.errorClass}\`: ${r.error}`, "");
  }
  return `${lines.join("\n")}`;
}

export { sha256Hex };

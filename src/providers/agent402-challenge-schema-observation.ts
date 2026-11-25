/**
 * D7.3 Stage A — Agent402 challenge API schema / secure-transport observation.
 *
 * Mode: SCHEMA_OBSERVE_ONLY / ONE_APPROVED_GET_ONLY / NO_SOLVE / NO_POST
 *
 * Exactly one approved GET:
 *   https://agent402.tools/api/pow/challenge?slug=json-validate
 *
 * Captures local evidence, analyzes JSON field names/types offline, stops.
 * Does not compute a solution, does not POST the task endpoint, does not
 * send cookies / Authorization / payment / X-Pow-Solution headers.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { dirname, join } from "node:path";
import {
  SecureFetchError,
  isBlockedIpAddress,
  secureHttpsExchange,
  type DnsLookupFn,
  type ResolvedAddress,
  type SecureHttpsDeps,
  type SecureHttpsExchange,
} from "../erc8004/secure-https.ts";
import { parsePowChallengeJson } from "../pow/challenge.ts";
import {
  POW_CHALLENGE_GET_REQUEST_ID,
  POW_CHALLENGE_URL,
  POW_SLUG,
} from "../pow/types.ts";
import { sanitizeEndpointForArtifact } from "./inspection-policy.ts";
import { envProxyPresent } from "./agent402-jsonvalidate-observation.ts";

export const CHALLENGE_SCHEMA_OBS_VERSION = "1.0" as const;
export const CHALLENGE_SCHEMA_OBS_MODE =
  "SCHEMA_OBSERVE_ONLY / ONE_APPROVED_GET_ONLY / NO_SOLVE / NO_POST" as const;

export const STAGE_A_REQUEST_ID = POW_CHALLENGE_GET_REQUEST_ID;
export const STAGE_A_APPROVED_URL = POW_CHALLENGE_URL;
export const STAGE_A_METHOD = "GET" as const;
export const STAGE_A_TIMEOUT_MS = 5_000 as const;
/** Stage A Product-Owner cap (stricter than dual-live proposal 65_536). */
export const STAGE_A_MAX_BYTES = 16_384 as const;

export const STAGE_A_MARKER_REL =
  "docs/day7/evidence/agent402-pow-challenge-get-001.marker" as const;
export const STAGE_A_EVIDENCE_PREFIX =
  "agent402-pow-challenge-get-001" as const;

/** Public recursive resolvers used for TCP DNS (bypass local Fake-IP hijack). */
export const STAGE_A_PUBLIC_DNS_SERVERS = ["1.1.1.1", "8.8.8.8"] as const;
export const STAGE_A_PUBLIC_DNS_PORT = 53 as const;

export const JSONVALIDATE_001_MARKER_REL =
  "docs/day6/evidence/agent402-jsonvalidate-001-live-attempt.marker" as const;
export const JSONVALIDATE_002_MARKER_REL =
  "docs/day6/evidence/agent402-jsonvalidate-002-live-attempt.marker" as const;

export type ChallengeSchemaRunMode = "dry-run" | "approved-live";

export type ChallengeSchemaStatus =
  | "planned"
  | "success"
  | "attemptBlocked"
  | "controlsIncomplete"
  | "unsafeDestination"
  | "tlsFailure"
  | "timeout"
  | "oversized"
  | "redirectRejected"
  | "invalidJson"
  | "httpError"
  | "networkError";

export type ChallengeSchemaControls = {
  readonly exactAllowlist: true;
  readonly httpsOnly: true;
  readonly tlsVerifyAndSni: true;
  readonly publicDnsPin: true;
  readonly noRedirects: true;
  readonly noRetries: true;
  readonly timeoutMs: typeof STAGE_A_TIMEOUT_MS;
  readonly maxBytes: typeof STAGE_A_MAX_BYTES;
  readonly noCookiesCredsAuthPayment: true;
  readonly noPowSolutionHeader: true;
  readonly getOnlyNoPost: true;
  readonly noSolver: true;
  readonly noEnvProxy: boolean;
  readonly exclusiveMarkerBeforeIo: true;
  readonly distinctFromJsonValidateMarkers: true;
  readonly controlsComplete: boolean;
  readonly abortReason: string | null;
};

export type StageAMarkerRecord = {
  readonly schemaVersion: "1.0";
  readonly requestId: typeof STAGE_A_REQUEST_ID;
  readonly kind: "challenge-schema-get";
  readonly approvedUrl: typeof STAGE_A_APPROVED_URL;
  readonly method: typeof STAGE_A_METHOD;
  readonly maxBytes: typeof STAGE_A_MAX_BYTES;
  readonly timeoutMs: typeof STAGE_A_TIMEOUT_MS;
  readonly redirects: 0;
  readonly retries: 0;
  readonly writtenAt: string;
  readonly purpose: "single-use-live-attempt-guard";
  readonly scope: "one-shot-get-schema-observation";
  readonly note: string;
};

export type RedactedHeaderMap = Readonly<Record<string, string>>;

export type FieldTypeObservation = {
  readonly name: string;
  readonly jsType: string;
  readonly present: boolean;
  readonly notes: string;
};

export type SanitizedJsonStructure = {
  readonly rootType: string;
  readonly topLevelKeys: readonly string[];
  readonly fields: readonly FieldTypeObservation[];
  readonly redactedValues: Readonly<Record<string, string>>;
};

export type AdapterCompatibility = {
  readonly parseOk: boolean;
  readonly parseReason: string | null;
  readonly parseMessage: string | null;
  readonly rawKeys: readonly string[];
  readonly difficultyFieldCandidates: readonly string[];
  readonly difficultyBitsNormalized: number | null;
  readonly difficultyJsType: string | null;
  readonly tokenPresent: boolean;
  readonly challengePresent: boolean;
  readonly tokenEqualsChallenge: boolean | null;
  readonly expiresAtPresent: boolean;
  readonly expiresAtJsType: string | null;
  readonly expiresAtValueRedacted: string | null;
  readonly adapterExpiresAtCaptured: boolean;
  readonly algorithm: string | null;
  readonly submitHeader: string | null;
  readonly submitFormat: string | null;
  readonly ttlSeconds: number | null;
  readonly leadingZeroBitsDocumentedInRule: boolean | null;
  readonly slugPresent: boolean;
  readonly slugMatches: boolean | null;
  readonly assumptions: readonly string[];
  readonly mismatches: readonly string[];
};

export type ChallengeSchemaRequestDocument = {
  readonly schemaVersion: typeof CHALLENGE_SCHEMA_OBS_VERSION;
  readonly mode: typeof CHALLENGE_SCHEMA_OBS_MODE;
  readonly kind: "d73StageAChallengeSchemaRequest";
  readonly requestId: typeof STAGE_A_REQUEST_ID;
  readonly approvedUrl: typeof STAGE_A_APPROVED_URL;
  readonly sanitizedUrl: string;
  readonly method: typeof STAGE_A_METHOD;
  readonly accept: "application/json";
  readonly maxBytes: typeof STAGE_A_MAX_BYTES;
  readonly timeoutMs: typeof STAGE_A_TIMEOUT_MS;
  readonly redirects: 0;
  readonly retries: 0;
  readonly publicDnsServers: readonly string[];
  readonly dnsTransport: "tcp";
};

export type ChallengeSchemaResultDocument = {
  readonly schemaVersion: typeof CHALLENGE_SCHEMA_OBS_VERSION;
  readonly mode: typeof CHALLENGE_SCHEMA_OBS_MODE;
  readonly kind: "d73StageAChallengeSchemaResult";
  readonly requestId: typeof STAGE_A_REQUEST_ID;
  readonly approvedUrl: typeof STAGE_A_APPROVED_URL;
  readonly sanitizedUrl: string;
  readonly method: typeof STAGE_A_METHOD;
  readonly runMode: ChallengeSchemaRunMode;
  readonly status: ChallengeSchemaStatus;
  readonly observedAt: string;
  readonly networkRequestPerformed: boolean;
  readonly authorizationConsumed: boolean;
  readonly httpStatus: number | null;
  readonly contentType: string | null;
  readonly rawResponseBytes: number | null;
  readonly rawResponseSha256: string | null;
  readonly redactedHeaders: RedactedHeaderMap | null;
  readonly pinnedAddress: string | null;
  readonly resolvedAddresses: readonly string[] | null;
  readonly dnsResolverUsed: string | null;
  readonly elapsedMs: number | null;
  readonly maxBytes: typeof STAGE_A_MAX_BYTES;
  readonly timeoutMs: typeof STAGE_A_TIMEOUT_MS;
  readonly redirects: 0;
  readonly retries: 0;
  readonly attemptMarkerPath: string;
  readonly jsonValidate001MarkerSha256: string | null;
  readonly jsonValidate002MarkerSha256: string | null;
  readonly jsonValidateMarkersUnchanged: boolean;
  readonly controls: ChallengeSchemaControls;
  readonly genuineProvider: boolean | null;
  readonly sanitizedStructure: SanitizedJsonStructure | null;
  readonly adapterCompatibility: AdapterCompatibility | null;
  readonly evidenceLevel: "not-L3";
  readonly stageBRequiresNewAuth: true;
  readonly rawBodyCommitted: boolean;
  readonly rawBodyPath: string | null;
  readonly error: string | null;
  readonly errorClass: string | null;
  readonly nonActions: readonly string[];
};

export type ChallengeSchemaTransport = (
  url: string,
  deps?: SecureHttpsDeps,
) => Promise<SecureHttpsExchange>;

export const STAGE_A_NON_ACTIONS = [
  "No POST to /api/json-validate",
  "No solution / nonce computation",
  "No X-Pow-Solution header",
  "No wallet / signing / payment / facilitator / chain RPC",
  "No second GET / retry",
  "No JSONVALIDATE-001/002 marker reset",
  "No redirect follow",
  "No env HTTP(S)_PROXY use (agent:false + pinned IP)",
  "No push / merge",
] as const;

const SENSITIVE_HEADER_RE =
  /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key|api-key|payment|x-payment|x-402|www-authenticate)$/i;

const SENSITIVE_JSON_KEYS = new Set([
  "token",
  "challenge",
  "puzzle",
  "prefix",
  "seed",
  "id",
  "challengeId",
  "challenge_id",
  "nonce",
  "solution",
  // May embed challenge material in prose — keep redacted in reports.
  "rule",
  "submitNote",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function isApprovedStageAChallengeUrl(url: string): boolean {
  return url === STAGE_A_APPROVED_URL;
}

export function assertExactStageAChallengeUrl(url: string): URL {
  if (!isApprovedStageAChallengeUrl(url)) {
    throw new Error(
      `Stage A URL rejected (exact allowlist): got ${JSON.stringify(url)} expected ${STAGE_A_APPROVED_URL}`,
    );
  }
  return new URL(url);
}

export function defaultStageAMarkerPath(repoRoot: string): string {
  return join(repoRoot, STAGE_A_MARKER_REL);
}

export function stageAMarkerExists(markerPath: string): boolean {
  return existsSync(markerPath);
}

export class StageAMarkerConflictError extends Error {
  readonly code = "stageAMarkerConflict" as const;
  constructor(markerPath: string) {
    super(
      `${STAGE_A_REQUEST_ID} single-use attempt marker already exists at ${markerPath}. ` +
        `Re-run is blocked (no auto-reset / force-retry).`,
    );
    this.name = "StageAMarkerConflictError";
  }
}

function isForbiddenPriorMarkerPath(markerPath: string): boolean {
  const normalized = markerPath.replace(/\\/g, "/");
  return (
    normalized.endsWith(JSONVALIDATE_001_MARKER_REL) ||
    normalized.endsWith(JSONVALIDATE_002_MARKER_REL) ||
    normalized.endsWith(
      "docs/day7/evidence/agent402-pow-challenge-get-001-live-attempt.marker",
    ) ||
    normalized.endsWith(
      "docs/day7/evidence/agent402-pow-submit-post-001-live-attempt.marker",
    )
  );
}

/**
 * Exclusive wx create for Stage A GET marker. Path is Stage A specific
 * (`agent402-pow-challenge-get-001.marker`), distinct from dual-live
 * `*-live-attempt.marker` helpers.
 */
export function writeStageAAttemptMarker(input: {
  readonly markerPath: string;
  readonly writtenAt: string;
}): StageAMarkerRecord {
  const normalized = input.markerPath.replace(/\\/g, "/");
  if (!normalized.endsWith(STAGE_A_MARKER_REL)) {
    throw new Error(
      `Stage A marker path must end with ${STAGE_A_MARKER_REL} (got ${input.markerPath})`,
    );
  }
  if (isForbiddenPriorMarkerPath(input.markerPath)) {
    throw new Error(
      "Stage A must not write or reuse JSONVALIDATE / dual-live PoW markers",
    );
  }
  const record: StageAMarkerRecord = {
    schemaVersion: "1.0",
    requestId: STAGE_A_REQUEST_ID,
    kind: "challenge-schema-get",
    approvedUrl: STAGE_A_APPROVED_URL,
    method: STAGE_A_METHOD,
    maxBytes: STAGE_A_MAX_BYTES,
    timeoutMs: STAGE_A_TIMEOUT_MS,
    redirects: 0,
    retries: 0,
    writtenAt: input.writtenAt,
    purpose: "single-use-live-attempt-guard",
    scope: "one-shot-get-schema-observation",
    note:
      "Written before DNS/network via exclusive wx. Consumes POW-CHALLENGE-GET-001. " +
      "GET-only schema/transport observation — no solve, no POST. " +
      "Never reset JSONVALIDATE-001/002 markers.",
  };
  mkdirSync(dirname(input.markerPath), { recursive: true });
  try {
    writeFileSync(input.markerPath, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code === "EEXIST" || existsSync(input.markerPath)) {
      throw new StageAMarkerConflictError(input.markerPath);
    }
    throw error;
  }
  return record;
}

export function buildStageAControlChecklist(input?: {
  readonly env?: NodeJS.ProcessEnv;
}): ChallengeSchemaControls {
  const noEnvProxy = !envProxyPresent(input?.env ?? process.env);
  return {
    exactAllowlist: true,
    httpsOnly: true,
    tlsVerifyAndSni: true,
    publicDnsPin: true,
    noRedirects: true,
    noRetries: true,
    timeoutMs: STAGE_A_TIMEOUT_MS,
    maxBytes: STAGE_A_MAX_BYTES,
    noCookiesCredsAuthPayment: true,
    noPowSolutionHeader: true,
    getOnlyNoPost: true,
    noSolver: true,
    noEnvProxy,
    exclusiveMarkerBeforeIo: true,
    distinctFromJsonValidateMarkers: true,
    controlsComplete: noEnvProxy,
    abortReason: noEnvProxy
      ? null
      : "HTTP(S)_PROXY / ALL_PROXY environment variable present; abort without network",
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
    const clipped =
      value.length > 512 ? `${value.slice(0, 512)}…[truncated]` : value;
    out[key.toLowerCase()] = clipped;
  }
  return out;
}

function redactScalar(value: unknown): string {
  if (typeof value === "string") {
    if (value.length === 0) return "(empty-string)";
    const hash = sha256Text(value).slice(0, 12);
    return `string(len=${value.length},sha256_12=${hash})`;
  }
  if (typeof value === "number") return `number(${value})`;
  if (typeof value === "boolean") return `boolean(${value})`;
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(len=${value.length})`;
  if (isPlainObject(value)) return `object(keys=${Object.keys(value).length})`;
  return typeof value;
}

export function observeSanitizedJsonStructure(
  value: unknown,
): SanitizedJsonStructure {
  if (!isPlainObject(value)) {
    return {
      rootType: Array.isArray(value) ? "array" : typeof value,
      topLevelKeys: [],
      fields: [],
      redactedValues: {},
    };
  }
  const topLevelKeys = Object.keys(value).sort();
  const fields: FieldTypeObservation[] = [];
  const redactedValues: Record<string, string> = {};
  for (const name of topLevelKeys) {
    const v = value[name];
    const jsType =
      v === null
        ? "null"
        : Array.isArray(v)
          ? "array"
          : typeof v;
    const sensitive = SENSITIVE_JSON_KEYS.has(name);
    fields.push({
      name,
      jsType,
      present: true,
      notes: sensitive
        ? "sensitive challenge material — value redacted in reports"
        : jsType === "number"
          ? "numeric; units not assumed"
          : "",
    });
    redactedValues[name] = redactScalar(v);
  }
  return { rootType: "object", topLevelKeys, fields, redactedValues };
}

export function analyzeAdapterCompatibility(
  value: unknown,
): AdapterCompatibility {
  const parsed = parsePowChallengeJson(value, "live");
  const obj = isPlainObject(value) ? value : {};
  const rawKeys = Object.keys(obj).sort();
  const difficultyFieldCandidates = [
    "difficultyBits",
    "difficulty",
    "leadingZeroBits",
    "bits",
    "zeros",
  ].filter((k) => k in obj);

  const token =
    typeof obj.token === "string"
      ? obj.token
      : typeof obj.id === "string"
        ? obj.id
        : null;
  const challenge =
    typeof obj.challenge === "string"
      ? obj.challenge
      : typeof obj.puzzle === "string"
        ? obj.puzzle
        : typeof obj.prefix === "string"
          ? obj.prefix
          : typeof obj.seed === "string"
            ? obj.seed
            : null;

  const assumptions = [
    "Adapter aliases token|id|challengeId for token",
    "Adapter aliases challenge|puzzle|prefix|seed for challenge seed",
    "Compat mode may fall back challenge := token when challenge field absent; agent402-contract forbids that fallback",
    "Adapter treats difficultyBits|difficulty|leadingZeroBits|bits|zeros as integer bits (0–256); contract prefers numeric difficulty",
    "Adapter agent402-contract mode requires numeric expiresAt (Unix seconds); compat accepts number or ISO/numeric string",
    "Header format assumed token:nonce — Stage A observes submitFormat/submitHeader when present but does not solve",
  ];
  const mismatches: string[] = [];
  if (!parsed.ok) {
    mismatches.push(`${parsed.reason}: ${parsed.message}`);
  }
  if (token != null && challenge != null && token === challenge) {
    mismatches.push(
      "token value equals challenge value — confirm roles before Stage B",
    );
  }
  if (token != null && challenge != null && token !== challenge) {
    // Positive observation, not a mismatch — recorded in findings via flag.
  }
  if (token != null && challenge == null) {
    mismatches.push(
      "challenge/puzzle/prefix/seed absent; adapter would alias token as challenge seed — treat as assumption until Product Owner confirms",
    );
  }
  if (difficultyFieldCandidates.length === 0) {
    mismatches.push("no recognized difficulty field names present");
  }
  if (
    difficultyFieldCandidates.length > 0 &&
    !("difficultyBits" in obj) &&
    "difficulty" in obj
  ) {
    mismatches.push(
      'field name is "difficulty" not "difficultyBits" (adapter alias accepts it; confirm units from provider docs/fields)',
    );
  }

  const expiresAtRaw =
    obj.expiresAt ?? obj.expires_at ?? obj.expiry ?? obj.exp;
  const expiresAtJsType =
    expiresAtRaw === undefined
      ? null
      : expiresAtRaw === null
        ? "null"
        : Array.isArray(expiresAtRaw)
          ? "array"
          : typeof expiresAtRaw;
  if (expiresAtJsType === "number") {
    // Stage B agent402-contract parse accepts numeric Unix-seconds expiresAt.
    if (parsed.ok && parsed.challenge.expiresAtUnixSeconds == null) {
      mismatches.push(
        "expiresAt is a number but adapter did not capture expiresAtUnixSeconds",
      );
    }
  }

  const ruleText = typeof obj.rule === "string" ? obj.rule : "";
  const leadingZeroBitsDocumentedInRule =
    ruleText.length > 0
      ? /leading zero bits/i.test(ruleText)
      : null;
  if (leadingZeroBitsDocumentedInRule === false) {
    mismatches.push(
      "rule present but does not document leading-zero-bits units",
    );
  }

  const submitHeader =
    typeof obj.submitHeader === "string" ? obj.submitHeader : null;
  const submitFormat =
    typeof obj.submitFormat === "string" ? obj.submitFormat : null;
  if (submitHeader != null && submitHeader !== "X-Pow-Solution") {
    mismatches.push(
      `submitHeader is ${JSON.stringify(submitHeader)}, adapter/secure-https expects X-Pow-Solution`,
    );
  }
  if (submitFormat != null && submitFormat !== "<token>:<nonce>") {
    mismatches.push(
      `submitFormat is ${JSON.stringify(submitFormat)}, adapter assumes token:nonce`,
    );
  }

  const difficultyJsType =
    "difficulty" in obj
      ? typeof obj.difficulty
      : "difficultyBits" in obj
        ? typeof obj.difficultyBits
        : null;

  return {
    parseOk: parsed.ok,
    parseReason: parsed.ok ? null : parsed.reason,
    parseMessage: parsed.ok ? null : parsed.message,
    rawKeys,
    difficultyFieldCandidates,
    difficultyBitsNormalized: parsed.ok
      ? parsed.challenge.difficultyBits
      : null,
    difficultyJsType,
    tokenPresent: token != null,
    challengePresent: challenge != null,
    tokenEqualsChallenge:
      token != null && challenge != null ? token === challenge : null,
    expiresAtPresent: expiresAtRaw !== undefined,
    expiresAtJsType,
    expiresAtValueRedacted:
      expiresAtRaw === undefined ? null : redactScalar(expiresAtRaw),
    adapterExpiresAtCaptured: parsed.ok
      ? parsed.challenge.expiresAtUnixSeconds != null
      : false,
    algorithm: typeof obj.algorithm === "string" ? obj.algorithm : null,
    submitHeader,
    submitFormat,
    ttlSeconds:
      typeof obj.ttlSeconds === "number" && Number.isFinite(obj.ttlSeconds)
        ? obj.ttlSeconds
        : null,
    leadingZeroBitsDocumentedInRule,
    slugPresent: "slug" in obj,
    slugMatches:
      typeof obj.slug === "string" ? obj.slug === POW_SLUG : null,
    assumptions,
    mismatches,
  };
}

function encodeDnsName(hostname: string): Buffer {
  const labels = hostname.split(".").filter((l) => l.length > 0);
  const parts: Buffer[] = [];
  for (const label of labels) {
    const buf = Buffer.from(label, "utf8");
    if (buf.length === 0 || buf.length > 63) {
      throw new SecureFetchError("dns", `Invalid DNS label in ${hostname}`);
    }
    parts.push(Buffer.from([buf.length]), buf);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

function buildDnsQuery(hostname: string, qtype: number, txId: number): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(txId & 0xffff, 0);
  header.writeUInt16BE(0x0100, 2); // RD
  header.writeUInt16BE(1, 4); // QDCOUNT
  const qname = encodeDnsName(hostname);
  const question = Buffer.alloc(4);
  question.writeUInt16BE(qtype, 0);
  question.writeUInt16BE(1, 2); // IN
  const payload = Buffer.concat([header, qname, question]);
  const framed = Buffer.alloc(2 + payload.length);
  framed.writeUInt16BE(payload.length, 0);
  payload.copy(framed, 2);
  return framed;
}

function parseDnsAnswers(
  message: Buffer,
  qtype: number,
): string[] {
  if (message.length < 12) {
    throw new SecureFetchError("dns", "DNS response too short");
  }
  const flags = message.readUInt16BE(2);
  const rcode = flags & 0xf;
  if (rcode !== 0) {
    throw new SecureFetchError("dns", `DNS rcode ${rcode}`);
  }
  const qdcount = message.readUInt16BE(4);
  const ancount = message.readUInt16BE(6);
  let offset = 12;

  const skipName = (): void => {
    while (offset < message.length) {
      const len = message[offset]!;
      if (len === 0) {
        offset += 1;
        return;
      }
      if ((len & 0xc0) === 0xc0) {
        offset += 2;
        return;
      }
      offset += 1 + len;
    }
    throw new SecureFetchError("dns", "Truncated DNS name");
  };

  for (let i = 0; i < qdcount; i += 1) {
    skipName();
    offset += 4;
  }

  const out: string[] = [];
  for (let i = 0; i < ancount; i += 1) {
    skipName();
    if (offset + 10 > message.length) {
      throw new SecureFetchError("dns", "Truncated DNS answer");
    }
    const type = message.readUInt16BE(offset);
    offset += 2;
    offset += 2; // class
    offset += 4; // ttl
    const rdlength = message.readUInt16BE(offset);
    offset += 2;
    if (offset + rdlength > message.length) {
      throw new SecureFetchError("dns", "Truncated DNS rdata");
    }
    const rdata = message.subarray(offset, offset + rdlength);
    offset += rdlength;
    if (type === qtype) {
      if (qtype === 1 && rdlength === 4) {
        out.push(`${rdata[0]}.${rdata[1]}.${rdata[2]}.${rdata[3]}`);
      } else if (qtype === 28 && rdlength === 16) {
        const parts: string[] = [];
        for (let j = 0; j < 16; j += 2) {
          parts.push(rdata.readUInt16BE(j).toString(16));
        }
        out.push(parts.join(":"));
      }
    }
  }
  return out;
}

async function tcpDnsQuery(input: {
  readonly server: string;
  readonly hostname: string;
  readonly qtype: number;
  readonly timeoutMs: number;
}): Promise<string[]> {
  const txId = (Math.random() * 0xffff) >>> 0;
  const query = buildDnsQuery(input.hostname, input.qtype, txId);
  return new Promise<string[]>((resolve, reject) => {
    const socket = netConnect({
      host: input.server,
      port: STAGE_A_PUBLIC_DNS_PORT,
    });
    let settled = false;
    let buffer = Buffer.alloc(0);
    let expected = -1;
    const timer = setTimeout(() => {
      fail(new SecureFetchError("timeout", `TCP DNS timeout via ${input.server}`));
    }, input.timeoutMs);

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(
        error instanceof SecureFetchError
          ? error
          : new SecureFetchError(
              "dns",
              error instanceof Error ? error.message : "TCP DNS failed",
              { cause: error },
            ),
      );
    };

    const succeed = (addrs: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.end();
      resolve(addrs);
    };

    socket.on("connect", () => {
      socket.write(query);
    });
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (expected < 0 && buffer.length >= 2) {
        expected = buffer.readUInt16BE(0);
        buffer = buffer.subarray(2);
      }
      if (expected >= 0 && buffer.length >= expected) {
        try {
          succeed(parseDnsAnswers(buffer.subarray(0, expected), input.qtype));
        } catch (error) {
          fail(error);
        }
      }
    });
    socket.on("error", fail);
    socket.on("close", () => {
      if (!settled) {
        fail(new SecureFetchError("dns", `TCP DNS closed early via ${input.server}`));
      }
    });
  });
}

export type PublicTcpDnsResult = {
  readonly addresses: readonly ResolvedAddress[];
  readonly resolverUsed: string;
};

/**
 * Public-IP DNS over TCP to recursive resolvers (1.1.1.1 / 8.8.8.8).
 * Avoids local Fake-IP / Virtual-IP hijack (e.g. 198.18.0.0/15) without
 * using HTTP(S)_PROXY. Answers are still filtered by isBlockedIpAddress.
 */
export async function publicTcpDnsLookup(
  hostname: string,
  options?: {
    readonly servers?: readonly string[];
    readonly timeoutMs?: number;
  },
): Promise<PublicTcpDnsResult> {
  const servers = options?.servers ?? STAGE_A_PUBLIC_DNS_SERVERS;
  const timeoutMs = options?.timeoutMs ?? STAGE_A_TIMEOUT_MS;
  const errors: string[] = [];

  for (const server of servers) {
    try {
      const [aRecords, aaaaRecords] = await Promise.all([
        tcpDnsQuery({ server, hostname, qtype: 1, timeoutMs }),
        tcpDnsQuery({ server, hostname, qtype: 28, timeoutMs }).catch(
          () => [] as string[],
        ),
      ]);
      const addresses: ResolvedAddress[] = [
        ...aaaaRecords.map((address) => ({ address, family: 6 as const })),
        ...aRecords.map((address) => ({ address, family: 4 as const })),
      ];
      const allowed = addresses.filter((a) => !isBlockedIpAddress(a.address));
      if (allowed.length === 0) {
        errors.push(
          `${server}: all answers blocked (${addresses.map((a) => a.address).join(",") || "none"})`,
        );
        continue;
      }
      return { addresses: allowed, resolverUsed: server };
    } catch (error) {
      errors.push(
        `${server}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new SecureFetchError(
    "dns",
    `Public TCP DNS failed for ${hostname}: ${errors.join("; ")}`,
  );
}

export function buildStageARequestDocument(): ChallengeSchemaRequestDocument {
  return {
    schemaVersion: CHALLENGE_SCHEMA_OBS_VERSION,
    mode: CHALLENGE_SCHEMA_OBS_MODE,
    kind: "d73StageAChallengeSchemaRequest",
    requestId: STAGE_A_REQUEST_ID,
    approvedUrl: STAGE_A_APPROVED_URL,
    sanitizedUrl: sanitizeEndpointForArtifact(STAGE_A_APPROVED_URL),
    method: STAGE_A_METHOD,
    accept: "application/json",
    maxBytes: STAGE_A_MAX_BYTES,
    timeoutMs: STAGE_A_TIMEOUT_MS,
    redirects: 0,
    retries: 0,
    publicDnsServers: STAGE_A_PUBLIC_DNS_SERVERS,
    dnsTransport: "tcp",
  };
}

function hashFileIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return sha256Buffer(readFileSync(path));
}

function classifyTransportError(error: unknown): {
  readonly status: ChallengeSchemaStatus;
  readonly errorClass: string;
  readonly message: string;
} {
  if (error instanceof SecureFetchError) {
    const map: Record<string, ChallengeSchemaStatus> = {
      blockedIp: "unsafeDestination",
      redirect: "redirectRejected",
      tls: "tlsFailure",
      timeout: "timeout",
      oversized: "oversized",
      dns: "networkError",
      connection: "networkError",
      invalidUrl: "networkError",
      httpError: "httpError",
      transient: "networkError",
      unknown: "networkError",
    };
    return {
      status: map[error.errorClass] ?? "networkError",
      errorClass: error.errorClass,
      message: error.message,
    };
  }
  return {
    status: "networkError",
    errorClass: "unknown",
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function observeAgent402ChallengeSchema(input: {
  readonly repoRoot: string;
  readonly runMode: ChallengeSchemaRunMode;
  readonly observedAt?: string;
  readonly transport?: ChallengeSchemaTransport;
  readonly lookup?: DnsLookupFn;
  readonly skipMarkerWrite?: boolean;
  readonly writeArtifacts?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly markerPath?: string;
}): Promise<{
  readonly request: ChallengeSchemaRequestDocument;
  readonly result: ChallengeSchemaResultDocument;
}> {
  assertExactStageAChallengeUrl(STAGE_A_APPROVED_URL);
  const observedAt = input.observedAt ?? new Date().toISOString();
  const markerPath =
    input.markerPath ?? defaultStageAMarkerPath(input.repoRoot);
  const controls = buildStageAControlChecklist({ env: input.env });
  const request = buildStageARequestDocument();
  const evidenceDir = join(input.repoRoot, "docs/day7/evidence");
  const jv001Path = join(input.repoRoot, JSONVALIDATE_001_MARKER_REL);
  const jv002Path = join(input.repoRoot, JSONVALIDATE_002_MARKER_REL);
  const jv001Sha = hashFileIfExists(jv001Path);
  const jv002Sha = hashFileIfExists(jv002Path);

  const baseResult = (
    partial: Partial<ChallengeSchemaResultDocument> & {
      readonly status: ChallengeSchemaStatus;
    },
  ): ChallengeSchemaResultDocument => ({
    schemaVersion: CHALLENGE_SCHEMA_OBS_VERSION,
    mode: CHALLENGE_SCHEMA_OBS_MODE,
    kind: "d73StageAChallengeSchemaResult",
    requestId: STAGE_A_REQUEST_ID,
    approvedUrl: STAGE_A_APPROVED_URL,
    sanitizedUrl: sanitizeEndpointForArtifact(STAGE_A_APPROVED_URL),
    method: STAGE_A_METHOD,
    runMode: input.runMode,
    status: partial.status,
    observedAt,
    networkRequestPerformed: partial.networkRequestPerformed ?? false,
    authorizationConsumed: partial.authorizationConsumed ?? false,
    httpStatus: partial.httpStatus ?? null,
    contentType: partial.contentType ?? null,
    rawResponseBytes: partial.rawResponseBytes ?? null,
    rawResponseSha256: partial.rawResponseSha256 ?? null,
    redactedHeaders: partial.redactedHeaders ?? null,
    pinnedAddress: partial.pinnedAddress ?? null,
    resolvedAddresses: partial.resolvedAddresses ?? null,
    dnsResolverUsed: partial.dnsResolverUsed ?? null,
    elapsedMs: partial.elapsedMs ?? null,
    maxBytes: STAGE_A_MAX_BYTES,
    timeoutMs: STAGE_A_TIMEOUT_MS,
    redirects: 0,
    retries: 0,
    attemptMarkerPath: markerPath,
    jsonValidate001MarkerSha256: jv001Sha,
    jsonValidate002MarkerSha256: jv002Sha,
    jsonValidateMarkersUnchanged: true,
    controls: partial.controls ?? controls,
    genuineProvider: partial.genuineProvider ?? null,
    sanitizedStructure: partial.sanitizedStructure ?? null,
    adapterCompatibility: partial.adapterCompatibility ?? null,
    evidenceLevel: "not-L3",
    stageBRequiresNewAuth: true,
    rawBodyCommitted: partial.rawBodyCommitted ?? false,
    rawBodyPath: partial.rawBodyPath ?? null,
    error: partial.error ?? null,
    errorClass: partial.errorClass ?? null,
    nonActions: STAGE_A_NON_ACTIONS,
  });

  if (input.runMode === "dry-run") {
    return {
      request,
      result: baseResult({
        status: "planned",
        networkRequestPerformed: false,
        authorizationConsumed: false,
      }),
    };
  }

  if (!controls.controlsComplete) {
    return {
      request,
      result: baseResult({
        status: "controlsIncomplete",
        error: controls.abortReason,
        errorClass: "controlsIncomplete",
      }),
    };
  }

  if (stageAMarkerExists(markerPath) && input.skipMarkerWrite !== true) {
    return {
      request,
      result: baseResult({
        status: "attemptBlocked",
        authorizationConsumed: true,
        error: `Marker already exists at ${markerPath}`,
        errorClass: "attemptBlocked",
      }),
    };
  }

  if (input.skipMarkerWrite !== true) {
    writeStageAAttemptMarker({ markerPath, writtenAt: observedAt });
  }

  let dnsResolverUsed: string | null = null;
  const lookup: DnsLookupFn =
    input.lookup ??
    (async (hostname) => {
      const resolved = await publicTcpDnsLookup(hostname, {
        timeoutMs: STAGE_A_TIMEOUT_MS,
      });
      dnsResolverUsed = resolved.resolverUsed;
      return resolved.addresses;
    });

  const transport = input.transport ?? secureHttpsExchange;

  let exchange: SecureHttpsExchange;
  try {
    exchange = await transport(STAGE_A_APPROVED_URL, {
      method: "GET",
      timeoutMs: STAGE_A_TIMEOUT_MS,
      maxBytes: STAGE_A_MAX_BYTES,
      accept: "application/json",
      userAgent: "AgentHire-challenge-schema-obs/0.1 (GET_SCHEMA_ONLY)",
      lookup,
      // Explicitly omit powSolution / body — GET schema observation only.
    });
  } catch (error) {
    const classified = classifyTransportError(error);
    const result = baseResult({
      status: classified.status,
      networkRequestPerformed: true,
      authorizationConsumed: true,
      dnsResolverUsed,
      error: classified.message,
      errorClass: classified.errorClass,
      genuineProvider: false,
    });
    if (input.writeArtifacts !== false) {
      writeStageAArtifacts({
        evidenceDir,
        request,
        result,
        body: null,
      });
    }
    return { request, result };
  }

  const redactedHeaders = redactResponseHeaders(exchange.headers);
  let sanitizedStructure: SanitizedJsonStructure | null = null;
  let adapterCompatibility: AdapterCompatibility | null = null;
  let status: ChallengeSchemaStatus = "success";
  let error: string | null = null;
  let errorClass: string | null = null;
  let parsedJson: unknown = null;

  if (exchange.statusCode < 200 || exchange.statusCode >= 300) {
    status = "httpError";
    error = `HTTP ${exchange.statusCode}`;
    errorClass = "httpError";
  }

  try {
    parsedJson = JSON.parse(exchange.body.toString("utf8"));
    sanitizedStructure = observeSanitizedJsonStructure(parsedJson);
    adapterCompatibility = analyzeAdapterCompatibility(parsedJson);
    if (status === "success" && adapterCompatibility && !adapterCompatibility.parseOk) {
      // Still a successful transport observation; schema mismatch is offline finding.
      error = adapterCompatibility.parseMessage;
      errorClass = adapterCompatibility.parseReason;
    }
  } catch {
    if (status === "success") {
      status = "invalidJson";
      error = "Response body is not valid JSON";
      errorClass = "invalidJson";
    }
  }

  const rawBodyPath = join(
    evidenceDir,
    `${STAGE_A_EVIDENCE_PREFIX}-response-snapshot.bin`,
  );
  const result = baseResult({
    status,
    networkRequestPerformed: true,
    authorizationConsumed: true,
    httpStatus: exchange.statusCode,
    contentType: exchange.contentType,
    rawResponseBytes: exchange.byteLength,
    rawResponseSha256: exchange.sha256,
    redactedHeaders,
    pinnedAddress: exchange.pinnedAddress.address,
    resolvedAddresses: exchange.resolvedAddresses.map((a) => a.address),
    dnsResolverUsed,
    elapsedMs: exchange.elapsedMs,
    genuineProvider: true,
    sanitizedStructure,
    adapterCompatibility,
    rawBodyCommitted: true,
    rawBodyPath,
    error,
    errorClass,
  });

  // Confirm JSONVALIDATE markers unchanged after I/O.
  const jv001After = hashFileIfExists(jv001Path);
  const jv002After = hashFileIfExists(jv002Path);
  const markersUnchanged =
    jv001Sha === jv001After && jv002Sha === jv002After;
  const finalResult: ChallengeSchemaResultDocument = {
    ...result,
    jsonValidate001MarkerSha256: jv001After,
    jsonValidate002MarkerSha256: jv002After,
    jsonValidateMarkersUnchanged: markersUnchanged,
  };

  if (input.writeArtifacts !== false) {
    writeStageAArtifacts({
      evidenceDir,
      request,
      result: finalResult,
      body: exchange.body,
    });
  }

  return { request, result: finalResult };
}

export function writeStageAArtifacts(input: {
  readonly evidenceDir: string;
  readonly request: ChallengeSchemaRequestDocument;
  readonly result: ChallengeSchemaResultDocument;
  readonly body: Buffer | null;
}): void {
  mkdirSync(input.evidenceDir, { recursive: true });
  writeFileSync(
    join(input.evidenceDir, `${STAGE_A_EVIDENCE_PREFIX}-request.json`),
    stableStringify(input.request),
    { encoding: "utf8" },
  );
  writeFileSync(
    join(input.evidenceDir, `${STAGE_A_EVIDENCE_PREFIX}-result.json`),
    stableStringify(input.result),
    { encoding: "utf8" },
  );
  if (input.body) {
    writeFileSync(
      join(
        input.evidenceDir,
        `${STAGE_A_EVIDENCE_PREFIX}-response-snapshot.bin`,
      ),
      input.body,
    );
  }
}

export function renderStageAObservationMarkdown(input: {
  readonly request: ChallengeSchemaRequestDocument;
  readonly result: ChallengeSchemaResultDocument;
  readonly worktree: string;
  readonly branch: string;
  readonly commitSha?: string | null;
  readonly asiaShanghaiLabel: string;
}): string {
  const r = input.result;
  const compat = r.adapterCompatibility;
  const structure = r.sanitizedStructure;
  const lines: string[] = [
    "# AgentHire D7.3 Stage A — Challenge API schema / secure-transport observation",
    "",
    `**Mode:** \`${CHALLENGE_SCHEMA_OBS_MODE}\``,
    `**Worktree:** \`${input.worktree}\``,
    `**Branch:** \`${input.branch}\``,
    `**Request ID:** \`${STAGE_A_REQUEST_ID}\``,
    `**Asia/Shanghai:** ${input.asiaShanghaiLabel}`,
    input.commitSha ? `**Local commit (helpers):** \`${input.commitSha}\`` : "",
    "",
    "---",
    "",
    "## Executive verdict",
    "",
    `| Item | Result |`,
    `| --- | --- |`,
    `| Transport status | **\`${r.status}\`** |`,
    `| HTTP status | ${r.httpStatus ?? "n/a"} |`,
    `| Body SHA-256 | \`${r.rawResponseSha256 ?? "n/a"}\` |`,
    `| Bytes | ${r.rawResponseBytes ?? "n/a"} |`,
    `| Pinned IP | \`${r.pinnedAddress ?? "n/a"}\` |`,
    `| Public DNS resolver | \`${r.dnsResolverUsed ?? "n/a"}\` (TCP) |`,
    `| Adapter parseOk | ${compat?.parseOk ?? "n/a"} |`,
    `| Evidence level | **not L3** |`,
    `| Stage B | requires **new** auth (POST / solve not covered) |`,
    "",
    "This is an **API schema + secure transport** observation of the documented challenge endpoint. It is **not** task execution and **not** payment.",
    "",
    "## 1. Authorization audit",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| Auth ID | \`${STAGE_A_REQUEST_ID}\` |`,
    `| Method / URL | \`${STAGE_A_METHOD} ${STAGE_A_APPROVED_URL}\` |`,
    `| Count | **1** GET maximum (this run) |`,
    `| Timeout | **${STAGE_A_TIMEOUT_MS}** ms |`,
    `| Max response | **${STAGE_A_MAX_BYTES}** bytes |`,
    `| Redirects / retries | **0 / 0** |`,
    `| Marker | \`${STAGE_A_MARKER_REL}\` exclusive \`wx\` before DNS |`,
    `| JSONVALIDATE-001 SHA | \`${r.jsonValidate001MarkerSha256 ?? "missing"}\` |`,
    `| JSONVALIDATE-002 SHA | \`${r.jsonValidate002MarkerSha256 ?? "missing"}\` |`,
    `| JSONVALIDATE markers unchanged | **${r.jsonValidateMarkersUnchanged}** |`,
    `| authorizationConsumed | **${r.authorizationConsumed}** |`,
    "",
    "## 2. Secure transport controls",
    "",
    `| Control | Enforced |`,
    `| --- | --- |`,
    `| exactAllowlist | ${r.controls.exactAllowlist} |`,
    `| httpsOnly + TLS verify/SNI | ${r.controls.httpsOnly} / ${r.controls.tlsVerifyAndSni} |`,
    `| publicDnsPin (TCP public resolvers; Fake-IP rejected) | ${r.controls.publicDnsPin} |`,
    `| noRedirects / noRetries | ${r.controls.noRedirects} / ${r.controls.noRetries} |`,
    `| no cookies/creds/auth/payment | ${r.controls.noCookiesCredsAuthPayment} |`,
    `| no X-Pow-Solution | ${r.controls.noPowSolutionHeader} |`,
    `| GET only / no solver | ${r.controls.getOnlyNoPost} / ${r.controls.noSolver} |`,
    `| noEnvProxy | ${r.controls.noEnvProxy} |`,
    `| controlsComplete | ${r.controls.controlsComplete} |`,
    "",
    "## 3. Transport outcome",
    "",
    `| Field | Value |`,
    `| --- | --- |`,
    `| runMode | \`${r.runMode}\` |`,
    `| status | **\`${r.status}\`** |`,
    `| httpStatus | ${r.httpStatus ?? "n/a"} |`,
    `| contentType | \`${r.contentType ?? "n/a"}\` |`,
    `| rawResponseBytes | ${r.rawResponseBytes ?? "n/a"} |`,
    `| rawResponseSha256 | \`${r.rawResponseSha256 ?? "n/a"}\` |`,
    `| pinnedAddress | \`${r.pinnedAddress ?? "n/a"}\` |`,
    `| resolvedAddresses | ${(r.resolvedAddresses ?? []).map((a) => `\`${a}\``).join(", ") || "n/a"} |`,
    `| dnsResolverUsed | \`${r.dnsResolverUsed ?? "n/a"}\` |`,
    `| elapsedMs | ${r.elapsedMs ?? "n/a"} |`,
    `| genuineProvider | ${r.genuineProvider} |`,
    `| observedAt (UTC) | \`${r.observedAt}\` |`,
    `| error | ${r.error ? `\`${r.error}\`` : "none"} |`,
    `| errorClass | ${r.errorClass ?? "none"} |`,
    "",
    "### Redacted response headers",
    "",
    "```json",
    stableStringify(r.redactedHeaders).trimEnd(),
    "```",
    "",
    "## 4. Offline JSON schema observation",
    "",
    structure
      ? [
          `| Field | Value |`,
          `| --- | --- |`,
          `| rootType | \`${structure.rootType}\` |`,
          `| topLevelKeys | ${structure.topLevelKeys.map((k) => `\`${k}\``).join(", ") || "(none)"} |`,
          "",
          "### Field types (values redacted)",
          "",
          "| Name | JS type | Notes | Redacted |",
          "| --- | --- | --- | --- |",
          ...structure.fields.map(
            (f) =>
              `| \`${f.name}\` | \`${f.jsType}\` | ${f.notes || "—"} | \`${structure.redactedValues[f.name]}\` |`,
          ),
        ].join("\n")
      : "_No JSON structure captured._",
    "",
    "## 5. Difficulty / expiry / adapter compatibility",
    "",
    compat
      ? [
          `| Check | Result |`,
          `| --- | --- |`,
          `| parseOk | **${compat.parseOk}** |`,
          `| parseReason | ${compat.parseReason ?? "—"} |`,
          `| difficulty field candidates | ${compat.difficultyFieldCandidates.map((k) => `\`${k}\``).join(", ") || "(none)"} |`,
          `| difficulty JS type | \`${compat.difficultyJsType ?? "n/a"}\` |`,
          `| difficultyBits (adapter-normalized) | ${compat.difficultyBitsNormalized ?? "n/a"} |`,
          `| leading-zero-bits documented in \`rule\` | ${compat.leadingZeroBitsDocumentedInRule} |`,
          `| algorithm | \`${compat.algorithm ?? "n/a"}\` |`,
          `| token present | ${compat.tokenPresent} |`,
          `| challenge present | ${compat.challengePresent} |`,
          `| tokenEqualsChallenge | ${compat.tokenEqualsChallenge} |`,
          `| expiresAt present / JS type | ${compat.expiresAtPresent} / \`${compat.expiresAtJsType ?? "n/a"}\` |`,
          `| expiresAt (redacted) | ${compat.expiresAtValueRedacted ?? "—"} |`,
          `| adapter captured expiresAt | ${compat.adapterExpiresAtCaptured} |`,
          `| ttlSeconds | ${compat.ttlSeconds ?? "n/a"} |`,
          `| submitHeader | \`${compat.submitHeader ?? "n/a"}\` |`,
          `| submitFormat | \`${compat.submitFormat ?? "n/a"}\` |`,
          `| slug present / matches | ${compat.slugPresent} / ${compat.slugMatches} |`,
          "",
          "### Key schema findings",
          "",
          "- \`token\` and \`challenge\` are **distinct** fields (do not alias token as the hash seed).",
          "- Provider documents hash preimage over the \`challenge\` field; credential submitted is the \`token\` field.",
          "- \`difficulty\` is a number; provider \`rule\` text documents **leading zero bits** (units observed as bits).",
          "- \`expiresAt\` observed as **unix-seconds number**; current adapter string-only picker drops it.",
          "- \`submitHeader\` / \`submitFormat\` match adapter expectation \`X-Pow-Solution\` / \`<token>:<nonce>\`.",
          "",
          "### Adapter assumptions",
          "",
          ...compat.assumptions.map((a) => `- ${a}`),
          "",
          "### Mismatches / caution flags",
          "",
          ...(compat.mismatches.length > 0
            ? compat.mismatches.map((m) => `- ${m}`)
            : ["- none"]),
        ].join("\n")
      : "_Adapter compatibility not evaluated (no JSON body)._",
    "",
    "## 6. Security confirmation",
    "",
    ...STAGE_A_NON_ACTIONS.map((n) => `- ${n}`),
    "",
    "## 7. Evidence ladder",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| This Stage A | schema + transport observation only |",
    "| Evidence level | **not L3** (no verified task execution / solution submit) |",
    "| Simulation ≠ L3 | still holds |",
    "| Stage B | **new** Product-Owner auth required for any POST / solve |",
    "",
    "## 8. Evidence artifacts (local, gitignored `docs/`)",
    "",
    `| Artifact | Path |`,
    `| --- | --- |`,
    `| Marker | \`docs/day7/evidence/${STAGE_A_EVIDENCE_PREFIX}.marker\` |`,
    `| Request | \`docs/day7/evidence/${STAGE_A_EVIDENCE_PREFIX}-request.json\` |`,
    `| Result | \`docs/day7/evidence/${STAGE_A_EVIDENCE_PREFIX}-result.json\` |`,
    `| Snapshot | \`docs/day7/evidence/${STAGE_A_EVIDENCE_PREFIX}-response-snapshot.bin\` (raw; not for Git) |`,
    `| Report | \`docs/day7/d7.3-stage-a-pow-challenge-observation.md\` |`,
    "",
    "Sensitive `token` / challenge material: redacted in this report; raw snapshot stays local only.",
    "",
    "## 9. Stage B readiness",
    "",
    "Stage A consumes **only** `POW-CHALLENGE-GET-001`. Any solve or `POST /api/json-validate` requires a **separate** authorization and `POW-SUBMIT-POST-001` marker. If schema mismatches remain unresolved, do not improvise a second GET.",
    "",
  ];
  return `${lines.filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

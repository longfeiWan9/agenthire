/**
 * AgentHire ERC-8004 registration metadata resolution (D3.5).
 *
 * Mode: READ_ONLY / NO_SIGNING
 * - Fetches only exact approved HTTPS URLs
 * - Parses registration JSON offline; never calls advertised service endpoints
 * - Advertised services are claims with verificationStatus: "notChecked"
 * - Distinguishes onChainTokenURI / approvedFetchURI / displayURI
 */

import { createHash } from "node:crypto";
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  agentHireNetworksByChainId,
  type AgentHireNetworkConfig,
} from "../config/chains.ts";
import type { SupportedRpcChainId } from "../config/rpc.ts";
import {
  SECURE_FETCH_MAX_CONCURRENCY,
  SecureFetchError,
  type SecureFetchErrorClass,
  type SecureHttpsDeps,
  type SecureHttpsSuccess,
  createConcurrencyLimiter,
  secureHttpsGetWithRetry,
} from "./secure-https.ts";

export const REGISTRATION_METADATA_SCHEMA_VERSION = "1.0" as const;

/** EIP-8004 registration document type URI (v1). */
export const ERC8004_REGISTRATION_TYPE_V1 =
  "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" as const;

/**
 * Exact approved fetch URLs only — substring / prefix / host-only matches rejected.
 * These match the live D3.4 on-chain tokenURI strings for the three target agents.
 */
export const APPROVED_REGISTRATION_METADATA_URLS = [
  "https://onchainagentintel.io/agent.json",
  "https://agent402.tools/.well-known/agent-registration.json",
  "https://agents.quantjourney.cloud/.well-known/agent-registration.json",
] as const;

export type ApprovedRegistrationMetadataUrl =
  (typeof APPROVED_REGISTRATION_METADATA_URLS)[number];

export const APPROVED_URL_SET: ReadonlySet<string> = new Set(
  APPROVED_REGISTRATION_METADATA_URLS,
);

/** D3.5 targets: identity snapshot context + approved HTTPS document. */
export const D35_METADATA_TARGETS = [
  {
    chainId: BASE_MAINNET_CHAIN_ID,
    agentId: 19_353n,
    onChainTokenURI: "https://onchainagentintel.io/agent.json",
    approvedFetchURI: "https://onchainagentintel.io/agent.json",
  },
  {
    chainId: BASE_MAINNET_CHAIN_ID,
    agentId: 94_639n,
    onChainTokenURI:
      "https://agent402.tools/.well-known/agent-registration.json",
    approvedFetchURI:
      "https://agent402.tools/.well-known/agent-registration.json",
  },
  {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    agentId: 9_136n,
    onChainTokenURI:
      "https://agents.quantjourney.cloud/.well-known/agent-registration.json",
    approvedFetchURI:
      "https://agents.quantjourney.cloud/.well-known/agent-registration.json",
  },
] as const;

export type D35MetadataTarget = (typeof D35_METADATA_TARGETS)[number];

export type RegistrationMetadataStatus =
  | "success"
  | "invalidSchema"
  | "fetchFailed"
  | "rejected"
  | "inconclusive";

export type ServiceVerificationStatus = "notChecked";

export type AdvertisedServiceClaim = {
  readonly name: string;
  readonly endpoint: string;
  readonly version: string | null;
  readonly skills: readonly string[] | null;
  readonly domains: readonly string[] | null;
  /** Never verified in D3.5 — claims only. */
  readonly verificationStatus: ServiceVerificationStatus;
};

export type ParsedRegistrationDocument = {
  readonly type: string | null;
  readonly name: string | null;
  readonly description: string | null;
  readonly image: string | null;
  readonly x402Support: boolean | null;
  readonly active: boolean | null;
  readonly registrations: readonly {
    readonly agentId: string;
    readonly agentRegistry: string;
  }[];
  readonly supportedTrust: readonly string[] | null;
  readonly services: readonly AdvertisedServiceClaim[];
  /** True when services were taken from legacy `endpoints` field. */
  readonly usedLegacyEndpointsField: boolean;
};

export type RegistrationValidationIssue = {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
};

export type RegistrationMetadataEvidence = {
  readonly schemaVersion: typeof REGISTRATION_METADATA_SCHEMA_VERSION;
  readonly chainId: SupportedRpcChainId;
  readonly caip2: `eip155:${SupportedRpcChainId}`;
  readonly networkName: string;
  readonly registryAddress: string;
  /** Decimal string agent id. */
  readonly agentId: string;
  /** On-chain tokenURI string (may differ from fetch URI in general). */
  readonly onChainTokenURI: string;
  /** Exact allowlisted URL that was authorized for fetch. */
  readonly approvedFetchURI: string;
  /** Sanitized URI for human display / logs. */
  readonly displayURI: string;
  readonly status: RegistrationMetadataStatus;
  readonly observedAt: string;
  readonly httpStatus: number | null;
  readonly contentType: string | null;
  /** SHA-256 hex of raw response body bytes (null when no body). */
  readonly contentSha256: string | null;
  readonly byteLength: number | null;
  readonly pinnedAddress: string | null;
  readonly resolvedAddresses: readonly string[] | null;
  readonly elapsedMs: number | null;
  readonly fetchErrorClass: SecureFetchErrorClass | null;
  readonly error: string | null;
  readonly validationIssues: readonly RegistrationValidationIssue[];
  readonly registration: ParsedRegistrationDocument | null;
  readonly advertisedServices: readonly AdvertisedServiceClaim[];
};

export type MetadataFetchFn = (
  url: string,
  deps?: SecureHttpsDeps,
) => Promise<SecureHttpsSuccess>;

function stringifyBigInt(value: bigint): string {
  return value.toString(10);
}

/**
 * Exact-match allowlist gate. Rejects trailing-slash variants, http:,
 * added query/hash, host-only, and any non-listed URL.
 */
export function isApprovedRegistrationMetadataUrl(url: string): boolean {
  return APPROVED_URL_SET.has(url);
}

export function assertApprovedRegistrationMetadataUrl(
  url: string,
): asserts url is ApprovedRegistrationMetadataUrl {
  if (!isApprovedRegistrationMetadataUrl(url)) {
    throw new SecureFetchError(
      "invalidUrl",
      `URL not on exact allowlist: ${url}`,
    );
  }
}

/**
 * Display-safe URI: strip credentials, query, and hash. Does not change path.
 */
export function toDisplayURI(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed
      .replace(/[?&]([^=&#]+)=([^&#]*)/g, "[?REDACTED]")
      .replace(/\b(Bearer\s+)\S+/gi, "$1[REDACTED]");
  }
}

export function sha256Hex(body: Buffer | string): string {
  return createHash("sha256").update(body).digest("hex");
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => typeof item === "string")) return null;
  return value as string[];
}

function parseAgentIdField(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return value.trim();
  }
  if (typeof value === "bigint" && value >= 0n) {
    return value.toString(10);
  }
  return null;
}

function parseServiceClaim(
  value: unknown,
  index: number,
  issues: RegistrationValidationIssue[],
): AdvertisedServiceClaim | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    issues.push({
      severity: "error",
      code: "service_not_object",
      message: `services[${index}] must be an object`,
    });
    return null;
  }
  const obj = value as Record<string, unknown>;
  const name = asNonEmptyString(obj.name);
  const endpoint = asNonEmptyString(obj.endpoint);
  if (!name) {
    issues.push({
      severity: "error",
      code: "service_missing_name",
      message: `services[${index}].name is required`,
    });
  }
  if (!endpoint) {
    issues.push({
      severity: "error",
      code: "service_missing_endpoint",
      message: `services[${index}].endpoint is required`,
    });
  }
  if (!name || !endpoint) return null;

  const version =
    obj.version === undefined || obj.version === null
      ? null
      : typeof obj.version === "string"
        ? obj.version
        : typeof obj.version === "number"
          ? String(obj.version)
          : null;
  if (obj.version != null && version == null) {
    issues.push({
      severity: "warning",
      code: "service_version_ignored",
      message: `services[${index}].version is not a string/number; ignored`,
    });
  }

  const skills = asStringArray(obj.skills);
  if (obj.skills != null && skills == null) {
    issues.push({
      severity: "warning",
      code: "service_skills_ignored",
      message: `services[${index}].skills must be string[]; ignored`,
    });
  }
  const domains = asStringArray(obj.domains);
  if (obj.domains != null && domains == null) {
    issues.push({
      severity: "warning",
      code: "service_domains_ignored",
      message: `services[${index}].domains must be string[]; ignored`,
    });
  }

  return {
    name,
    endpoint,
    version,
    skills,
    domains,
    verificationStatus: "notChecked",
  };
}

/**
 * Offline JSON + ERC-8004 registration validation.
 * Does not fetch anything; does not contact service endpoints.
 */
export function parseAndValidateRegistrationJson(
  raw: string | Buffer,
): {
  readonly ok: boolean;
  readonly document: ParsedRegistrationDocument | null;
  readonly issues: readonly RegistrationValidationIssue[];
  readonly parsedJson: unknown;
} {
  const issues: RegistrationValidationIssue[] = [];
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(
      typeof raw === "string" ? raw : raw.toString("utf8"),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "JSON parse failed";
    return {
      ok: false,
      document: null,
      issues: [
        {
          severity: "error",
          code: "invalid_json",
          message: `Body is not valid JSON: ${message}`,
        },
      ],
      parsedJson: null,
    };
  }

  if (
    parsedJson == null ||
    typeof parsedJson !== "object" ||
    Array.isArray(parsedJson)
  ) {
    return {
      ok: false,
      document: null,
      issues: [
        {
          severity: "error",
          code: "not_object",
          message: "Registration document must be a JSON object",
        },
      ],
      parsedJson,
    };
  }

  const root = parsedJson as Record<string, unknown>;
  const type = asNonEmptyString(root.type);
  if (!type) {
    issues.push({
      severity: "error",
      code: "missing_type",
      message: "Missing required field: type",
    });
  } else if (type !== ERC8004_REGISTRATION_TYPE_V1) {
    issues.push({
      severity: "error",
      code: "unexpected_type",
      message: `type must be ${ERC8004_REGISTRATION_TYPE_V1}`,
    });
  }

  const name = asNonEmptyString(root.name);
  if (!name) {
    issues.push({
      severity: "warning",
      code: "missing_name",
      message: "Missing recommended field: name",
    });
  }
  const description = asNonEmptyString(root.description);
  if (!description) {
    issues.push({
      severity: "warning",
      code: "missing_description",
      message: "Missing recommended field: description",
    });
  }
  const image = asNonEmptyString(root.image);
  if (!image) {
    issues.push({
      severity: "warning",
      code: "missing_image",
      message: "Missing recommended field: image",
    });
  }

  let usedLegacyEndpointsField = false;
  let serviceSource: unknown = root.services;
  if (serviceSource == null && root.endpoints != null) {
    usedLegacyEndpointsField = true;
    serviceSource = root.endpoints;
    issues.push({
      severity: "warning",
      code: "legacy_endpoints_field",
      message:
        "Using legacy `endpoints` field; prefer EIP-8004 `services`",
    });
  }

  const services: AdvertisedServiceClaim[] = [];
  if (serviceSource == null) {
    issues.push({
      severity: "warning",
      code: "missing_services",
      message: "Missing services array",
    });
  } else if (!Array.isArray(serviceSource)) {
    issues.push({
      severity: "error",
      code: "services_not_array",
      message: "services must be an array",
    });
  } else if (serviceSource.length === 0) {
    issues.push({
      severity: "warning",
      code: "empty_services",
      message: "services array is empty",
    });
  } else {
    serviceSource.forEach((item, index) => {
      const claim = parseServiceClaim(item, index, issues);
      if (claim) services.push(claim);
    });
  }

  const registrations: {
    agentId: string;
    agentRegistry: string;
  }[] = [];
  if (root.registrations != null) {
    if (!Array.isArray(root.registrations)) {
      issues.push({
        severity: "error",
        code: "registrations_not_array",
        message: "registrations must be an array",
      });
    } else {
      root.registrations.forEach((item, index) => {
        if (item == null || typeof item !== "object" || Array.isArray(item)) {
          issues.push({
            severity: "error",
            code: "registration_not_object",
            message: `registrations[${index}] must be an object`,
          });
          return;
        }
        const reg = item as Record<string, unknown>;
        const agentId = parseAgentIdField(reg.agentId);
        const agentRegistry = asNonEmptyString(reg.agentRegistry);
        if (!agentId || !agentRegistry) {
          issues.push({
            severity: "error",
            code: "registration_incomplete",
            message: `registrations[${index}] requires agentId and agentRegistry`,
          });
          return;
        }
        registrations.push({ agentId, agentRegistry });
      });
    }
  }

  const supportedTrust = asStringArray(root.supportedTrust);
  if (root.supportedTrust != null && supportedTrust == null) {
    issues.push({
      severity: "warning",
      code: "supported_trust_ignored",
      message: "supportedTrust must be string[]; ignored",
    });
  }

  const document: ParsedRegistrationDocument = {
    type,
    name,
    description,
    image,
    x402Support: asBoolean(root.x402Support),
    active: asBoolean(root.active),
    registrations,
    supportedTrust,
    services,
    usedLegacyEndpointsField,
  };

  const hasErrors = issues.some((i) => i.severity === "error");
  return {
    ok: !hasErrors,
    document,
    issues,
    parsedJson,
  };
}

export function buildRegistrationMetadataEvidence(input: {
  readonly network: AgentHireNetworkConfig;
  readonly agentId: bigint;
  readonly onChainTokenURI: string;
  readonly approvedFetchURI: string;
  readonly observedAt?: string;
  readonly fetch?:
    | { readonly ok: true; readonly result: SecureHttpsSuccess }
    | {
        readonly ok: false;
        readonly errorClass: SecureFetchErrorClass;
        readonly error: string;
      };
  readonly validation?: {
    readonly ok: boolean;
    readonly document: ParsedRegistrationDocument | null;
    readonly issues: readonly RegistrationValidationIssue[];
  };
}): RegistrationMetadataEvidence {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const displayURI = toDisplayURI(input.approvedFetchURI);

  if (!isApprovedRegistrationMetadataUrl(input.approvedFetchURI)) {
    return {
      schemaVersion: REGISTRATION_METADATA_SCHEMA_VERSION,
      chainId: input.network.chainId,
      caip2: input.network.caip2,
      networkName: input.network.name,
      registryAddress: input.network.identityRegistry,
      agentId: stringifyBigInt(input.agentId),
      onChainTokenURI: input.onChainTokenURI,
      approvedFetchURI: input.approvedFetchURI,
      displayURI,
      status: "rejected",
      observedAt,
      httpStatus: null,
      contentType: null,
      contentSha256: null,
      byteLength: null,
      pinnedAddress: null,
      resolvedAddresses: null,
      elapsedMs: null,
      fetchErrorClass: "invalidUrl",
      error: `approvedFetchURI is not allowlisted: ${input.approvedFetchURI}`,
      validationIssues: [],
      registration: null,
      advertisedServices: [],
    };
  }

  if (!input.fetch) {
    return {
      schemaVersion: REGISTRATION_METADATA_SCHEMA_VERSION,
      chainId: input.network.chainId,
      caip2: input.network.caip2,
      networkName: input.network.name,
      registryAddress: input.network.identityRegistry,
      agentId: stringifyBigInt(input.agentId),
      onChainTokenURI: input.onChainTokenURI,
      approvedFetchURI: input.approvedFetchURI,
      displayURI,
      status: "inconclusive",
      observedAt,
      httpStatus: null,
      contentType: null,
      contentSha256: null,
      byteLength: null,
      pinnedAddress: null,
      resolvedAddresses: null,
      elapsedMs: null,
      fetchErrorClass: null,
      error: "No fetch result provided",
      validationIssues: [],
      registration: null,
      advertisedServices: [],
    };
  }

  if (!input.fetch.ok) {
    const status: RegistrationMetadataStatus =
      input.fetch.errorClass === "timeout" ||
      input.fetch.errorClass === "transient"
        ? "inconclusive"
        : "fetchFailed";
    return {
      schemaVersion: REGISTRATION_METADATA_SCHEMA_VERSION,
      chainId: input.network.chainId,
      caip2: input.network.caip2,
      networkName: input.network.name,
      registryAddress: input.network.identityRegistry,
      agentId: stringifyBigInt(input.agentId),
      onChainTokenURI: input.onChainTokenURI,
      approvedFetchURI: input.approvedFetchURI,
      displayURI,
      status,
      observedAt,
      httpStatus: null,
      contentType: null,
      contentSha256: null,
      byteLength: null,
      pinnedAddress: null,
      resolvedAddresses: null,
      elapsedMs: null,
      fetchErrorClass: input.fetch.errorClass,
      error: input.fetch.error,
      validationIssues: [],
      registration: null,
      advertisedServices: [],
    };
  }

  const result = input.fetch.result;
  const validation =
    input.validation ??
    parseAndValidateRegistrationJson(result.body);

  const status: RegistrationMetadataStatus = validation.ok
    ? "success"
    : "invalidSchema";

  return {
    schemaVersion: REGISTRATION_METADATA_SCHEMA_VERSION,
    chainId: input.network.chainId,
    caip2: input.network.caip2,
    networkName: input.network.name,
    registryAddress: input.network.identityRegistry,
    agentId: stringifyBigInt(input.agentId),
    onChainTokenURI: input.onChainTokenURI,
    approvedFetchURI: input.approvedFetchURI,
    displayURI,
    status,
    observedAt,
    httpStatus: result.statusCode,
    contentType: result.contentType,
    contentSha256: result.sha256,
    byteLength: result.byteLength,
    pinnedAddress: result.pinnedAddress.address,
    resolvedAddresses: result.resolvedAddresses.map((a) => a.address),
    elapsedMs: result.elapsedMs,
    fetchErrorClass: null,
    error: validation.ok
      ? null
      : validation.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.message)
          .join("; ") || "schema validation failed",
    validationIssues: validation.issues,
    registration: validation.document,
    advertisedServices: validation.document?.services ?? [],
  };
}

/**
 * Resolve one approved registration metadata document securely.
 */
export async function resolveRegistrationMetadata(input: {
  readonly chainId: SupportedRpcChainId;
  readonly agentId: bigint;
  readonly onChainTokenURI: string;
  readonly approvedFetchURI: string;
  readonly network?: AgentHireNetworkConfig;
  readonly observedAt?: string;
  readonly fetchFn?: MetadataFetchFn;
  readonly fetchDeps?: SecureHttpsDeps;
}): Promise<RegistrationMetadataEvidence> {
  const network = input.network ?? agentHireNetworksByChainId[input.chainId];
  const observedAt = input.observedAt ?? new Date().toISOString();
  const fetchFn = input.fetchFn ?? secureHttpsGetWithRetry;

  if (!isApprovedRegistrationMetadataUrl(input.approvedFetchURI)) {
    return buildRegistrationMetadataEvidence({
      network,
      agentId: input.agentId,
      onChainTokenURI: input.onChainTokenURI,
      approvedFetchURI: input.approvedFetchURI,
      observedAt,
    });
  }

  // Defense in depth: on-chain URI must equal the approved fetch URI for D3.5.
  if (input.onChainTokenURI !== input.approvedFetchURI) {
    return buildRegistrationMetadataEvidence({
      network,
      agentId: input.agentId,
      onChainTokenURI: input.onChainTokenURI,
      approvedFetchURI: input.approvedFetchURI,
      observedAt,
      fetch: {
        ok: false,
        errorClass: "invalidUrl",
        error: `onChainTokenURI does not match approvedFetchURI (on-chain=${input.onChainTokenURI})`,
      },
    });
  }

  try {
    const result = await fetchFn(input.approvedFetchURI, input.fetchDeps);
    return buildRegistrationMetadataEvidence({
      network,
      agentId: input.agentId,
      onChainTokenURI: input.onChainTokenURI,
      approvedFetchURI: input.approvedFetchURI,
      observedAt,
      fetch: { ok: true, result },
    });
  } catch (error) {
    const classified =
      error instanceof SecureFetchError
        ? error
        : new SecureFetchError(
            "unknown",
            error instanceof Error ? error.message : String(error),
            { cause: error },
          );
    return buildRegistrationMetadataEvidence({
      network,
      agentId: input.agentId,
      onChainTokenURI: input.onChainTokenURI,
      approvedFetchURI: input.approvedFetchURI,
      observedAt,
      fetch: {
        ok: false,
        errorClass: classified.errorClass,
        error: classified.message,
      },
    });
  }
}

/**
 * Batch-resolve metadata for the D3.5 target set.
 * Continues on per-document failure. Max concurrency 2.
 */
export async function resolveRegistrationMetadataBatch(input?: {
  readonly targets?: readonly {
    readonly chainId: SupportedRpcChainId;
    readonly agentId: bigint;
    readonly onChainTokenURI: string;
    readonly approvedFetchURI: string;
  }[];
  readonly observedAt?: string;
  readonly fetchFn?: MetadataFetchFn;
  readonly fetchDeps?: SecureHttpsDeps;
  readonly maxConcurrency?: number;
}): Promise<RegistrationMetadataEvidence[]> {
  const targets = input?.targets ?? [...D35_METADATA_TARGETS];
  const observedAt = input?.observedAt ?? new Date().toISOString();
  const limit = createConcurrencyLimiter(
    input?.maxConcurrency ?? SECURE_FETCH_MAX_CONCURRENCY,
  );

  const tasks = targets.map((target) =>
    limit(() =>
      resolveRegistrationMetadata({
        chainId: target.chainId,
        agentId: target.agentId,
        onChainTokenURI: target.onChainTokenURI,
        approvedFetchURI: target.approvedFetchURI,
        observedAt,
        fetchFn: input?.fetchFn,
        fetchDeps: input?.fetchDeps,
      }),
    ),
  );

  return Promise.all(tasks);
}

export function evidenceToJson(
  evidence: RegistrationMetadataEvidence,
): string {
  return JSON.stringify(evidence, null, 2);
}

export function isSuccessfulMetadataRead(
  evidence: RegistrationMetadataEvidence,
): boolean {
  return evidence.status === "success";
}

export function countSuccessfulMetadataReads(
  evidences: readonly RegistrationMetadataEvidence[],
): number {
  return evidences.filter(isSuccessfulMetadataRead).length;
}

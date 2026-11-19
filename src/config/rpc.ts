/**
 * AgentHire read-only Base RPC transport (D3.3).
 *
 * Mode: READ_ONLY / NO_SIGNING
 * - PublicClient only (no wallet client, keys, or write helpers)
 * - HTTPS allowlist for official Base public hosts
 * - Env overrides: BASE_MAINNET_RPC_URL / BASE_SEPOLIA_RPC_URL
 * - Fail closed on unsafe URLs; sanitize origins in evidence/logs
 */

import {
  type Address,
  type Hex,
  createPublicClient,
  http,
  isAddress,
} from "viem";
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  agentHireNetworksByChainId,
  type AgentHireNetworkConfig,
} from "./chains.ts";

export const RPC_CONNECTIVITY_SCHEMA_VERSION = "1.0" as const;

export const DEFAULT_BASE_MAINNET_RPC_URL = "https://mainnet.base.org";
export const DEFAULT_BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";

/** Official public Base RPC hosts only — no private providers / API-key hosts. */
export const ALLOWED_RPC_HOSTS = [
  "mainnet.base.org",
  "sepolia.base.org",
] as const;

export const RPC_REQUEST_TIMEOUT_MS = 12_000;
export const RPC_RETRY_COUNT = 2;
export const RPC_RETRY_DELAY_MS = 400;

export type SupportedRpcChainId =
  | typeof BASE_MAINNET_CHAIN_ID
  | typeof BASE_SEPOLIA_CHAIN_ID;

export type RpcConnectivityStatus = "verified" | "failed" | "inconclusive";

export type ChainIdCheckResult = {
  readonly expected: SupportedRpcChainId;
  readonly actual: number | null;
  readonly ok: boolean;
  readonly error?: string;
};

export type LatestBlockCheckResult = {
  readonly number: string | null;
  readonly hash: string | null;
  readonly timestamp: string | null;
  readonly ok: boolean;
  readonly error?: string;
};

export type RegistryBytecodeCheckResult = {
  readonly address: Address;
  readonly hasCode: boolean;
  readonly bytecodePrefix: string | null;
  readonly bytecodeByteLength: number | null;
  readonly ok: boolean;
  readonly error?: string;
};

export type RpcConnectivityEvidence = {
  readonly schemaVersion: typeof RPC_CONNECTIVITY_SCHEMA_VERSION;
  readonly chainId: SupportedRpcChainId;
  readonly caip2: `eip155:${SupportedRpcChainId}`;
  readonly networkName: string;
  /** Sanitized origin only — never includes credentials or full secret URLs. */
  readonly rpcOrigin: string;
  readonly status: RpcConnectivityStatus;
  /** UTC ISO-8601 timestamp when the check finished. */
  readonly observedAt: string;
  readonly checks: {
    readonly chainId: ChainIdCheckResult;
    readonly latestBlock: LatestBlockCheckResult;
    readonly registryBytecode: RegistryBytecodeCheckResult;
  };
  readonly error?: string;
};

export type RpcUrlResolution = {
  readonly url: string;
  readonly origin: string;
  readonly host: string;
  readonly fromEnv: boolean;
  readonly envVar: "BASE_MAINNET_RPC_URL" | "BASE_SEPOLIA_RPC_URL" | null;
};

export type CreateReadOnlyClientOptions = {
  readonly rpcUrl?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly retryCount?: number;
  readonly retryDelayMs?: number;
};

/** Minimal read surface used by connectivity checks (mockable offline). */
export type ReadOnlyRpcReader = {
  getChainId(): Promise<number>;
  getBlock(
    args: { blockTag: "latest" },
  ): Promise<{
    number: bigint | null;
    hash: Hex | null;
    timestamp: bigint;
  }>;
  getBytecode(args: { address: Address }): Promise<Hex | undefined>;
};

export class UnsafeRpcUrlError extends Error {
  readonly code = "UNSAFE_RPC_URL" as const;

  constructor(message: string) {
    super(message);
    this.name = "UnsafeRpcUrlError";
  }
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }

  // IPv4 private / link-local / CGNAT ranges
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const octets = ipv4.slice(1).map((part) => Number(part));
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  // IPv6 unique-local / link-local
  if (host.includes(":")) {
    if (
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Sanitize an RPC URL for logs/evidence: scheme + host[:port] only.
 * Credentials and path/query (where API keys often live) are never emitted.
 */
export function sanitizeRpcOrigin(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const port =
      parsed.port && parsed.port !== "" ? `:${parsed.port}` : "";
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port}`;
  } catch {
    return "[invalid-rpc-url]";
  }
}

/**
 * Fail-closed HTTPS allowlist validation.
 * Rejects credentials, non-HTTPS, localhost/private IPs, and non-allowlisted hosts.
 */
export function assertSafeRpcUrl(rawUrl: string): RpcUrlResolution {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeRpcUrlError("RPC URL is not a valid absolute URL");
  }

  if (parsed.protocol !== "https:") {
    throw new UnsafeRpcUrlError(
      `RPC URL must use https (got ${parsed.protocol || "missing protocol"})`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new UnsafeRpcUrlError(
      "RPC URL must not include username/password credentials",
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) {
    throw new UnsafeRpcUrlError("RPC URL is missing a hostname");
  }

  if (isPrivateOrLocalHostname(host)) {
    throw new UnsafeRpcUrlError(
      `RPC host is localhost or a private/reserved address (${host})`,
    );
  }

  if (!(ALLOWED_RPC_HOSTS as readonly string[]).includes(host)) {
    throw new UnsafeRpcUrlError(
      `RPC host is not on the allowlist (refusing arbitrary host: ${host})`,
    );
  }

  // Reject opaque API-key style path segments while keeping bare root paths.
  const path = parsed.pathname === "/" ? "" : parsed.pathname;
  if (path && /\/v\d+\//i.test(path)) {
    throw new UnsafeRpcUrlError(
      "RPC URL path looks like a credentialed provider endpoint",
    );
  }

  // Prefer canonical form without a forced trailing slash for bare hosts.
  const normalized =
    parsed.pathname === "/" && !parsed.search && !parsed.hash
      ? `${parsed.protocol}//${parsed.host}`
      : parsed.toString();

  return {
    url: normalized,
    origin: sanitizeRpcOrigin(normalized),
    host,
    fromEnv: false,
    envVar: null,
  };
}

export function defaultRpcUrlForChain(
  chainId: SupportedRpcChainId,
): string {
  if (chainId === BASE_MAINNET_CHAIN_ID) {
    return DEFAULT_BASE_MAINNET_RPC_URL;
  }
  return DEFAULT_BASE_SEPOLIA_RPC_URL;
}

export function envVarForChain(
  chainId: SupportedRpcChainId,
): "BASE_MAINNET_RPC_URL" | "BASE_SEPOLIA_RPC_URL" {
  return chainId === BASE_MAINNET_CHAIN_ID
    ? "BASE_MAINNET_RPC_URL"
    : "BASE_SEPOLIA_RPC_URL";
}

/**
 * Resolve the RPC URL for a supported Base chain.
 * Env overrides must still pass the HTTPS allowlist (fail closed).
 */
export function resolveRpcUrl(
  chainId: SupportedRpcChainId,
  env: NodeJS.ProcessEnv = process.env,
  explicitUrl?: string,
): RpcUrlResolution {
  const envVar = envVarForChain(chainId);
  const fromEnvRaw = explicitUrl ?? env[envVar];
  const raw =
    typeof fromEnvRaw === "string" && fromEnvRaw.trim().length > 0
      ? fromEnvRaw.trim()
      : defaultRpcUrlForChain(chainId);
  const fromEnv =
    typeof fromEnvRaw === "string" && fromEnvRaw.trim().length > 0;

  const safe = assertSafeRpcUrl(raw);
  return {
    ...safe,
    fromEnv,
    envVar: fromEnv ? envVar : null,
  };
}

function assertSupportedChainId(
  chainId: number,
): asserts chainId is SupportedRpcChainId {
  if (chainId !== BASE_MAINNET_CHAIN_ID && chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error(
      `Unsupported chain id ${chainId}; expected ${BASE_MAINNET_CHAIN_ID} or ${BASE_SEPOLIA_CHAIN_ID}`,
    );
  }
}

/**
 * Create a viem PublicClient for Base Mainnet or Base Sepolia.
 * Never returns a wallet client; no signing capability is attached.
 *
 * Return type is intentionally inferred per-chain: annotating a shared
 * `PublicClient` widens/narrows `getBlock` incompatibly across Base chains.
 */
export function createReadOnlyClient(
  chainId: SupportedRpcChainId,
  options: CreateReadOnlyClientOptions = {},
) {
  assertSupportedChainId(chainId);
  const network = agentHireNetworksByChainId[chainId];
  const resolved = resolveRpcUrl(chainId, options.env ?? process.env, options.rpcUrl);

  return createPublicClient({
    chain: network.chain,
    transport: http(resolved.url, {
      timeout: options.timeoutMs ?? RPC_REQUEST_TIMEOUT_MS,
      retryCount: options.retryCount ?? RPC_RETRY_COUNT,
      retryDelay: options.retryDelayMs ?? RPC_RETRY_DELAY_MS,
    }),
  });
}

/** Adapt a live PublicClient to the mockable read surface. */
export function asReadOnlyRpcReader(
  client: {
    getChainId(): Promise<number>;
    getBlock(args: { blockTag: "latest" }): Promise<{
      number: bigint | null;
      hash: Hex | null;
      timestamp: bigint;
    }>;
    getBytecode(args: { address: Address }): Promise<Hex | undefined>;
  },
): ReadOnlyRpcReader {
  return {
    getChainId: () => client.getChainId(),
    getBlock: (args) => client.getBlock(args),
    getBytecode: (args) => client.getBytecode(args),
  };
}

export function stringifyBigInt(value: bigint): string {
  return value.toString(10);
}

export function isNonEmptyBytecode(code: Hex | undefined | null): boolean {
  if (code == null) return false;
  const normalized = code.trim().toLowerCase();
  return normalized !== "" && normalized !== "0x";
}

export function bytecodeByteLength(code: Hex): number {
  const hex = code.startsWith("0x") || code.startsWith("0X")
    ? code.slice(2)
    : code;
  return Math.floor(hex.length / 2);
}

export function bytecodePrefix(code: Hex, nibbleCount = 18): string {
  const normalized = code.startsWith("0x") || code.startsWith("0X")
    ? `0x${code.slice(2)}`
    : `0x${code}`;
  return normalized.slice(0, Math.min(normalized.length, nibbleCount));
}

export type RpcErrorKind = "timeout" | "connection" | "other";

/**
 * Classify transport failures for status mapping.
 * Timeouts → inconclusive; hard connection failures → failed.
 */
export function classifyRpcError(error: unknown): RpcErrorKind {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("aborted") ||
    lower.includes("aborterror") ||
    lower.includes("deadline")
  ) {
    return "timeout";
  }

  if (
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("enotfound") ||
    lower.includes("enetunreach") ||
    lower.includes("eai_again") ||
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("socket") ||
    lower.includes("http request failed")
  ) {
    return "connection";
  }

  return "other";
}

export type RawConnectivityObservations = {
  readonly chainIdResult:
    | { readonly ok: true; readonly actual: number }
    | { readonly ok: false; readonly error: unknown };
  readonly blockResult:
    | {
        readonly ok: true;
        readonly number: bigint | null;
        readonly hash: Hex | null;
        readonly timestamp: bigint;
      }
    | { readonly ok: false; readonly error: unknown };
  readonly bytecodeResult:
    | { readonly ok: true; readonly bytecode: Hex | undefined }
    | { readonly ok: false; readonly error: unknown };
};

/**
 * Pure validation: map raw RPC observations into RpcConnectivityEvidence.
 * Separable from live transport so unit tests stay offline.
 */
export function buildConnectivityEvidence(input: {
  readonly network: AgentHireNetworkConfig;
  readonly rpcOrigin: string;
  readonly observedAt?: string;
  readonly observations: RawConnectivityObservations;
}): RpcConnectivityEvidence {
  const { network, rpcOrigin, observations } = input;
  const observedAt = input.observedAt ?? new Date().toISOString();
  const expected = network.chainId;

  let chainIdCheck: ChainIdCheckResult;
  if (observations.chainIdResult.ok) {
    const actual = observations.chainIdResult.actual;
    const ok = actual === expected;
    chainIdCheck = {
      expected,
      actual,
      ok,
      ...(ok
        ? {}
        : {
            error: `eth_chainId mismatch: expected ${expected}, got ${actual}`,
          }),
    };
  } else {
    const kind = classifyRpcError(observations.chainIdResult.error);
    chainIdCheck = {
      expected,
      actual: null,
      ok: false,
      error: `eth_chainId ${kind}: ${formatError(observations.chainIdResult.error)}`,
    };
  }

  let latestBlock: LatestBlockCheckResult;
  if (observations.blockResult.ok) {
    const { number, hash, timestamp } = observations.blockResult;
    const malformed =
      number == null ||
      hash == null ||
      hash === "0x" ||
      typeof timestamp !== "bigint";
    if (malformed) {
      latestBlock = {
        number: number == null ? null : stringifyBigInt(number),
        hash: hash ?? null,
        timestamp:
          typeof timestamp === "bigint" ? stringifyBigInt(timestamp) : null,
        ok: false,
        error: "latest block response missing number, hash, or timestamp",
      };
    } else {
      latestBlock = {
        number: stringifyBigInt(number),
        hash,
        timestamp: stringifyBigInt(timestamp),
        ok: true,
      };
    }
  } else {
    const kind = classifyRpcError(observations.blockResult.error);
    latestBlock = {
      number: null,
      hash: null,
      timestamp: null,
      ok: false,
      error: `eth_getBlockByNumber ${kind}: ${formatError(observations.blockResult.error)}`,
    };
  }

  const registryAddress = network.identityRegistry;
  if (!isAddress(registryAddress)) {
    throw new Error(`Invalid registry address configured: ${registryAddress}`);
  }

  let registryBytecode: RegistryBytecodeCheckResult;
  if (observations.bytecodeResult.ok) {
    const code = observations.bytecodeResult.bytecode;
    const hasCode = isNonEmptyBytecode(code);
    registryBytecode = {
      address: registryAddress,
      hasCode,
      bytecodePrefix: hasCode && code ? bytecodePrefix(code) : null,
      bytecodeByteLength: hasCode && code ? bytecodeByteLength(code) : null,
      ok: hasCode,
      ...(hasCode
        ? {}
        : {
            error: `getBytecode at ${registryAddress} returned empty/missing code`,
          }),
    };
  } else {
    const kind = classifyRpcError(observations.bytecodeResult.error);
    registryBytecode = {
      address: registryAddress,
      hasCode: false,
      bytecodePrefix: null,
      bytecodeByteLength: null,
      ok: false,
      error: `eth_getCode ${kind}: ${formatError(observations.bytecodeResult.error)}`,
    };
  }

  const status = deriveConnectivityStatus({
    chainIdCheck,
    latestBlock,
    registryBytecode,
    observations,
  });

  const topError =
    status === "verified"
      ? undefined
      : chainIdCheck.error ??
        latestBlock.error ??
        registryBytecode.error ??
        "RPC connectivity check did not verify";

  return {
    schemaVersion: RPC_CONNECTIVITY_SCHEMA_VERSION,
    chainId: expected,
    caip2: network.caip2,
    networkName: network.name,
    rpcOrigin,
    status,
    observedAt,
    checks: {
      chainId: chainIdCheck,
      latestBlock,
      registryBytecode,
    },
    ...(topError ? { error: topError } : {}),
  };
}

function deriveConnectivityStatus(input: {
  readonly chainIdCheck: ChainIdCheckResult;
  readonly latestBlock: LatestBlockCheckResult;
  readonly registryBytecode: RegistryBytecodeCheckResult;
  readonly observations: RawConnectivityObservations;
}): RpcConnectivityStatus {
  const { chainIdCheck, latestBlock, registryBytecode, observations } = input;

  if (chainIdCheck.ok && latestBlock.ok && registryBytecode.ok) {
    return "verified";
  }

  // Definitive failure: wrong chain or missing contract code (when the call succeeded).
  if (
    observations.chainIdResult.ok &&
    chainIdCheck.actual !== null &&
    !chainIdCheck.ok
  ) {
    return "failed";
  }
  if (observations.bytecodeResult.ok && !registryBytecode.ok) {
    return "failed";
  }
  if (observations.blockResult.ok && !latestBlock.ok) {
    return "failed";
  }

  const transportErrors = [
    observations.chainIdResult.ok ? null : observations.chainIdResult.error,
    observations.blockResult.ok ? null : observations.blockResult.error,
    observations.bytecodeResult.ok ? null : observations.bytecodeResult.error,
  ].filter((value): value is unknown => value != null);

  if (transportErrors.some((err) => classifyRpcError(err) === "timeout")) {
    return "inconclusive";
  }

  if (transportErrors.length > 0) {
    // Connection / other transport failures without a definitive chain/code answer.
    const onlyTimeoutsOrConnection = transportErrors.every((err) => {
      const kind = classifyRpcError(err);
      return kind === "timeout" || kind === "connection" || kind === "other";
    });
    if (onlyTimeoutsOrConnection) {
      // Hard connection failure → failed; ambiguous other → inconclusive.
      if (transportErrors.every((err) => classifyRpcError(err) === "connection")) {
        return "failed";
      }
      if (transportErrors.some((err) => classifyRpcError(err) === "connection")) {
        return "failed";
      }
      return "inconclusive";
    }
  }

  return "failed";
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

/**
 * Run the D3.3 connectivity sequence against a PublicClient / mock reader:
 * (A) eth_chainId match, (B) latest block fields, (C) registry bytecode.
 */
export async function checkRpcConnectivity(input: {
  readonly chainId: SupportedRpcChainId;
  readonly reader: ReadOnlyRpcReader;
  readonly rpcOrigin: string;
  readonly observedAt?: string;
  readonly network?: AgentHireNetworkConfig;
}): Promise<RpcConnectivityEvidence> {
  assertSupportedChainId(input.chainId);
  const network = input.network ?? agentHireNetworksByChainId[input.chainId];
  const reader = input.reader;

  const chainIdResult = await capture(async () => reader.getChainId());
  const blockResult = await capture(async () =>
    reader.getBlock({ blockTag: "latest" }),
  );
  const bytecodeResult = await capture(async () =>
    reader.getBytecode({ address: network.identityRegistry }),
  );

  return buildConnectivityEvidence({
    network,
    rpcOrigin: input.rpcOrigin,
    observedAt: input.observedAt,
    observations: {
      chainIdResult: chainIdResult.ok
        ? { ok: true, actual: chainIdResult.value }
        : { ok: false, error: chainIdResult.error },
      blockResult: blockResult.ok
        ? {
            ok: true,
            number: blockResult.value.number,
            hash: blockResult.value.hash,
            timestamp: blockResult.value.timestamp,
          }
        : { ok: false, error: blockResult.error },
      bytecodeResult: bytecodeResult.ok
        ? { ok: true, bytecode: bytecodeResult.value }
        : { ok: false, error: bytecodeResult.error },
    },
  });
}

async function capture<T>(
  fn: () => Promise<T>,
): Promise<
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown }
> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

/** JSON-safe evidence (all bigints already stringified). */
export function evidenceToJson(
  evidence: RpcConnectivityEvidence,
): string {
  return JSON.stringify(evidence, null, 2);
}

export function isEvidenceJsonSafe(evidence: RpcConnectivityEvidence): boolean {
  try {
    const raw = JSON.stringify(evidence);
    // JSON.stringify drops or throws on bigint; either case is unsafe.
    if (raw == null) return false;
    JSON.parse(raw);
    return !raw.includes("n,") && typeof evidence.checks.latestBlock.number !== "bigint";
  } catch {
    return false;
  }
}

export function requiredChecksPassed(
  evidence: RpcConnectivityEvidence,
): boolean {
  return evidence.status === "verified";
}

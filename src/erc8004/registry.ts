/**
 * AgentHire ERC-8004 Identity Registry reads (D3.4).
 *
 * Mode: READ_ONLY / NO_SIGNING
 * - ownerOf / tokenURI / getAgentWallet only
 * - Same-block snapshots via explicit blockNumber (never silent "latest"
 *   while reporting a different block in evidence)
 * - Does not fetch tokenURI HTTP/IPFS content
 */

import {
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import {
  type AgentHireNetworkConfig,
  agentHireNetworksByChainId,
} from "../config/chains.ts";
import {
  type SupportedRpcChainId,
  classifyRpcError,
  sanitizeRpcOrigin,
  stringifyBigInt,
} from "../config/rpc.ts";
import { identityRegistryAbi } from "./abi.ts";

export const AGENT_IDENTITY_SCHEMA_VERSION = "1.0" as const;

export const ZERO_ADDRESS = zeroAddress;

/** D3.4 live targets — fixed set; no extra enumeration. */
export const D34_AGENT_TARGETS = [
  { chainId: 8453 as const, agentId: 19_353n },
  { chainId: 8453 as const, agentId: 94_639n },
  { chainId: 84532 as const, agentId: 9_136n },
] as const;

export type D34AgentTarget = (typeof D34_AGENT_TARGETS)[number];

export type AgentIdentityStatus =
  | "success"
  | "partial"
  | "notFound"
  | "failed"
  | "inconclusive";

export type AgentIdentityFieldErrorClass =
  | "notFound"
  | "timeout"
  | "connection"
  | "revert"
  | "unknown";

export type AgentIdentityFieldResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly errorClass: AgentIdentityFieldErrorClass;
      readonly error: string;
    };

export type AgentIdentityEvidence = {
  readonly schemaVersion: typeof AGENT_IDENTITY_SCHEMA_VERSION;
  readonly chainId: SupportedRpcChainId;
  readonly caip2: `eip155:${SupportedRpcChainId}`;
  readonly networkName: string;
  readonly registryAddress: Address;
  /** Decimal string agent id. */
  readonly agentId: string;
  /** Sanitized RPC origin (no credentials). */
  readonly rpcOrigin: string;
  readonly status: AgentIdentityStatus;
  /** UTC ISO-8601 when the read finished. */
  readonly observedAt: string;
  /** Snapshot block used for all contract reads (decimal string). */
  readonly blockNumber: string | null;
  readonly blockHash: Hex | null;
  readonly owner: Address | null;
  /** On-chain tokenURI string only — content is never fetched. May be redacted. */
  readonly tokenURI: string | null;
  /** Normalized wallet: null when raw is the zero address. */
  readonly agentWallet: Address | null;
  /** Raw getAgentWallet result, including the zero address when returned. */
  readonly agentWalletRaw: Address | null;
  readonly fields: {
    readonly ownerOf: AgentIdentityFieldResult<Address>;
    readonly tokenURI: AgentIdentityFieldResult<string>;
    readonly getAgentWallet: AgentIdentityFieldResult<Address>;
  };
  readonly error?: string;
};

/** Mockable registry read surface (offline unit tests). */
export type RegistryReadClient = {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getBlock(args: {
    blockNumber: bigint;
  }): Promise<{ number: bigint | null; hash: Hex | null; timestamp: bigint }>;
  readContract(args: {
    address: Address;
    abi: typeof identityRegistryAbi;
    functionName: "ownerOf" | "tokenURI" | "getAgentWallet";
    args: readonly [bigint];
    blockNumber: bigint;
  }): Promise<unknown>;
};

export type ReadAgentIdentityInput = {
  readonly chainId: SupportedRpcChainId;
  readonly agentId: bigint;
  readonly client: RegistryReadClient;
  readonly rpcOrigin: string;
  readonly network?: AgentHireNetworkConfig;
  /** Optional fixed snapshot; when omitted, pin to getBlockNumber() once. */
  readonly blockNumber?: bigint;
  readonly observedAt?: string;
};

/**
 * Redact credential-like material from tokenURI / error strings for logs & evidence.
 * Does not fetch the URI; only sanitizes the on-chain string representation.
 */
export function sanitizeTokenUriForEvidence(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) {
      parsed.username = "";
      parsed.password = "";
    }
    // Drop query/hash — common API-key carriers.
    parsed.search = "";
    parsed.hash = "";
    // Redact opaque provider path segments that look like secrets.
    if (/\/v\d+\//i.test(parsed.pathname) || /\/ipfs\//i.test(parsed.pathname) === false) {
      parsed.pathname = parsed.pathname.replace(
        /\/(v\d+|api|key|token)\/[^/]+/gi,
        "/$1/[REDACTED]",
      );
    }
    // Long hex-looking path tails (API keys) → redact last segment when long.
    parsed.pathname = parsed.pathname.replace(
      /\/([A-Za-z0-9_-]{24,})$/g,
      "/[REDACTED]",
    );
    return parsed.toString();
  } catch {
    // Non-URL URIs (ipfs://, data:, plain paths): strip query-like suffixes & long tokens.
    return trimmed
      .replace(/[?&]([^=&#]+)=([^&#]*)/g, "[?REDACTED]")
      .replace(/\b(Bearer\s+)\S+/gi, "$1[REDACTED]")
      .replace(/\b([A-Za-z0-9_-]{40,})\b/g, "[REDACTED]");
  }
}

export function sanitizeErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
  return raw
    .replace(/https?:\/\/[^:\s]+:[^@\s]+@/gi, "https://[REDACTED]@")
    .replace(/([?&](?:api[_-]?key|key|token|secret|auth)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b([A-Za-z0-9_-]{40,})\b/g, "[REDACTED]");
}

export function isZeroAddress(value: string): boolean {
  return value.toLowerCase() === ZERO_ADDRESS.toLowerCase();
}

export function normalizeAgentWallet(raw: Address): {
  readonly agentWallet: Address | null;
  readonly agentWalletRaw: Address;
} {
  return {
    agentWallet: isZeroAddress(raw) ? null : raw,
    agentWalletRaw: raw,
  };
}

/**
 * Classify contract / RPC failures for evidence.
 * Nonexistent ERC-721 tokens → notFound; timeouts → timeout; else revert/unknown.
 */
export function classifyRegistryError(
  error: unknown,
): AgentIdentityFieldErrorClass {
  const transport = classifyRpcError(error);
  if (transport === "timeout") return "timeout";
  if (transport === "connection") return "connection";

  const text = sanitizeErrorMessage(error).toLowerCase();
  if (
    text.includes("erc721nonexistenttoken") ||
    text.includes("nonexistent token") ||
    text.includes("invalid token id") ||
    text.includes("owner query for nonexistent") ||
    text.includes("token does not exist") ||
    text.includes("erc721: invalid token id") ||
    /\b0x7e273289\b/.test(text) // ERC721NonexistentToken(uint256) selector
  ) {
    return "notFound";
  }

  if (
    text.includes("revert") ||
    text.includes("execution reverted") ||
    text.includes("contractfunctionrevertederror")
  ) {
    return "revert";
  }

  return "unknown";
}

async function capture<T>(
  fn: () => Promise<T>,
): Promise<
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown }
> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

function fieldFromCapture<T>(
  result:
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: unknown },
  map?: (value: T) => T,
): AgentIdentityFieldResult<T> {
  if (result.ok) {
    return { ok: true, value: map ? map(result.value) : result.value };
  }
  return {
    ok: false,
    errorClass: classifyRegistryError(result.error),
    error: sanitizeErrorMessage(result.error),
  };
}

export type RawAgentIdentityObservations = {
  readonly chainId:
    | { readonly ok: true; readonly actual: number }
    | { readonly ok: false; readonly error: unknown };
  readonly block:
    | {
        readonly ok: true;
        readonly number: bigint;
        readonly hash: Hex | null;
      }
    | { readonly ok: false; readonly error: unknown };
  readonly ownerOf:
    | { readonly ok: true; readonly value: Address }
    | { readonly ok: false; readonly error: unknown };
  readonly tokenURI:
    | { readonly ok: true; readonly value: string }
    | { readonly ok: false; readonly error: unknown };
  readonly getAgentWallet:
    | { readonly ok: true; readonly value: Address }
    | { readonly ok: false; readonly error: unknown };
};

/**
 * Pure builder: map raw observations → AgentIdentityEvidence (offline-testable).
 */
export function buildAgentIdentityEvidence(input: {
  readonly network: AgentHireNetworkConfig;
  readonly agentId: bigint;
  readonly rpcOrigin: string;
  readonly observedAt?: string;
  readonly observations: RawAgentIdentityObservations;
}): AgentIdentityEvidence {
  const { network, agentId, observations } = input;
  const observedAt = input.observedAt ?? new Date().toISOString();
  const rpcOrigin = sanitizeRpcOrigin(input.rpcOrigin);

  const ownerOf = fieldFromCapture(observations.ownerOf);
  const tokenURIField = fieldFromCapture(observations.tokenURI, (uri) =>
    sanitizeTokenUriForEvidence(uri),
  );
  const walletField = fieldFromCapture(observations.getAgentWallet);

  let blockNumber: string | null = null;
  let blockHash: Hex | null = null;
  if (observations.block.ok) {
    blockNumber = stringifyBigInt(observations.block.number);
    blockHash = observations.block.hash;
  }

  let chainMismatch = false;
  if (observations.chainId.ok) {
    chainMismatch = observations.chainId.actual !== network.chainId;
  }

  const owner = ownerOf.ok ? ownerOf.value : null;
  const tokenURI = tokenURIField.ok ? tokenURIField.value : null;
  let agentWallet: Address | null = null;
  let agentWalletRaw: Address | null = null;
  if (walletField.ok) {
    const normalized = normalizeAgentWallet(walletField.value);
    agentWallet = normalized.agentWallet;
    agentWalletRaw = normalized.agentWalletRaw;
  }

  const status = deriveStatus({
    chainMismatch,
    chainIdOk: observations.chainId.ok,
    blockOk: observations.block.ok,
    ownerOf,
    tokenURIField,
    walletField,
    chainIdError: observations.chainId.ok ? null : observations.chainId.error,
    blockError: observations.block.ok ? null : observations.block.error,
  });

  const topError =
    status === "success"
      ? undefined
      : chainMismatch
        ? `eth_chainId mismatch: expected ${network.chainId}, got ${
            observations.chainId.ok ? observations.chainId.actual : "n/a"
          }`
        : !ownerOf.ok
          ? ownerOf.error
          : !observations.block.ok
            ? sanitizeErrorMessage(observations.block.error)
            : !observations.chainId.ok
              ? sanitizeErrorMessage(observations.chainId.error)
              : !tokenURIField.ok
                ? tokenURIField.error
                : !walletField.ok
                  ? walletField.error
                  : "agent identity read did not succeed";

  return {
    schemaVersion: AGENT_IDENTITY_SCHEMA_VERSION,
    chainId: network.chainId,
    caip2: network.caip2,
    networkName: network.name,
    registryAddress: network.identityRegistry,
    agentId: stringifyBigInt(agentId),
    rpcOrigin,
    status,
    observedAt,
    blockNumber,
    blockHash,
    owner,
    tokenURI,
    agentWallet,
    agentWalletRaw,
    fields: {
      ownerOf,
      tokenURI: tokenURIField,
      getAgentWallet: walletField,
    },
    ...(topError ? { error: topError } : {}),
  };
}

function deriveStatus(input: {
  readonly chainMismatch: boolean;
  readonly chainIdOk: boolean;
  readonly blockOk: boolean;
  readonly ownerOf: AgentIdentityFieldResult<Address>;
  readonly tokenURIField: AgentIdentityFieldResult<string>;
  readonly walletField: AgentIdentityFieldResult<Address>;
  readonly chainIdError: unknown | null;
  readonly blockError: unknown | null;
}): AgentIdentityStatus {
  if (input.chainMismatch) return "failed";

  if (!input.chainIdOk) {
    const kind = classifyRegistryError(input.chainIdError);
    if (kind === "timeout") return "inconclusive";
    return "failed";
  }

  if (!input.blockOk) {
    const kind = classifyRegistryError(input.blockError);
    if (kind === "timeout") return "inconclusive";
    return "failed";
  }

  // ownerOf is authoritative for existence.
  if (!input.ownerOf.ok) {
    if (input.ownerOf.errorClass === "notFound") return "notFound";
    if (input.ownerOf.errorClass === "timeout") return "inconclusive";
    return "failed";
  }

  // After ownerOf succeeds, missing/reverted tokenURI or getAgentWallet must
  // not look like full success (metadata-join eligibility requires tokenURI).
  const softFailures = [input.tokenURIField, input.walletField].filter(
    (field) => !field.ok,
  );

  if (softFailures.some((f) => !f.ok && f.errorClass === "timeout")) {
    return "inconclusive";
  }

  if (softFailures.length > 0) {
    return "partial";
  }

  return "success";
}

/**
 * Read one agent identity at a pinned block (same block for all three methods).
 */
export async function readAgentIdentity(
  input: ReadAgentIdentityInput,
): Promise<AgentIdentityEvidence> {
  const network = input.network ?? agentHireNetworksByChainId[input.chainId];
  const client = input.client;
  const observedAt = input.observedAt ?? new Date().toISOString();

  const chainIdResult = await capture(() => client.getChainId());

  // Pin snapshot block once — never mix latest reads with a different evidence block.
  let snapshot: bigint | null = input.blockNumber ?? null;
  let blockResult:
    | { readonly ok: true; readonly number: bigint; readonly hash: Hex | null }
    | { readonly ok: false; readonly error: unknown };

  if (snapshot == null) {
    const numberCapture = await capture(() => client.getBlockNumber());
    if (!numberCapture.ok) {
      blockResult = { ok: false, error: numberCapture.error };
    } else {
      snapshot = numberCapture.value;
      const blockCapture = await capture(() =>
        client.getBlock({ blockNumber: snapshot! }),
      );
      if (!blockCapture.ok) {
        // Still usable: we have a number even if hash fetch failed.
        blockResult = {
          ok: true,
          number: snapshot,
          hash: null,
        };
      } else {
        blockResult = {
          ok: true,
          number: snapshot,
          hash: blockCapture.value.hash,
        };
      }
    }
  } else {
    const blockCapture = await capture(() =>
      client.getBlock({ blockNumber: snapshot! }),
    );
    if (!blockCapture.ok) {
      blockResult = { ok: true, number: snapshot, hash: null };
    } else {
      blockResult = {
        ok: true,
        number: snapshot,
        hash: blockCapture.value.hash,
      };
    }
  }

  const canReadContracts =
    chainIdResult.ok &&
    chainIdResult.value === network.chainId &&
    blockResult.ok;

  let ownerOf:
    | { readonly ok: true; readonly value: Address }
    | { readonly ok: false; readonly error: unknown };
  let tokenURI:
    | { readonly ok: true; readonly value: string }
    | { readonly ok: false; readonly error: unknown };
  let getAgentWallet:
    | { readonly ok: true; readonly value: Address }
    | { readonly ok: false; readonly error: unknown };

  if (!canReadContracts || !blockResult.ok) {
    const skipError =
      !chainIdResult.ok
        ? chainIdResult.error
        : chainIdResult.value !== network.chainId
          ? new Error(
              `eth_chainId mismatch: expected ${network.chainId}, got ${chainIdResult.value}`,
            )
          : !blockResult.ok
            ? blockResult.error
            : new Error("snapshot block unavailable");
    ownerOf = { ok: false, error: skipError };
    tokenURI = { ok: false, error: skipError };
    getAgentWallet = { ok: false, error: skipError };
  } else {
    const blockNumber = blockResult.number;
    const address = network.identityRegistry;

    const ownerCapture = await capture(async () => {
      const value = await client.readContract({
        address,
        abi: identityRegistryAbi,
        functionName: "ownerOf",
        args: [input.agentId],
        blockNumber,
      });
      return value as Address;
    });
    ownerOf = ownerCapture.ok
      ? { ok: true, value: ownerCapture.value }
      : { ok: false, error: ownerCapture.error };

    const uriCapture = await capture(async () => {
      const value = await client.readContract({
        address,
        abi: identityRegistryAbi,
        functionName: "tokenURI",
        args: [input.agentId],
        blockNumber,
      });
      return String(value);
    });
    tokenURI = uriCapture.ok
      ? { ok: true, value: uriCapture.value }
      : { ok: false, error: uriCapture.error };

    const walletCapture = await capture(async () => {
      const value = await client.readContract({
        address,
        abi: identityRegistryAbi,
        functionName: "getAgentWallet",
        args: [input.agentId],
        blockNumber,
      });
      return value as Address;
    });
    getAgentWallet = walletCapture.ok
      ? { ok: true, value: walletCapture.value }
      : { ok: false, error: walletCapture.error };
  }

  return buildAgentIdentityEvidence({
    network,
    agentId: input.agentId,
    rpcOrigin: input.rpcOrigin,
    observedAt,
    observations: {
      chainId: chainIdResult.ok
        ? { ok: true, actual: chainIdResult.value }
        : { ok: false, error: chainIdResult.error },
      block: blockResult,
      ownerOf,
      tokenURI,
      getAgentWallet,
    },
  });
}

/**
 * Batch-read multiple agents. Groups by chain so each chain pins one snapshot
 * block; a single agent failure never stops the rest.
 */
export async function readAgentIdentities(input: {
  readonly targets?: readonly {
    readonly chainId: SupportedRpcChainId;
    readonly agentId: bigint;
  }[];
  readonly clientsByChainId: Readonly<
    Partial<Record<SupportedRpcChainId, RegistryReadClient>>
  >;
  readonly rpcOriginsByChainId: Readonly<
    Partial<Record<SupportedRpcChainId, string>>
  >;
  readonly observedAt?: string;
}): Promise<AgentIdentityEvidence[]> {
  const targets = input.targets ?? [...D34_AGENT_TARGETS];
  const observedAt = input.observedAt ?? new Date().toISOString();
  const results: AgentIdentityEvidence[] = [];

  const byChain = new Map<
    SupportedRpcChainId,
    { agentId: bigint }[]
  >();
  for (const target of targets) {
    const list = byChain.get(target.chainId) ?? [];
    list.push({ agentId: target.agentId });
    byChain.set(target.chainId, list);
  }

  for (const [chainId, agents] of byChain) {
    const client = input.clientsByChainId[chainId];
    const rpcOrigin =
      input.rpcOriginsByChainId[chainId] ?? sanitizeRpcOrigin("https://invalid.invalid");
    const network = agentHireNetworksByChainId[chainId];

    if (!client) {
      for (const agent of agents) {
        results.push(
          buildAgentIdentityEvidence({
            network,
            agentId: agent.agentId,
            rpcOrigin,
            observedAt,
            observations: {
              chainId: {
                ok: false,
                error: new Error(`No RPC client configured for chain ${chainId}`),
              },
              block: {
                ok: false,
                error: new Error(`No RPC client configured for chain ${chainId}`),
              },
              ownerOf: {
                ok: false,
                error: new Error(`No RPC client configured for chain ${chainId}`),
              },
              tokenURI: {
                ok: false,
                error: new Error(`No RPC client configured for chain ${chainId}`),
              },
              getAgentWallet: {
                ok: false,
                error: new Error(`No RPC client configured for chain ${chainId}`),
              },
            },
          }),
        );
      }
      continue;
    }

    // One snapshot block per chain for all agents on that chain.
    let snapshot: bigint | undefined;
    try {
      snapshot = await client.getBlockNumber();
    } catch {
      snapshot = undefined;
    }

    for (const agent of agents) {
      try {
        const evidence = await readAgentIdentity({
          chainId,
          agentId: agent.agentId,
          client,
          rpcOrigin,
          network,
          blockNumber: snapshot,
          observedAt,
        });
        results.push(evidence);
      } catch (error) {
        results.push(
          buildAgentIdentityEvidence({
            network,
            agentId: agent.agentId,
            rpcOrigin,
            observedAt,
            observations: {
              chainId: { ok: false, error },
              block: { ok: false, error },
              ownerOf: { ok: false, error },
              tokenURI: { ok: false, error },
              getAgentWallet: { ok: false, error },
            },
          }),
        );
      }
    }
  }

  return results;
}

export function evidenceToJson(evidence: AgentIdentityEvidence): string {
  return JSON.stringify(evidence, null, 2);
}

export function isSuccessfulLiveRead(evidence: AgentIdentityEvidence): boolean {
  return evidence.status === "success";
}

/**
 * Metadata join eligibility requires a successful tokenURI field read and
 * full registry success — ownerOf alone is not enough.
 */
export function isMetadataJoinEligible(
  evidence: AgentIdentityEvidence,
): boolean {
  return (
    evidence.status === "success" &&
    evidence.fields.tokenURI.ok &&
    typeof evidence.tokenURI === "string" &&
    evidence.tokenURI.length > 0
  );
}

export function countSuccessfulLiveReads(
  evidences: readonly AgentIdentityEvidence[],
): number {
  return evidences.filter(isSuccessfulLiveRead).length;
}

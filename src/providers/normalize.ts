/**
 * Offline normalization of D3.4 registry + D3.5 metadata → ProviderRecord@1.0.
 *
 * No RPC / HTTP. Conservative services and payment claims only.
 */

import { createHash } from "node:crypto";
import { getAddress, isAddress, zeroAddress } from "viem";
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  agentHireNetworksByChainId,
} from "../config/chains.ts";
import type {
  Address,
  ProviderOrigin,
  ProviderRecord,
  ProviderService,
} from "./types.ts";

/** MVP §7.1: zero-address agent wallets normalize to null. */
function normalizeOptionalAddress(value: string | null | undefined): Address | null {
  if (!value || !isAddress(value, { strict: false })) return null;
  const checksummed = checksumAddress(value);
  if (checksummed.toLowerCase() === zeroAddress.toLowerCase()) return null;
  return checksummed;
}

export type RegistryEvidenceInput = {
  readonly schemaVersion?: string;
  readonly chainId: number;
  readonly registryAddress: string;
  readonly agentId: string;
  readonly status: string;
  readonly observedAt: string;
  readonly blockNumber: string | null;
  readonly blockHash: string | null;
  readonly owner: string | null;
  readonly tokenURI: string | null;
  readonly agentWallet: string | null;
  readonly rpcOrigin?: string;
  readonly error?: string;
};

export type AdvertisedServiceInput = {
  readonly name: string;
  readonly endpoint: string;
  readonly version?: string | null;
  readonly skills?: readonly string[] | null;
  readonly domains?: readonly string[] | null;
  readonly verificationStatus?: string;
};

export type MetadataEvidenceInput = {
  readonly schemaVersion?: string;
  readonly chainId: number;
  readonly registryAddress: string;
  readonly agentId: string;
  readonly status: string;
  readonly observedAt: string;
  readonly onChainTokenURI: string;
  readonly approvedFetchURI: string;
  readonly displayURI?: string;
  readonly contentSha256: string | null;
  readonly httpStatus?: number | null;
  readonly contentType?: string | null;
  readonly error?: string | null;
  readonly fetchErrorClass?: string | null;
  readonly registration: null | {
    readonly name: string | null;
    readonly description: string | null;
    readonly x402Support: boolean | null;
    readonly services?: readonly AdvertisedServiceInput[];
  };
  readonly advertisedServices: readonly AdvertisedServiceInput[];
};

export type IncompleteServiceClaim = {
  readonly providerId: string;
  readonly reason: string;
  readonly claim: unknown;
};

export type NormalizeJoinResult = {
  readonly provider: ProviderRecord;
  readonly incompleteServiceClaims: readonly IncompleteServiceClaim[];
  readonly joinNotes: readonly string[];
};

const SUPPORTED_CHAIN_IDS = new Set<number>([
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
]);

/**
 * Canonical provider key:
 * `eip155:<registryChainId>/<checksumRegistryAddress>/<decimalAgentId>`
 */
export function buildProviderId(
  chainId: 8453 | 84532,
  registryAddress: Address,
  agentId: string,
): string {
  return `eip155:${chainId}/${registryAddress}/${agentId}`;
}

export function checksumAddress(value: string): Address {
  if (!isAddress(value, { strict: false })) {
    throw new Error(`Invalid EVM address: ${value}`);
  }
  return getAddress(value);
}

export function isSupportedRegistryChainId(
  chainId: number,
): chainId is 8453 | 84532 {
  return SUPPORTED_CHAIN_IDS.has(chainId);
}

export function assertDecimalAgentId(agentId: string): string {
  if (!/^\d+$/.test(agentId)) {
    throw new Error(`agentId must be a decimal string: ${agentId}`);
  }
  return agentId;
}

export function identityKey(
  chainId: number,
  registryAddress: string,
  agentId: string,
): string {
  const checksummed = checksumAddress(registryAddress);
  return `${chainId}/${checksummed.toLowerCase()}/${assertDecimalAgentId(agentId)}`;
}

/** Stable service id from name + endpoint (SHA-256 prefix). */
export function buildServiceId(name: string, endpointUrl: string): string {
  const digest = createHash("sha256")
    .update(`name=${name}\nendpoint=${endpointUrl}\n`, "utf8")
    .digest("hex")
    .slice(0, 16);
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || "service"}-${digest}`;
}

function isValidEndpointUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Conservative service normalization (MVP §7.3).
 * Incomplete claims are skipped from `services` and recorded in diagnostics.
 */
export function normalizeAdvertisedServices(
  providerId: string,
  claims: readonly AdvertisedServiceInput[],
): {
  readonly services: ProviderService[];
  readonly incomplete: IncompleteServiceClaim[];
} {
  const services: ProviderService[] = [];
  const incomplete: IncompleteServiceClaim[] = [];
  const seen = new Set<string>();

  for (const claim of claims) {
    const name = typeof claim.name === "string" ? claim.name.trim() : "";
    const endpoint =
      typeof claim.endpoint === "string" ? claim.endpoint.trim() : "";

    if (!name || !endpoint) {
      incomplete.push({
        providerId,
        reason: "missing_name_or_endpoint",
        claim,
      });
      continue;
    }

    if (!isValidEndpointUrl(endpoint)) {
      incomplete.push({
        providerId,
        reason: "invalid_endpoint_url",
        claim,
      });
      continue;
    }

    const serviceId = buildServiceId(name, endpoint);
    if (seen.has(serviceId)) {
      incomplete.push({
        providerId,
        reason: "duplicate_service",
        claim,
      });
      continue;
    }
    seen.add(serviceId);

    // No explicit GET/POST in D3.5 claims → OTHER.
    // No explicit task-type evidence → empty claimedTaskTypes.
    services.push({
      serviceId,
      endpointUrl: endpoint,
      method: "OTHER",
      description: claim.version ? `${name} (v${claim.version})` : null,
      claimedTaskTypes: [],
      endpointStatus: "notChecked",
      requestSchemaStatus: "notChecked",
    });
  }

  services.sort((a, b) => a.serviceId.localeCompare(b.serviceId));
  return { services, incomplete };
}

/**
 * Map registration metadata x402Support → x402Advertised.
 * Missing → null; explicit false → false; explicit true → true.
 */
export function mapX402Advertised(
  value: boolean | null | undefined,
): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

export function mapFetchStatus(
  metadata: MetadataEvidenceInput | undefined,
): "notFetched" | "success" | "failed" {
  if (!metadata) return "notFetched";
  if (metadata.status === "success") return "success";
  return "failed";
}

/**
 * Join one registry identity with optional matching metadata evidence.
 */
export function normalizeProviderRecord(input: {
  readonly registry: RegistryEvidenceInput;
  readonly metadata?: MetadataEvidenceInput;
  readonly origin?: ProviderOrigin;
  readonly registryEvidenceId: string;
  readonly metadataEvidenceId?: string;
}): NormalizeJoinResult {
  const notes: string[] = [];
  const registry = input.registry;

  if (!isSupportedRegistryChainId(registry.chainId)) {
    throw new Error(`Unsupported registry chainId: ${registry.chainId}`);
  }

  const expectedNetwork = agentHireNetworksByChainId[registry.chainId];
  const registryAddress = checksumAddress(registry.registryAddress);
  if (
    registryAddress.toLowerCase() !==
    expectedNetwork.identityRegistry.toLowerCase()
  ) {
    notes.push(
      `registryAddress ${registryAddress} differs from configured ${expectedNetwork.identityRegistry}`,
    );
  }

  const agentId = assertDecimalAgentId(registry.agentId);
  const providerId = buildProviderId(
    registry.chainId,
    registryAddress,
    agentId,
  );

  const owner = normalizeOptionalAddress(registry.owner);
  // Do not substitute owner for agent wallet (MVP §7.1).
  const agentWallet = normalizeOptionalAddress(registry.agentWallet);

  if (!registry.blockNumber) {
    notes.push("missing observedAtBlock on registry evidence");
  }

  const metadata = input.metadata;
  if (metadata) {
    if (
      identityKey(metadata.chainId, metadata.registryAddress, metadata.agentId) !==
      identityKey(registry.chainId, registry.registryAddress, registry.agentId)
    ) {
      throw new Error(
        `metadata identity mismatch for provider ${providerId}`,
      );
    }

    // URI association: metadata fetch must match on-chain tokenURI when both present.
    if (
      registry.tokenURI &&
      metadata.onChainTokenURI &&
      registry.tokenURI !== metadata.onChainTokenURI
    ) {
      notes.push(
        `tokenURI mismatch: registry=${registry.tokenURI} metadata.onChain=${metadata.onChainTokenURI}`,
      );
    }
    if (
      metadata.onChainTokenURI !== metadata.approvedFetchURI
    ) {
      notes.push(
        `onChainTokenURI !== approvedFetchURI for ${providerId}`,
      );
    }
  } else {
    notes.push(`no metadata evidence joined for ${providerId}`);
  }

  const serviceSource =
    metadata?.advertisedServices ??
    metadata?.registration?.services ??
    [];
  const { services, incomplete } = normalizeAdvertisedServices(
    providerId,
    serviceSource,
  );

  const evidenceIds = [input.registryEvidenceId];
  if (input.metadataEvidenceId) {
    evidenceIds.push(input.metadataEvidenceId);
  }

  const lastCheckedAt = metadata
    ? [registry.observedAt, metadata.observedAt].sort().at(-1) ??
      registry.observedAt
    : registry.observedAt;

  const lastErrorCode =
    registry.status !== "success"
      ? `registry_${registry.status}`
      : metadata && metadata.status !== "success"
        ? `metadata_${metadata.status}`
        : null;

  const provider: ProviderRecord = {
    schemaVersion: "1.0",
    providerId,
    origin: input.origin ?? "external",
    identity: {
      registryChainId: registry.chainId,
      registryAddress,
      agentId,
      owner,
      agentWallet,
      tokenURI: registry.tokenURI,
      observedAtBlock: registry.blockNumber ?? "",
      observedAt: registry.observedAt,
    },
    registration: {
      uri: metadata?.approvedFetchURI ?? registry.tokenURI,
      fetchStatus: mapFetchStatus(metadata),
      metadataHash: metadata?.contentSha256 ?? null,
      advertisedName: metadata?.registration?.name ?? null,
      advertisedDescription: metadata?.registration?.description ?? null,
      operatorEvidenceIds: [],
    },
    services,
    payment: {
      x402Advertised: mapX402Advertised(metadata?.registration?.x402Support),
      advertisedNetworks: [],
      observedOffers: [],
    },
    compatibility: {
      taskType: "wallet-activity-summary",
      taskVersion: "1.0",
      requestSchemaStatus: "notChecked",
      responseSchemaStatus: "notChecked",
      paymentStatus: "notChecked",
    },
    operational: {
      lastCheckedAt,
      lastErrorCode,
      evidenceIds,
    },
  };

  return {
    provider,
    incompleteServiceClaims: incomplete,
    joinNotes: notes,
  };
}

/**
 * Join arrays of registry + metadata evidences by full provider identity.
 * Continues when metadata is missing for a registry row.
 */
export function joinRegistryAndMetadata(input: {
  readonly registryEvidences: readonly RegistryEvidenceInput[];
  readonly metadataEvidences: readonly MetadataEvidenceInput[];
  readonly evidenceIdsByKey: ReadonlyMap<
    string,
    { registryEvidenceId: string; metadataEvidenceId?: string }
  >;
}): {
  readonly providers: ProviderRecord[];
  readonly incompleteServiceClaims: IncompleteServiceClaim[];
  readonly joinNotes: string[];
} {
  const metadataByKey = new Map<string, MetadataEvidenceInput>();
  for (const meta of input.metadataEvidences) {
    const key = identityKey(meta.chainId, meta.registryAddress, meta.agentId);
    metadataByKey.set(key, meta);
  }

  const providers: ProviderRecord[] = [];
  const incompleteServiceClaims: IncompleteServiceClaim[] = [];
  const joinNotes: string[] = [];

  for (const registry of input.registryEvidences) {
    const key = identityKey(
      registry.chainId,
      registry.registryAddress,
      registry.agentId,
    );
    const ids = input.evidenceIdsByKey.get(key);
    if (!ids) {
      throw new Error(`missing deterministic evidence ids for ${key}`);
    }
    const result = normalizeProviderRecord({
      registry,
      metadata: metadataByKey.get(key),
      registryEvidenceId: ids.registryEvidenceId,
      metadataEvidenceId: ids.metadataEvidenceId,
    });
    providers.push(result.provider);
    incompleteServiceClaims.push(...result.incompleteServiceClaims);
    joinNotes.push(...result.joinNotes);
  }

  // Orphan metadata (no registry row) — record only; do not invent identity.
  for (const meta of input.metadataEvidences) {
    const key = identityKey(meta.chainId, meta.registryAddress, meta.agentId);
    const hasRegistry = input.registryEvidences.some(
      (r) =>
        identityKey(r.chainId, r.registryAddress, r.agentId) === key,
    );
    if (!hasRegistry) {
      joinNotes.push(
        `orphan metadata without registry evidence: ${key}`,
      );
    }
  }

  providers.sort((a, b) => a.providerId.localeCompare(b.providerId));
  return { providers, incompleteServiceClaims, joinNotes };
}

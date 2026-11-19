/**
 * Append-only VerificationEvidence@1.0 builders for D3.6 (offline).
 *
 * Only `registryRead` and `metadataFetch` kinds are produced in D3.6.
 * Evidence IDs are deterministic from identity + kind + observation digest.
 */

import { createHash } from "node:crypto";
import type {
  MetadataEvidenceInput,
  RegistryEvidenceInput,
} from "./normalize.ts";
import {
  assertDecimalAgentId,
  buildProviderId,
  checksumAddress,
  isSupportedRegistryChainId,
} from "./normalize.ts";
import type {
  CheckSnapshot,
  ProviderRecord,
  ProviderVerification,
  VerificationCheck,
  VerificationEvidence,
} from "./types.ts";

/** Provider-level verification row (not a callable service). */
export const PROVIDER_LEVEL_SERVICE_ID = "provider" as const;

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Deterministic evidence id:
 * `ev-<kind>-<hex16>` where hex16 = SHA-256(providerId|kind|anchor)[:16]
 */
export function buildEvidenceId(input: {
  readonly kind: "registryRead" | "metadataFetch";
  readonly providerId: string;
  readonly anchor: string;
}): string {
  const digest = sha256Hex(
    `${input.kind}\n${input.providerId}\n${input.anchor}\n`,
  ).slice(0, 16);
  return `ev-${input.kind}-${digest}`;
}

function mapRegistryOutcome(
  status: string,
): VerificationEvidence["outcome"] {
  if (status === "success") return "passed";
  if (status === "inconclusive") return "inconclusive";
  return "failed";
}

function mapMetadataOutcome(
  status: string,
): VerificationEvidence["outcome"] {
  if (status === "success") return "passed";
  if (status === "inconclusive") return "inconclusive";
  return "failed";
}

export function buildRegistryReadEvidence(input: {
  readonly registry: RegistryEvidenceInput;
}): VerificationEvidence {
  const { registry } = input;
  if (!isSupportedRegistryChainId(registry.chainId)) {
    throw new Error(`Unsupported chainId: ${registry.chainId}`);
  }
  const registryAddress = checksumAddress(registry.registryAddress);
  const agentId = assertDecimalAgentId(registry.agentId);
  const providerId = buildProviderId(
    registry.chainId,
    registryAddress,
    agentId,
  );
  const outcome = mapRegistryOutcome(registry.status);
  const anchor = [
    registry.blockNumber ?? "",
    registry.blockHash ?? "",
    registry.observedAt,
    registry.status,
  ].join("|");

  return {
    evidenceId: buildEvidenceId({
      kind: "registryRead",
      providerId,
      anchor,
    }),
    schemaVersion: "1.0",
    providerId,
    serviceId: null,
    kind: "registryRead",
    outcome,
    reasonCode:
      outcome === "passed"
        ? null
        : registry.error
          ? "registry_read_error"
          : `registry_${registry.status}`,
    observedAt: registry.observedAt,
    expiresAt: null,
    source: {
      kind: "rpc",
      endpoint: registry.rpcOrigin ?? null,
      method: "ownerOf/tokenURI/getAgentWallet",
    },
    chain: {
      chainId: registry.chainId,
      registryAddress,
      blockNumber: registry.blockNumber,
      blockHash: registry.blockHash,
      transactionHash: null,
    },
    http: null,
    payment: null,
    requestDigest: null,
    responseDigest: null,
    summary:
      outcome === "passed"
        ? `Registry identity read succeeded for agent ${agentId} at block ${registry.blockNumber ?? "n/a"}`
        : `Registry identity read ${registry.status} for agent ${agentId}`,
  };
}

export function buildMetadataFetchEvidence(input: {
  readonly metadata: MetadataEvidenceInput;
}): VerificationEvidence {
  const { metadata } = input;
  if (!isSupportedRegistryChainId(metadata.chainId)) {
    throw new Error(`Unsupported chainId: ${metadata.chainId}`);
  }
  const registryAddress = checksumAddress(metadata.registryAddress);
  const agentId = assertDecimalAgentId(metadata.agentId);
  const providerId = buildProviderId(
    metadata.chainId,
    registryAddress,
    agentId,
  );
  const outcome = mapMetadataOutcome(metadata.status);
  const anchor = [
    metadata.approvedFetchURI,
    metadata.contentSha256 ?? "",
    metadata.observedAt,
    metadata.status,
    String(metadata.httpStatus ?? ""),
  ].join("|");

  const headers: Record<string, string> = {};
  if (metadata.contentType) {
    headers["content-type"] = metadata.contentType;
  }

  return {
    evidenceId: buildEvidenceId({
      kind: "metadataFetch",
      providerId,
      anchor,
    }),
    schemaVersion: "1.0",
    providerId,
    serviceId: null,
    kind: "metadataFetch",
    outcome,
    reasonCode:
      outcome === "passed"
        ? null
        : metadata.fetchErrorClass
          ? `metadata_${metadata.fetchErrorClass}`
          : `metadata_${metadata.status}`,
    observedAt: metadata.observedAt,
    expiresAt: null,
    source: {
      kind: "https",
      endpoint: metadata.approvedFetchURI,
      method: "GET",
    },
    chain: {
      chainId: metadata.chainId,
      registryAddress,
      blockNumber: null,
      blockHash: null,
      transactionHash: null,
    },
    http: {
      status: metadata.httpStatus ?? null,
      requestMethod: "GET",
      requestUrl: metadata.approvedFetchURI,
      responseHeaders: headers,
      responseBodySha256: metadata.contentSha256,
    },
    payment: null,
    requestDigest: null,
    responseDigest: metadata.contentSha256,
    summary:
      outcome === "passed"
        ? `Registration metadata fetched and validated (${metadata.contentSha256?.slice(0, 12) ?? "no-hash"}…)`
        : `Registration metadata ${metadata.status}`,
  };
}

function emptyCheck(
  result: CheckSnapshot["result"] = "notChecked",
): CheckSnapshot {
  return {
    result,
    checkedAt: null,
    evidenceIds: [],
  };
}

function deriveMilestone(input: {
  readonly registryOutcome: VerificationEvidence["outcome"] | null;
  readonly metadataOutcome: VerificationEvidence["outcome"] | null;
}): ProviderVerification["derivedMilestone"] {
  if (input.registryOutcome !== "passed") return "unverified";
  if (input.metadataOutcome === "passed") return "metadataValidated";
  return "discovered";
}

/**
 * Provider-level verification snapshot through Day 3 upper bound
 * (`metadataValidated`). Endpoint / payment / paid checks remain notChecked.
 */
export function buildProviderVerification(input: {
  readonly provider: ProviderRecord;
  readonly registryEvidence: VerificationEvidence | null;
  readonly metadataEvidence: VerificationEvidence | null;
  readonly evaluatedAt: string;
}): ProviderVerification {
  const registryCheck: CheckSnapshot = input.registryEvidence
    ? {
        result:
          input.registryEvidence.outcome === "passed"
            ? "passed"
            : input.registryEvidence.outcome === "inconclusive"
              ? "inconclusive"
              : "failed",
        checkedAt: input.registryEvidence.observedAt,
        evidenceIds: [input.registryEvidence.evidenceId],
        ...(input.registryEvidence.reasonCode
          ? { reasonCode: input.registryEvidence.reasonCode }
          : {}),
      }
    : emptyCheck("failed");

  const metadataCheck: CheckSnapshot = input.metadataEvidence
    ? {
        result:
          input.metadataEvidence.outcome === "passed"
            ? "passed"
            : input.metadataEvidence.outcome === "inconclusive"
              ? "inconclusive"
              : "failed",
        checkedAt: input.metadataEvidence.observedAt,
        evidenceIds: [input.metadataEvidence.evidenceId],
        ...(input.metadataEvidence.reasonCode
          ? { reasonCode: input.metadataEvidence.reasonCode }
          : {}),
      }
    : emptyCheck("notChecked");

  const checks: Record<VerificationCheck, CheckSnapshot> = {
    registryIdentity: registryCheck,
    registrationMetadata: metadataCheck,
    endpointReachability: emptyCheck(),
    taskRequestCompatibility: emptyCheck(),
    taskResponseCompatibility: emptyCheck(),
    x402Challenge: emptyCheck(),
    paymentPolicy: emptyCheck(),
    paidExecution: emptyCheck(),
  };

  return {
    providerId: input.provider.providerId,
    serviceId: PROVIDER_LEVEL_SERVICE_ID,
    taskType: "wallet-activity-summary",
    taskVersion: "1.0",
    checks,
    derivedMilestone: deriveMilestone({
      registryOutcome: input.registryEvidence?.outcome ?? null,
      metadataOutcome: input.metadataEvidence?.outcome ?? null,
    }),
    availability: "unknown",
    evaluatedAt: input.evaluatedAt,
  };
}

export function buildEvidenceBundle(input: {
  readonly registryEvidences: readonly RegistryEvidenceInput[];
  readonly metadataEvidences: readonly MetadataEvidenceInput[];
  readonly providers: readonly ProviderRecord[];
  readonly evaluatedAt: string;
}): {
  readonly evidences: VerificationEvidence[];
  readonly verifications: ProviderVerification[];
  readonly evidenceIdsByKey: Map<
    string,
    { registryEvidenceId: string; metadataEvidenceId?: string }
  >;
} {
  const registryEvByProvider = new Map<string, VerificationEvidence>();
  const metadataEvByProvider = new Map<string, VerificationEvidence>();
  const evidenceIdsByKey = new Map<
    string,
    { registryEvidenceId: string; metadataEvidenceId?: string }
  >();

  for (const registry of input.registryEvidences) {
    const ev = buildRegistryReadEvidence({ registry });
    registryEvByProvider.set(ev.providerId, ev);
    const key = `${registry.chainId}/${checksumAddress(registry.registryAddress).toLowerCase()}/${assertDecimalAgentId(registry.agentId)}`;
    evidenceIdsByKey.set(key, { registryEvidenceId: ev.evidenceId });
  }

  for (const metadata of input.metadataEvidences) {
    const ev = buildMetadataFetchEvidence({ metadata });
    metadataEvByProvider.set(ev.providerId, ev);
    const key = `${metadata.chainId}/${checksumAddress(metadata.registryAddress).toLowerCase()}/${assertDecimalAgentId(metadata.agentId)}`;
    const existing = evidenceIdsByKey.get(key);
    if (existing) {
      existing.metadataEvidenceId = ev.evidenceId;
    } else {
      evidenceIdsByKey.set(key, {
        registryEvidenceId: "ev-registryRead-missing",
        metadataEvidenceId: ev.evidenceId,
      });
    }
  }

  const evidences: VerificationEvidence[] = [];
  const verifications: ProviderVerification[] = [];

  for (const provider of input.providers) {
    const registryEv = registryEvByProvider.get(provider.providerId) ?? null;
    const metadataEv = metadataEvByProvider.get(provider.providerId) ?? null;
    if (registryEv) evidences.push(registryEv);
    if (metadataEv) evidences.push(metadataEv);
    verifications.push(
      buildProviderVerification({
        provider,
        registryEvidence: registryEv,
        metadataEvidence: metadataEv,
        evaluatedAt: input.evaluatedAt,
      }),
    );
  }

  evidences.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  verifications.sort((a, b) =>
    a.providerId === b.providerId
      ? a.serviceId.localeCompare(b.serviceId)
      : a.providerId.localeCompare(b.providerId),
  );

  return { evidences, verifications, evidenceIdsByKey };
}

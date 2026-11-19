/**
 * Offline provider catalog builder (D3.6).
 *
 * Joins D3.4 registry-reads + D3.5 registration-metadata evidence into
 * ProviderRecord@1.0 and VerificationEvidence@1.0 documents.
 * No RPC / HTTP.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  buildEvidenceId,
  buildMetadataFetchEvidence,
  buildProviderVerification,
  buildRegistryReadEvidence,
} from "./evidence.ts";
import {
  type IncompleteServiceClaim,
  type MetadataEvidenceInput,
  type RegistryEvidenceInput,
  identityKey,
  joinRegistryAndMetadata,
} from "./normalize.ts";
import type {
  CatalogDiagnosticsDocument,
  ProviderCatalogDocument,
  ProviderRecord,
  ProviderVerification,
  ProviderVerificationDocument,
  VerificationEvidence,
} from "./types.ts";

export type RegistryEvidenceFile = {
  readonly schemaVersion?: string;
  readonly capturedAt?: string;
  readonly evidences: readonly RegistryEvidenceInput[];
};

export type MetadataEvidenceFile = {
  readonly schemaVersion?: string;
  readonly capturedAt?: string;
  readonly evidences: readonly MetadataEvidenceInput[];
};

export type BuildCatalogInput = {
  readonly registry: RegistryEvidenceFile;
  readonly metadata: MetadataEvidenceFile;
  /**
   * Optional override for tests only. Production builds derive
   * `snapshotAsOf` from input evidence timestamps.
   */
  readonly snapshotAsOf?: string;
  readonly registryEvidencePath?: string;
  readonly metadataEvidencePath?: string;
};

export type BuildCatalogResult = {
  readonly catalog: ProviderCatalogDocument;
  readonly verification: ProviderVerificationDocument;
  readonly diagnostics: CatalogDiagnosticsDocument;
  readonly catalogJson: string;
  readonly verificationJson: string;
  readonly diagnosticsJson: string;
  readonly catalogSha256: string;
  readonly verificationSha256: string;
};

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256OfString(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Deterministic catalog as-of time: max of file `capturedAt` and per-row
 * `observedAt` values from registry + metadata inputs. Never wall-clock now().
 */
export function deriveSnapshotAsOf(input: {
  readonly registry: RegistryEvidenceFile;
  readonly metadata: MetadataEvidenceFile;
}): string {
  const stamps: string[] = [];
  if (input.registry.capturedAt) stamps.push(input.registry.capturedAt);
  if (input.metadata.capturedAt) stamps.push(input.metadata.capturedAt);
  for (const row of input.registry.evidences) {
    if (row.observedAt) stamps.push(row.observedAt);
  }
  for (const row of input.metadata.evidences) {
    if (row.observedAt) stamps.push(row.observedAt);
  }
  if (stamps.length === 0) {
    throw new Error(
      "Cannot derive snapshotAsOf: no capturedAt/observedAt in evidence inputs",
    );
  }
  return [...stamps].sort().at(-1)!;
}

export type CrossArtifactIntegrityResult = {
  readonly ok: boolean;
  readonly issues: string[];
};

/**
 * Offline integrity checks across registry, metadata, catalog, and verification.
 */
export function checkCrossArtifactIntegrity(input: {
  readonly registry: RegistryEvidenceFile;
  readonly metadata: MetadataEvidenceFile;
  readonly catalog: ProviderCatalogDocument;
  readonly verification: ProviderVerificationDocument;
}): CrossArtifactIntegrityResult {
  const issues: string[] = [];

  const registryKeys = new Set(
    input.registry.evidences.map((e) =>
      identityKey(e.chainId, e.registryAddress, e.agentId),
    ),
  );
  const metadataKeys = new Set(
    input.metadata.evidences.map((e) =>
      identityKey(e.chainId, e.registryAddress, e.agentId),
    ),
  );
  const catalogKeys = new Set(
    input.catalog.providers.map((p) =>
      identityKey(
        p.identity.registryChainId,
        p.identity.registryAddress,
        p.identity.agentId,
      ),
    ),
  );

  if (input.catalog.providerCount !== input.catalog.providers.length) {
    issues.push(
      `providerCount ${input.catalog.providerCount} != providers.length ${input.catalog.providers.length}`,
    );
  }

  for (const key of registryKeys) {
    if (!catalogKeys.has(key)) {
      issues.push(`catalog missing registry identity ${key}`);
    }
  }
  for (const key of catalogKeys) {
    if (!registryKeys.has(key)) {
      issues.push(`catalog provider without registry evidence ${key}`);
    }
  }

  for (const provider of input.catalog.providers) {
    const key = identityKey(
      provider.identity.registryChainId,
      provider.identity.registryAddress,
      provider.identity.agentId,
    );
    const registry = input.registry.evidences.find(
      (e) =>
        identityKey(e.chainId, e.registryAddress, e.agentId) === key,
    );
    const metadata = input.metadata.evidences.find(
      (e) =>
        identityKey(e.chainId, e.registryAddress, e.agentId) === key,
    );

    if (!registry) {
      issues.push(`missing registry row for ${provider.providerId}`);
      continue;
    }
    if (registry.tokenURI !== provider.identity.tokenURI) {
      issues.push(`tokenURI drift for ${provider.providerId}`);
    }
    if (registry.blockNumber !== provider.identity.observedAtBlock) {
      issues.push(`observedAtBlock drift for ${provider.providerId}`);
    }

    if (metadata) {
      if (metadata.onChainTokenURI !== metadata.approvedFetchURI) {
        issues.push(
          `metadata URI fields diverge for ${provider.providerId}`,
        );
      }
      if (
        registry.tokenURI &&
        metadata.onChainTokenURI !== registry.tokenURI
      ) {
        issues.push(
          `registry tokenURI != metadata onChainTokenURI for ${provider.providerId}`,
        );
      }
      if (provider.registration.metadataHash !== metadata.contentSha256) {
        issues.push(`metadataHash drift for ${provider.providerId}`);
      }
      if (
        provider.registration.fetchStatus === "success" &&
        metadata.status !== "success"
      ) {
        issues.push(
          `fetchStatus success but metadata status ${metadata.status} for ${provider.providerId}`,
        );
      }
    } else if (metadataKeys.size > 0 && !metadataKeys.has(key)) {
      // Allowed: registry without metadata → fetchStatus notFetched/failed.
      if (provider.registration.fetchStatus === "success") {
        issues.push(
          `fetchStatus success without metadata evidence for ${provider.providerId}`,
        );
      }
    }

    for (const status of [
      provider.compatibility.requestSchemaStatus,
      provider.compatibility.responseSchemaStatus,
      provider.compatibility.paymentStatus,
    ] as const) {
      if (status !== "notChecked") {
        issues.push(
          `compatibility must remain notChecked in D3.6/D3.7 for ${provider.providerId}`,
        );
      }
    }
    if (provider.payment.observedOffers.length !== 0) {
      issues.push(`observedOffers must be empty for ${provider.providerId}`);
    }
  }

  if (
    input.verification.evidenceCount !== input.verification.evidences.length
  ) {
    issues.push("verification evidenceCount mismatch");
  }
  for (const ev of input.verification.evidences) {
    if (ev.kind !== "registryRead" && ev.kind !== "metadataFetch") {
      issues.push(`unexpected evidence kind ${ev.kind}`);
    }
    if (ev.schemaVersion !== "1.0") {
      issues.push(`evidence schemaVersion != 1.0 (${ev.evidenceId})`);
    }
  }
  for (const v of input.verification.verifications) {
    if (
      v.derivedMilestone !== "unverified" &&
      v.derivedMilestone !== "discovered" &&
      v.derivedMilestone !== "metadataValidated"
    ) {
      issues.push(
        `milestone ${v.derivedMilestone} exceeds Day 3 bound for ${v.providerId}`,
      );
    }
    for (const check of [
      "endpointReachability",
      "taskRequestCompatibility",
      "taskResponseCompatibility",
      "x402Challenge",
      "paymentPolicy",
      "paidExecution",
    ] as const) {
      if (v.checks[check].result !== "notChecked") {
        issues.push(
          `${check} must be notChecked for ${v.providerId}`,
        );
      }
    }
  }

  if (input.catalog.snapshotAsOf !== input.verification.snapshotAsOf) {
    issues.push("catalog/verification snapshotAsOf mismatch");
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Precompute deterministic evidence records and id map before joining
 * provider records (IDs do not depend on ProviderRecord contents).
 */
export function indexEvidence(input: {
  readonly registryEvidences: readonly RegistryEvidenceInput[];
  readonly metadataEvidences: readonly MetadataEvidenceInput[];
}): {
  readonly registryByProviderId: Map<string, VerificationEvidence>;
  readonly metadataByProviderId: Map<string, VerificationEvidence>;
  readonly evidenceIdsByKey: Map<
    string,
    { registryEvidenceId: string; metadataEvidenceId?: string }
  >;
} {
  const registryByProviderId = new Map<string, VerificationEvidence>();
  const metadataByProviderId = new Map<string, VerificationEvidence>();
  const evidenceIdsByKey = new Map<
    string,
    { registryEvidenceId: string; metadataEvidenceId?: string }
  >();

  for (const registry of input.registryEvidences) {
    const ev = buildRegistryReadEvidence({ registry });
    registryByProviderId.set(ev.providerId, ev);
    const key = identityKey(
      registry.chainId,
      registry.registryAddress,
      registry.agentId,
    );
    evidenceIdsByKey.set(key, { registryEvidenceId: ev.evidenceId });
  }

  for (const metadata of input.metadataEvidences) {
    const ev = buildMetadataFetchEvidence({ metadata });
    metadataByProviderId.set(ev.providerId, ev);
    const key = identityKey(
      metadata.chainId,
      metadata.registryAddress,
      metadata.agentId,
    );
    const existing = evidenceIdsByKey.get(key);
    if (existing) {
      existing.metadataEvidenceId = ev.evidenceId;
    } else {
      // Placeholder registry id — join will not use this path for providers
      // that lack registry evidence (orphan metadata is diagnostics-only).
      evidenceIdsByKey.set(key, {
        registryEvidenceId: buildEvidenceId({
          kind: "registryRead",
          providerId: ev.providerId,
          anchor: "missing",
        }),
        metadataEvidenceId: ev.evidenceId,
      });
    }
  }

  return { registryByProviderId, metadataByProviderId, evidenceIdsByKey };
}

export function buildCatalogDocuments(
  input: BuildCatalogInput,
): BuildCatalogResult {
  const registryEvidences = [...input.registry.evidences];
  const metadataEvidences = [...input.metadata.evidences];
  const snapshotAsOf =
    input.snapshotAsOf ??
    deriveSnapshotAsOf({
      registry: input.registry,
      metadata: input.metadata,
    });

  const index = indexEvidence({ registryEvidences, metadataEvidences });

  const joined = joinRegistryAndMetadata({
    registryEvidences,
    metadataEvidences,
    evidenceIdsByKey: index.evidenceIdsByKey,
  });

  const evidences: VerificationEvidence[] = [];
  const verifications: ProviderVerification[] = [];

  for (const provider of joined.providers) {
    const registryEv =
      index.registryByProviderId.get(provider.providerId) ?? null;
    const metadataEv =
      index.metadataByProviderId.get(provider.providerId) ?? null;
    if (registryEv) evidences.push(registryEv);
    if (metadataEv) evidences.push(metadataEv);
    verifications.push(
      buildProviderVerification({
        provider,
        registryEvidence: registryEv,
        metadataEvidence: metadataEv,
        evaluatedAt: snapshotAsOf,
      }),
    );
  }

  evidences.sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  verifications.sort((a, b) =>
    a.providerId === b.providerId
      ? a.serviceId.localeCompare(b.serviceId)
      : a.providerId.localeCompare(b.providerId),
  );

  const catalog: ProviderCatalogDocument = {
    schemaVersion: "1.0",
    mode: "READ_ONLY / NO_SIGNING",
    snapshotAsOf,
    source: {
      registryEvidencePath:
        input.registryEvidencePath ?? "docs/evidence/registry-reads.json",
      metadataEvidencePath:
        input.metadataEvidencePath ??
        "docs/evidence/registration-metadata.json",
      registryCapturedAt: input.registry.capturedAt ?? null,
      metadataCapturedAt: input.metadata.capturedAt ?? null,
    },
    providerCount: joined.providers.length,
    providers: joined.providers,
  };

  const verification: ProviderVerificationDocument = {
    schemaVersion: "1.0",
    mode: "READ_ONLY / NO_SIGNING",
    snapshotAsOf,
    maxSupportedMilestone: "metadataValidated",
    evidenceCount: evidences.length,
    verificationCount: verifications.length,
    evidences,
    verifications,
  };

  const integrity = checkCrossArtifactIntegrity({
    registry: input.registry,
    metadata: input.metadata,
    catalog,
    verification,
  });

  const diagnostics: CatalogDiagnosticsDocument = {
    schemaVersion: "1.0",
    snapshotAsOf,
    incompleteServiceClaims: [
      ...joined.incompleteServiceClaims,
    ] as IncompleteServiceClaim[],
    joinNotes: [...joined.joinNotes].sort(),
    integrity: {
      ok: integrity.ok,
      issues: integrity.issues,
    },
  };

  if (!integrity.ok) {
    throw new Error(
      `Cross-artifact integrity failed: ${integrity.issues.join("; ")}`,
    );
  }

  const catalogJson = stableStringify(catalog);
  const verificationJson = stableStringify(verification);
  const diagnosticsJson = stableStringify(diagnostics);

  return {
    catalog,
    verification,
    diagnostics,
    catalogJson,
    verificationJson,
    diagnosticsJson,
    catalogSha256: sha256OfString(catalogJson),
    verificationSha256: sha256OfString(verificationJson),
  };
}

export function loadEvidenceFiles(paths: {
  readonly registryPath: string;
  readonly metadataPath: string;
}): {
  readonly registry: RegistryEvidenceFile;
  readonly metadata: MetadataEvidenceFile;
} {
  const registry = JSON.parse(
    readFileSync(paths.registryPath, "utf8"),
  ) as RegistryEvidenceFile;
  const metadata = JSON.parse(
    readFileSync(paths.metadataPath, "utf8"),
  ) as MetadataEvidenceFile;
  if (!Array.isArray(registry.evidences)) {
    throw new Error("registry evidence file missing evidences[]");
  }
  if (!Array.isArray(metadata.evidences)) {
    throw new Error("metadata evidence file missing evidences[]");
  }
  return { registry, metadata };
}

export function formatProviderCatalogMarkdown(input: {
  readonly catalog: ProviderCatalogDocument;
  readonly verification: ProviderVerificationDocument;
  readonly catalogSha256: string;
  readonly verificationSha256: string;
}): string {
  const rows = input.catalog.providers
    .map((p) => {
      const milestone =
        input.verification.verifications.find(
          (v) => v.providerId === p.providerId,
        )?.derivedMilestone ?? "n/a";
      return `| \`${p.providerId}\` | ${p.identity.registryChainId} | ${p.identity.agentId} | ${p.registration.advertisedName ?? "n/a"} | ${p.services.length} | ${p.payment.x402Advertised} | ${p.registration.fetchStatus} | ${milestone} |`;
    })
    .join("\n");

  return [
    "# AgentHire D3.6/D3.7 — Provider Catalog",
    "",
    "Offline normalization of D3.4 registry reads + D3.5 registration metadata",
    "into canonical `ProviderRecord@1.0` / `VerificationEvidence@1.0`.",
    "Mode: **READ_ONLY / NO_SIGNING**. No RPC/HTTP during catalog build.",
    "",
    "## Catalog",
    "",
    `snapshotAsOf (derived from input evidence): \`${input.catalog.snapshotAsOf}\``,
    "",
    `| providerId | chain | agentId | name | services | x402Advertised | fetchStatus | milestone |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- |`,
    rows,
    "",
    "## Artifacts",
    "",
    `| File | SHA-256 |`,
    `| --- | --- |`,
    `| \`docs/evidence/provider-catalog.json\` | \`${input.catalogSha256}\` |`,
    `| \`docs/evidence/provider-verification.json\` | \`${input.verificationSha256}\` |`,
    "",
    "## Notes",
    "",
    "- `snapshotAsOf` is the max input `capturedAt`/`observedAt`, not wall-clock build time.",
    "- Services are claims only (`endpointStatus` / `requestSchemaStatus`: `notChecked`).",
    "- `observedOffers` is empty; payment compatibility remains `notChecked`.",
    "- Day 3 upper bound milestone: `metadataValidated`.",
    "- `operatorEvidenceIds` empty; origin is `external` for all three providers.",
    "",
  ].join("\n");
}

/** Helper for tests: summarize providers without I/O. */
export function summarizeProviders(
  providers: readonly ProviderRecord[],
): {
  providerId: string;
  agentId: string;
  serviceCount: number;
  x402Advertised: boolean | null;
  milestoneReady: boolean;
}[] {
  return providers.map((p) => ({
    providerId: p.providerId,
    agentId: p.identity.agentId,
    serviceCount: p.services.length,
    x402Advertised: p.payment.x402Advertised,
    milestoneReady: p.registration.fetchStatus === "success",
  }));
}

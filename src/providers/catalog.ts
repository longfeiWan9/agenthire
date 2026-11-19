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
  readonly generatedAt: string;
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
        evaluatedAt: input.generatedAt,
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
    generatedAt: input.generatedAt,
    source: {
      registryEvidencePath:
        input.registryEvidencePath ?? "docs/evidence/registry-reads.json",
      metadataEvidencePath:
        input.metadataEvidencePath ??
        "docs/evidence/registration-metadata.json",
    },
    providerCount: joined.providers.length,
    providers: joined.providers,
  };

  const verification: ProviderVerificationDocument = {
    schemaVersion: "1.0",
    mode: "READ_ONLY / NO_SIGNING",
    generatedAt: input.generatedAt,
    maxSupportedMilestone: "metadataValidated",
    evidenceCount: evidences.length,
    verificationCount: verifications.length,
    evidences,
    verifications,
  };

  const diagnostics: CatalogDiagnosticsDocument = {
    schemaVersion: "1.0",
    generatedAt: input.generatedAt,
    incompleteServiceClaims: [
      ...joined.incompleteServiceClaims,
    ] as IncompleteServiceClaim[],
    joinNotes: [...joined.joinNotes].sort(),
  };

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
    "# AgentHire D3.6 — Provider Catalog",
    "",
    "Offline normalization of D3.4 registry reads + D3.5 registration metadata",
    "into canonical `ProviderRecord@1.0` / `VerificationEvidence@1.0`.",
    "Mode: **READ_ONLY / NO_SIGNING**. No RPC/HTTP during catalog build.",
    "",
    "## Catalog",
    "",
    `Generated: \`${input.catalog.generatedAt}\``,
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

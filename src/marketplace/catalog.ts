/**
 * Offline hybrid marketplace capability catalog builder (D4.5).
 *
 * Merges ERC-8004 services + D4.3a agent-card skills + full D4.4b x402
 * resources. Conservative cross-source correlation — no silent name-only
 * merges. Counts agents / skills / resources / capabilities separately.
 *
 * STRICTLY_OFFLINE — zero DNS / HTTP / RPC.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AdvertisedResource } from "../providers/resource-analysis.ts";
import type {
  ProviderCatalogDocument,
  ProviderRecord,
  ProviderVerification,
  ProviderVerificationDocument,
  VerificationStatus,
} from "../providers/types.ts";
import { getCategoryDefinition, sortCategoryIds } from "./categories.ts";
import {
  classifyMarketplaceCategories,
  extractKeywords,
  protocolHintsFromText,
} from "./classify.ts";
import type {
  AgentProfile,
  CapabilityProvenance,
  CapabilityRecord,
  CatalogCounts,
  CategorySummaryDocument,
  CategorySummaryEntry,
  DerivedVerificationView,
  MarketplaceCatalogDocument,
  MarketplaceCategoryId,
  ProtocolHint,
} from "./types.ts";
import {
  MARKETPLACE_MODE,
  MARKETPLACE_SCHEMA_VERSION,
} from "./types.ts";

export const B1B2_PLANNED_CAPABILITY_ID =
  "agenthire:planned:wallet-activity-summary@1.0" as const;

export const B1B2_TASK_ID = "wallet-activity-summary@1.0" as const;

type DiscoverySkill = {
  readonly id: string | null;
  readonly name: string | null;
  readonly description: string | null;
  readonly tags: readonly string[];
};

type DiscoveryEvidence = {
  readonly discoveryId: string;
  readonly provider: string;
  readonly status: string;
  readonly documentSummary: {
    readonly name?: string | null;
    readonly skills?: readonly DiscoverySkill[];
    readonly skillIds?: readonly string[];
  } | null;
};

type DiscoveryInspectionFile = {
  readonly evidences: readonly DiscoveryEvidence[];
};

type Agent402CatalogFile = {
  readonly resources: readonly AdvertisedResource[];
  readonly summary?: { readonly observedAt?: string };
  readonly provider?: string;
};

export type MarketplaceBuildInput = {
  readonly providerCatalog: ProviderCatalogDocument;
  readonly providerVerification: ProviderVerificationDocument;
  readonly discoveryInspection: DiscoveryInspectionFile;
  readonly agent402Catalog: Agent402CatalogFile;
  readonly sourcePaths: {
    readonly providerCatalog: string;
    readonly providerVerification: string;
    readonly discoveryInspection: string;
    readonly agent402Catalog: string;
  };
  /** Optional override for tests; production derives from evidence. */
  readonly snapshotAsOf?: string;
};

export type MarketplaceBuildResult = {
  readonly catalog: MarketplaceCatalogDocument;
  readonly categorySummary: CategorySummaryDocument;
  readonly catalogJson: string;
  readonly categorySummaryJson: string;
  readonly catalogSha256: string;
  readonly categorySummarySha256: string;
};

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function sha256OfString(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function shortHash(text: string, len = 12): string {
  return sha256OfString(text).slice(0, len);
}

/** Deterministic capability id from provider + service keys; collision-safe. */
export function buildCapabilityId(
  providerKey: string,
  serviceKey: string,
  used: Set<string>,
): string {
  const base = `cap:${shortHash(`${providerKey}::${serviceKey}`)}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}~${n}`)) n += 1;
  const id = `${base}~${n}`;
  used.add(id);
  return id;
}

function emptyVerification(notes: string): DerivedVerificationView {
  return {
    endpointStatus: "notChecked",
    requestSchemaStatus: "notChecked",
    derivedMilestone: "unverified",
    registryIdentity: "notChecked",
    registrationMetadata: "notChecked",
    endpointReachability: "notChecked",
    paymentPolicy: "notChecked",
    notes,
  };
}

function verificationFromProvider(
  v: ProviderVerification | undefined,
  serviceEndpointStatus: VerificationStatus,
  serviceRequestSchemaStatus: VerificationStatus,
): DerivedVerificationView {
  if (!v) {
    return {
      ...emptyVerification(
        "No ProviderVerification row; advertised claims only (notChecked).",
      ),
      endpointStatus: serviceEndpointStatus,
      requestSchemaStatus: serviceRequestSchemaStatus,
      derivedMilestone:
        serviceEndpointStatus === "notChecked" ? "discovered" : "unverified",
    };
  }
  return {
    endpointStatus: serviceEndpointStatus,
    requestSchemaStatus: serviceRequestSchemaStatus,
    derivedMilestone: v.derivedMilestone,
    registryIdentity: v.checks.registryIdentity.result,
    registrationMetadata: v.checks.registrationMetadata.result,
    endpointReachability: v.checks.endpointReachability.result,
    paymentPolicy: v.checks.paymentPolicy.result,
    notes:
      "Derived from B3/B4 ProviderVerification vocabulary; marketplace does not invent verified.",
  };
}

function agentProfileIdForProvider(provider: ProviderRecord): string {
  return `agent:${provider.providerId}`;
}

function agentProfileIdForExternalName(name: string): string {
  return `agent:external:${shortHash(name.toLowerCase())}`;
}

function originToProvenance(
  origin: ProviderRecord["origin"],
): CapabilityProvenance {
  return origin === "selfHostedFallback" ? "agenthire-operated" : "external";
}

function methodToProtocol(method: string | null, url: string | null, description: string | null): ProtocolHint[] {
  return protocolHintsFromText(method, url, description);
}

function maxIso(...values: Array<string | null | undefined>): string {
  const cleaned = values.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (cleaned.length === 0) return "1970-01-01T00:00:00.000Z";
  return cleaned.sort().at(-1)!;
}

/**
 * Conservative correlation keys — exact URL / exact skill id / exact service id.
 * Name-only keys are intentionally omitted (no silent name-only merges).
 */
export function correlationKeysFor(input: {
  readonly url?: string | null;
  readonly skillId?: string | null;
  readonly serviceId?: string | null;
  readonly providerKey: string;
}): string[] {
  const keys: string[] = [];
  if (input.url) keys.push(`url:${input.url}`);
  if (input.skillId) {
    keys.push(`skill:${input.providerKey}:${input.skillId}`);
  }
  if (input.serviceId) {
    keys.push(`service:${input.providerKey}:${input.serviceId}`);
  }
  return keys.sort();
}

function indexVerifications(
  doc: ProviderVerificationDocument,
): Map<string, ProviderVerification> {
  const map = new Map<string, ProviderVerification>();
  for (const v of doc.verifications) {
    map.set(`${v.providerId}::${v.serviceId}`, v);
    // Provider-level row often uses serviceId "provider".
    if (v.serviceId === "provider") {
      map.set(`${v.providerId}::provider`, v);
    }
  }
  return map;
}

function buildPlannedB1B2(usedIds: Set<string>): CapabilityRecord {
  const capabilityId = B1B2_PLANNED_CAPABILITY_ID;
  usedIds.add(capabilityId);
  const categories: MarketplaceCategoryId[] = ["data-analytics"];
  return {
    capabilityId,
    agentProfileId: "agent:agenthire-operated",
    providerKey: "agenthire",
    serviceKey: "wallet-activity-summary@1.0",
    displayName: "Wallet Activity Summary (planned)",
    description:
      "AgentHire B1/B2 reference task wallet-activity-summary@1.0 — planned under data-analytics; not verified as an executable integration.",
    provenance: "agenthire-operated",
    sourceKind: "agenthire-planned",
    categories,
    originalLabels: ["wallet-activity-summary@1.0", "B1", "B2", "data-analytics"],
    protocols: ["agenthire-task"],
    method: null,
    endpointUrl: null,
    sanitizedUrl: null,
    claimedTaskIds: [B1B2_TASK_ID],
    keywords: extractKeywords({
      name: "Wallet Activity Summary",
      description: "wallet-activity-summary@1.0 planned analytics",
      claimedTaskIds: [B1B2_TASK_ID],
      labels: ["B1", "B2"],
    }),
    verification: {
      ...emptyVerification(
        "Planned AgentHire-operated reference; not verified. B3/B4 milestones remain notChecked.",
      ),
      derivedMilestone: "unverified",
    },
    paymentAdvertised: false,
    fixtureKind: "planned",
    sourceRefs: [
      "docs/specifications/MVP-contracts.md#B1",
      "docs/specifications/MVP-contracts.md#B2",
    ],
    correlationKeys: [
      `task:${B1B2_TASK_ID}`,
      "service:agenthire:wallet-activity-summary@1.0",
    ],
    agentDisplayName: "AgentHire (operated)",
  };
}

export function buildMarketplaceCatalog(
  input: MarketplaceBuildInput,
): MarketplaceBuildResult {
  const usedIds = new Set<string>();
  const agents = new Map<string, AgentProfile>();
  const capabilities: CapabilityRecord[] = [];

  let skillCount = 0;
  let resourceCount = 0;
  let erc8004ServiceCount = 0;
  let plannedCount = 0;

  const verifIndex = indexVerifications(input.providerVerification);

  const snapshotAsOf =
    input.snapshotAsOf ??
    maxIso(
      input.providerCatalog.snapshotAsOf,
      input.providerVerification.snapshotAsOf,
      input.agent402Catalog.summary?.observedAt,
      ...input.discoveryInspection.evidences.map((e) =>
        // discovery file may lack observedAt on root; per-evidence used elsewhere
        (e as { observedAt?: string }).observedAt,
      ),
    );

  // --- AgentHire operated agent ---
  agents.set("agent:agenthire-operated", {
    agentProfileId: "agent:agenthire-operated",
    displayName: "AgentHire (operated)",
    providerId: null,
    origin: "agenthire-operated",
    registryChainId: null,
    registryAddress: null,
    agentId: null,
    sourcePaths: ["docs/specifications/MVP-contracts.md"],
  });

  // --- ERC-8004 providers / services ---
  for (const provider of input.providerCatalog.providers) {
    const agentProfileId = agentProfileIdForProvider(provider);
    agents.set(agentProfileId, {
      agentProfileId,
      displayName: provider.registration.advertisedName,
      providerId: provider.providerId,
      origin: originToProvenance(provider.origin),
      registryChainId: provider.identity.registryChainId,
      registryAddress: provider.identity.registryAddress,
      agentId: provider.identity.agentId,
      sourcePaths: [input.sourcePaths.providerCatalog],
    });

    const providerVerif =
      verifIndex.get(`${provider.providerId}::provider`) ??
      input.providerVerification.verifications.find(
        (v) => v.providerId === provider.providerId,
      );

    for (const service of provider.services) {
      erc8004ServiceCount += 1;
      const providerKey = provider.providerId;
      const serviceKey = service.serviceId;
      const capabilityId = buildCapabilityId(providerKey, serviceKey, usedIds);
      const originalLabels = [
        service.serviceId,
        service.description,
        ...service.claimedTaskTypes,
        provider.registration.advertisedName,
      ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);

      const categories = classifyMarketplaceCategories({
        name: service.serviceId,
        description: service.description,
        labels: originalLabels,
        url: service.endpointUrl,
        method: service.method,
        claimedTaskIds: service.claimedTaskTypes,
      });

      const serviceVerif =
        verifIndex.get(`${provider.providerId}::${service.serviceId}`) ??
        providerVerif;

      capabilities.push({
        capabilityId,
        agentProfileId,
        providerKey,
        serviceKey,
        displayName:
          service.description?.trim() ||
          service.serviceId ||
          provider.registration.advertisedName ||
          providerKey,
        description: service.description,
        provenance: originToProvenance(provider.origin),
        sourceKind: "erc8004-service",
        categories,
        originalLabels,
        protocols: methodToProtocol(
          service.method,
          service.endpointUrl,
          service.description,
        ),
        method: service.method,
        endpointUrl: service.endpointUrl,
        sanitizedUrl: service.endpointUrl,
        claimedTaskIds: [...service.claimedTaskTypes],
        keywords: extractKeywords({
          name: service.serviceId,
          description: service.description,
          labels: originalLabels,
          url: service.endpointUrl,
          claimedTaskIds: service.claimedTaskTypes,
        }),
        verification: verificationFromProvider(
          serviceVerif,
          service.endpointStatus,
          service.requestSchemaStatus,
        ),
        paymentAdvertised: provider.payment.x402Advertised,
        fixtureKind: "captured",
        sourceRefs: [
          input.sourcePaths.providerCatalog,
          input.sourcePaths.providerVerification,
        ],
        correlationKeys: correlationKeysFor({
          url: service.endpointUrl,
          serviceId: service.serviceId,
          providerKey,
        }),
        agentDisplayName: provider.registration.advertisedName,
      });
    }
  }

  // --- D4.3a agent-card skills ---
  for (const evidence of input.discoveryInspection.evidences) {
    const skills = evidence.documentSummary?.skills ?? [];
    if (skills.length === 0) continue;

    const providerName = evidence.provider;
    // Prefer matching an existing ERC-8004 agent by advertised name; else external profile.
    let agentProfileId: string | null = null;
    for (const agent of agents.values()) {
      if (
        agent.displayName &&
        agent.displayName.toLowerCase() === providerName.toLowerCase()
      ) {
        agentProfileId = agent.agentProfileId;
        break;
      }
    }
    // Conservative: name match only attaches skills to an existing profile;
    // it does NOT merge capability rows. If no profile, create external one.
    if (!agentProfileId) {
      agentProfileId = agentProfileIdForExternalName(providerName);
      if (!agents.has(agentProfileId)) {
        agents.set(agentProfileId, {
          agentProfileId,
          displayName: evidence.documentSummary?.name ?? providerName,
          providerId: null,
          origin: "external",
          registryChainId: null,
          registryAddress: null,
          agentId: null,
          sourcePaths: [input.sourcePaths.discoveryInspection],
        });
      }
    } else {
      const existing = agents.get(agentProfileId)!;
      agents.set(agentProfileId, {
        ...existing,
        sourcePaths: [
          ...new Set([
            ...existing.sourcePaths,
            input.sourcePaths.discoveryInspection,
          ]),
        ],
      });
    }

    for (const skill of skills) {
      skillCount += 1;
      const skillId = skill.id ?? skill.name ?? `skill-${skillCount}`;
      const providerKey = `skill-provider:${providerName}`;
      const serviceKey = `skill:${skillId}`;
      const capabilityId = buildCapabilityId(providerKey, serviceKey, usedIds);
      const originalLabels = [
        skill.id,
        skill.name,
        ...(skill.tags ?? []),
      ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);

      const categories = classifyMarketplaceCategories({
        name: skill.name,
        description: skill.description,
        labels: originalLabels,
        tags: skill.tags,
      });

      capabilities.push({
        capabilityId,
        agentProfileId,
        providerKey,
        serviceKey,
        displayName: skill.name ?? skillId,
        description: skill.description,
        provenance: "external",
        sourceKind: "agent-card-skill",
        categories,
        originalLabels,
        protocols: protocolHintsFromText(
          skill.name,
          skill.description,
          ...(skill.tags ?? []),
          "a2a",
        ),
        method: null,
        endpointUrl: null,
        sanitizedUrl: null,
        claimedTaskIds: [],
        keywords: extractKeywords({
          name: skill.name,
          description: skill.description,
          tags: skill.tags,
          labels: originalLabels,
        }),
        verification: emptyVerification(
          `Agent-card skill from ${evidence.discoveryId}; documentation only — not B4 verified.`,
        ),
        paymentAdvertised: null,
        fixtureKind: "captured",
        sourceRefs: [
          input.sourcePaths.discoveryInspection,
          evidence.discoveryId,
        ],
        correlationKeys: correlationKeysFor({
          skillId: skill.id,
          providerKey: providerName,
        }),
        agentDisplayName:
          agents.get(agentProfileId)?.displayName ?? providerName,
      });
    }
  }

  // --- D4.4b x402 resources (full 620) ---
  const resourceProvider =
    input.agent402Catalog.provider ?? "Agent402";
  let resourceAgentId: string | null = null;
  for (const agent of agents.values()) {
    if (
      agent.displayName &&
      agent.displayName.toLowerCase() === resourceProvider.toLowerCase()
    ) {
      resourceAgentId = agent.agentProfileId;
      break;
    }
  }
  if (!resourceAgentId) {
    resourceAgentId = agentProfileIdForExternalName(resourceProvider);
    if (!agents.has(resourceAgentId)) {
      agents.set(resourceAgentId, {
        agentProfileId: resourceAgentId,
        displayName: resourceProvider,
        providerId: null,
        origin: "external",
        registryChainId: null,
        registryAddress: null,
        agentId: null,
        sourcePaths: [input.sourcePaths.agent402Catalog],
      });
    }
  }

  for (const resource of input.agent402Catalog.resources) {
    resourceCount += 1;
    const providerKey = resource.provider || resourceProvider;
    const serviceKey =
      resource.resourceId ||
      resource.sanitizedUrl ||
      resource.url ||
      `resource-${resourceCount}`;
    const capabilityId = buildCapabilityId(providerKey, serviceKey, usedIds);
    const originalLabels = [
      resource.resourceId,
      resource.family,
      ...(resource.categories ?? []),
      resource.description,
    ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);

    const categories = classifyMarketplaceCategories({
      name: resource.family,
      description: resource.description,
      labels: originalLabels,
      url: resource.url ?? resource.sanitizedUrl,
      method: resource.method,
      priorResourceCategories: resource.categories,
    });

    // Conservative URL correlation only — attach note via correlationKeys;
    // do not merge rows with ERC-8004 services solely by hostname.
    capabilities.push({
      capabilityId,
      agentProfileId: resourceAgentId,
      providerKey,
      serviceKey,
      displayName:
        resource.sanitizedUrl ||
        resource.url ||
        resource.resourceId ||
        serviceKey,
      description: resource.description,
      provenance: "external",
      sourceKind: "x402-resource",
      categories,
      originalLabels,
      protocols: protocolHintsFromText(
        "x402",
        resource.method,
        resource.url,
        resource.description,
      ),
      method: resource.method,
      endpointUrl: resource.url,
      sanitizedUrl: resource.sanitizedUrl,
      claimedTaskIds: [],
      keywords: extractKeywords({
        name: resource.family,
        description: resource.description,
        labels: originalLabels,
        url: resource.url,
        method: resource.method,
      }),
      verification: {
        ...emptyVerification(
          "x402 advertised resource from CATALOG-001; inspectionStatus notChecked; not paymentCompatible.",
        ),
        derivedMilestone: "discovered",
        endpointStatus: "notChecked",
      },
      paymentAdvertised: true,
      fixtureKind: resource.fixtureKind === "synthetic" ? "synthetic" : "captured",
      sourceRefs: [
        input.sourcePaths.agent402Catalog,
        resource.sourceDiscoveryId,
      ],
      correlationKeys: correlationKeysFor({
        url: resource.sanitizedUrl ?? resource.url,
        providerKey,
      }),
      agentDisplayName: resourceProvider,
    });
  }

  // --- Planned B1/B2 reference under data-analytics ---
  const planned = buildPlannedB1B2(usedIds);
  capabilities.push(planned);
  plannedCount += 1;

  // Deterministic ordering
  capabilities.sort((a, b) =>
    a.capabilityId < b.capabilityId ? -1 : a.capabilityId > b.capabilityId ? 1 : 0,
  );
  const agentList = [...agents.values()].sort((a, b) =>
    a.agentProfileId < b.agentProfileId
      ? -1
      : a.agentProfileId > b.agentProfileId
        ? 1
        : 0,
  );

  const counts: CatalogCounts = {
    agentProfiles: agentList.length,
    capabilities: capabilities.length,
    skills: skillCount,
    resources: resourceCount,
    erc8004Services: erc8004ServiceCount,
    planned: plannedCount,
    uniqueCapabilityIds: usedIds.size,
  };

  const catalog: MarketplaceCatalogDocument = {
    schemaVersion: MARKETPLACE_SCHEMA_VERSION,
    mode: MARKETPLACE_MODE,
    kind: "marketplaceCapabilityCatalog",
    builtAtSource: "offline-evidence",
    snapshotAsOf,
    counts,
    agents: agentList,
    capabilities,
    hireJobBoundary: {
      implemented: false,
      note: "HireJob is a type boundary only in D4.5; no execution or payment.",
    },
    b1b2Reference: {
      taskId: B1B2_TASK_ID,
      categoryId: "data-analytics",
      status: "planned",
      verified: false,
      capabilityId: planned.capabilityId,
    },
    sourceInputs: [
      { path: input.sourcePaths.providerCatalog, role: "erc8004-services" },
      {
        path: input.sourcePaths.providerVerification,
        role: "b3-b4-verification-view",
      },
      {
        path: input.sourcePaths.discoveryInspection,
        role: "agent-card-skills",
      },
      {
        path: input.sourcePaths.agent402Catalog,
        role: "x402-resources-full",
      },
    ],
    notes: [
      "Categories aid discovery; they never restrict listing.",
      "620 x402 resources ≠ 620 agents — counts are separate.",
      "Cross-source correlation is conservative (exact URL / skill id / service id); no silent name-only merges of capability rows.",
      "Derived verification reuses B3/B4 statuses only — no invented verified flag.",
      "Sepolia x402 policy unchanged: discoverable ≠ payable.",
      "STRICTLY_OFFLINE: zero new provider HTTP/DNS/RPC.",
    ],
  };

  const categorySummary = buildCategorySummary(catalog);

  const catalogJson = stableStringify(catalog);
  const categorySummaryJson = stableStringify(categorySummary);

  return {
    catalog,
    categorySummary,
    catalogJson,
    categorySummaryJson,
    catalogSha256: sha256OfString(catalogJson),
    categorySummarySha256: sha256OfString(categorySummaryJson),
  };
}

export function buildCategorySummary(
  catalog: MarketplaceCatalogDocument,
): CategorySummaryDocument {
  const ids: MarketplaceCategoryId[] = [
    "research-intelligence",
    "data-analytics",
    "content-documents",
    "developer-tools",
    "other",
  ];

  const entries: CategorySummaryEntry[] = ids.map((categoryId) => {
    const rows = catalog.capabilities.filter((c) =>
      c.categories.includes(categoryId),
    );
    const agentSet = new Set(rows.map((r) => r.agentProfileId));
    return {
      categoryId,
      name: getCategoryDefinition(categoryId).name,
      capabilityCount: rows.length,
      agentProfileCount: agentSet.size,
      skillCount: rows.filter((r) => r.sourceKind === "agent-card-skill").length,
      resourceCount: rows.filter((r) => r.sourceKind === "x402-resource").length,
      erc8004ServiceCount: rows.filter((r) => r.sourceKind === "erc8004-service")
        .length,
      plannedCount: rows.filter((r) => r.sourceKind === "agenthire-planned")
        .length,
    };
  });

  return {
    schemaVersion: MARKETPLACE_SCHEMA_VERSION,
    mode: MARKETPLACE_MODE,
    kind: "marketplaceCategorySummary",
    snapshotAsOf: catalog.snapshotAsOf,
    categories: entries,
    uncategorizedPolicy: "fallback-to-other",
    multiCategoryAllowed: true,
  };
}

export function loadMarketplaceEvidence(repoRoot: string): MarketplaceBuildInput {
  const paths = {
    providerCatalog: "docs/evidence/provider-catalog.json",
    providerVerification: "docs/evidence/provider-verification.json",
    discoveryInspection: "docs/day4/evidence/discovery-inspection.json",
    agent402Catalog: "docs/day4/evidence/agent402-full-resource-catalog.json",
  } as const;

  const providerCatalog = JSON.parse(
    readFileSync(join(repoRoot, paths.providerCatalog), "utf8"),
  ) as ProviderCatalogDocument;
  const providerVerification = JSON.parse(
    readFileSync(join(repoRoot, paths.providerVerification), "utf8"),
  ) as ProviderVerificationDocument;
  const discoveryInspection = JSON.parse(
    readFileSync(join(repoRoot, paths.discoveryInspection), "utf8"),
  ) as DiscoveryInspectionFile;
  const agent402Catalog = JSON.parse(
    readFileSync(join(repoRoot, paths.agent402Catalog), "utf8"),
  ) as Agent402CatalogFile;

  return {
    providerCatalog,
    providerVerification,
    discoveryInspection,
    agent402Catalog,
    sourcePaths: { ...paths },
  };
}

export { sortCategoryIds };

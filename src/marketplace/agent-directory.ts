/**
 * Agent-first presentation / read model (D7.1 Tasks A–C).
 *
 * Groups capabilities under catalog agent profiles without merging by name.
 * Discovery-derived QuantJourney stays separate from ERC-8004 QuantJourney.
 */

import {
  agentIdentityKeyOf,
  canonicalRegistrationKeyOf,
  classifyRegistrationNetwork,
  type AgentIdentityKey,
  type RegistrationNetworkFilter,
  type RegistrationNetworkInfo,
} from "./agent-identity.ts";
import {
  assessListingQuality,
  matchesListingScope,
  type ListingQualityAssessment,
  type ListingScope,
} from "./listing-policy.ts";
import { SEC_IDENTITY_CAPABILITY_ID } from "../adapters/quantjourney-sec-identity.ts";
import type {
  AgentProfile,
  CapabilityRecord,
  MarketplaceCatalogDocument,
  MarketplaceCategoryId,
} from "./types.ts";

export type AgentCapabilityView = {
  readonly record: CapabilityRecord;
  readonly quality: ListingQualityAssessment;
};

export type AgentPresentation = {
  readonly agentIdentityKey: AgentIdentityKey;
  readonly agent: AgentProfile;
  readonly displayName: string;
  readonly registrationNetwork: RegistrationNetworkInfo;
  readonly canonicalRegistrationKey: string | null;
  readonly registered: boolean;
  readonly operatorKnown: boolean;
  readonly originLabel: string;
  readonly capabilities: readonly AgentCapabilityView[];
  readonly curatedCapabilityCount: number;
  readonly incompleteCapabilityCount: number;
  readonly totalCapabilityCount: number;
  readonly categories: readonly MarketplaceCategoryId[];
  readonly hasOfflineDemo: boolean;
  readonly linkageWarnings: readonly string[];
};

export type AgentDirectoryQuery = {
  readonly network?: RegistrationNetworkFilter;
  readonly category?: MarketplaceCategoryId;
  readonly listingScope?: ListingScope;
  readonly agentIdentityKeys?: readonly AgentIdentityKey[];
};

function originLabel(agent: AgentProfile): string {
  if (agent.origin === "agenthire-operated") {
    return "AgentHire operated reference";
  }
  if (agent.registryAddress && agent.agentId) {
    return "ERC-8004 registered agent";
  }
  return "Discovery-derived profile (unregistered on this row)";
}

function linkageWarningsFor(
  agent: AgentProfile,
  catalog: MarketplaceCatalogDocument,
): string[] {
  const warnings: string[] = [];
  const name = (agent.displayName ?? "").toLowerCase();
  if (!name.includes("quantjourney")) return warnings;

  const peers = catalog.agents.filter(
    (a) =>
      a.agentProfileId !== agent.agentProfileId &&
      (a.displayName ?? "").toLowerCase().includes("quantjourney"),
  );
  for (const peer of peers) {
    const leftKey = canonicalRegistrationKeyOf(agent);
    const rightKey = canonicalRegistrationKeyOf(peer);
    if (leftKey && rightKey && leftKey === rightKey) continue;
    warnings.push(
      `Kept separate from "${peer.displayName ?? peer.agentProfileId}" — name resemblance is not provenance-validated linkage. Owner ≠ authenticated operator.`,
    );
  }
  return warnings;
}

export function buildAgentPresentation(
  agent: AgentProfile,
  capabilities: readonly CapabilityRecord[],
  catalog: MarketplaceCatalogDocument,
): AgentPresentation {
  const views: AgentCapabilityView[] = capabilities.map((record) => ({
    record,
    quality: assessListingQuality(record),
  }));
  views.sort((a, b) => {
    if (a.quality.qualifiesCurated !== b.quality.qualifiesCurated) {
      return a.quality.qualifiesCurated ? -1 : 1;
    }
    return a.quality.publicTitle.localeCompare(b.quality.publicTitle);
  });

  const categories = [
    ...new Set(capabilities.flatMap((c) => [...c.categories])),
  ].sort() as MarketplaceCategoryId[];

  return {
    agentIdentityKey: agentIdentityKeyOf(agent),
    agent,
    displayName: agent.displayName?.trim() || agent.agentProfileId,
    registrationNetwork: classifyRegistrationNetwork(agent),
    canonicalRegistrationKey: canonicalRegistrationKeyOf(agent),
    registered: Boolean(agent.registryAddress && agent.agentId),
    operatorKnown: Boolean(agent.providerId || agent.registryAddress),
    originLabel: originLabel(agent),
    capabilities: views,
    curatedCapabilityCount: views.filter((v) => v.quality.qualifiesCurated)
      .length,
    incompleteCapabilityCount: views.filter((v) => v.quality.incomplete)
      .length,
    totalCapabilityCount: views.length,
    categories,
    hasOfflineDemo: capabilities.some(
      (c) => c.capabilityId === SEC_IDENTITY_CAPABILITY_ID,
    ),
    linkageWarnings: linkageWarningsFor(agent, catalog),
  };
}

export function buildAgentDirectory(
  catalog: MarketplaceCatalogDocument,
): readonly AgentPresentation[] {
  const byAgent = new Map<string, CapabilityRecord[]>();
  for (const cap of catalog.capabilities) {
    const list = byAgent.get(cap.agentProfileId) ?? [];
    list.push(cap);
    byAgent.set(cap.agentProfileId, list);
  }

  const presentations = catalog.agents.map((agent) =>
    buildAgentPresentation(
      agent,
      byAgent.get(agent.agentProfileId) ?? [],
      catalog,
    ),
  );

  return [...presentations].sort((a, b) => {
    if (a.registered !== b.registered) return a.registered ? -1 : 1;
    const byName = a.displayName.localeCompare(b.displayName);
    if (byName !== 0) return byName;
    return a.agentIdentityKey.localeCompare(b.agentIdentityKey);
  });
}

export function filterAgentDirectory(
  agents: readonly AgentPresentation[],
  query: AgentDirectoryQuery = {},
): readonly AgentPresentation[] {
  const network = query.network ?? "all";
  const scope = query.listingScope ?? "curated";
  const allow = query.agentIdentityKeys
    ? new Set(query.agentIdentityKeys)
    : null;

  const out: AgentPresentation[] = [];
  for (const agent of agents) {
    if (allow && !allow.has(agent.agentIdentityKey)) continue;
    if (network !== "all" && agent.registrationNetwork.id !== network) {
      continue;
    }
    if (query.category && !agent.categories.includes(query.category)) {
      continue;
    }

    const filteredCaps = agent.capabilities.filter((c) =>
      matchesListingScope(c.quality, scope),
    );
    if (scope !== "all" && filteredCaps.length === 0) continue;

    out.push({
      ...agent,
      capabilities: scope === "all" ? agent.capabilities : filteredCaps,
    });
  }
  return out;
}

export function getAgentPresentationByKey(
  catalog: MarketplaceCatalogDocument,
  agentIdentityKey: AgentIdentityKey,
): AgentPresentation | null {
  const agent = catalog.agents.find(
    (a) => a.agentProfileId === agentIdentityKey,
  );
  if (!agent) return null;
  const caps = catalog.capabilities.filter(
    (c) => c.agentProfileId === agentIdentityKey,
  );
  return buildAgentPresentation(agent, caps, catalog);
}

export type CategoryAgentSummary = {
  readonly categoryId: MarketplaceCategoryId;
  readonly agentCount: number;
  readonly curatedCapabilityCount: number;
  readonly totalCapabilityCount: number;
  readonly agents: readonly AgentPresentation[];
};

export function agentsForCategory(
  catalog: MarketplaceCatalogDocument,
  categoryId: MarketplaceCategoryId,
  options: {
    readonly network?: RegistrationNetworkFilter;
    readonly listingScope?: ListingScope;
  } = {},
): CategoryAgentSummary {
  const directory = filterAgentDirectory(buildAgentDirectory(catalog), {
    category: categoryId,
    network: options.network ?? "all",
    listingScope: options.listingScope ?? "curated",
  });
  let curatedCapabilityCount = 0;
  let totalCapabilityCount = 0;
  for (const a of directory) {
    curatedCapabilityCount += a.capabilities.filter(
      (c) => c.quality.qualifiesCurated,
    ).length;
    totalCapabilityCount += a.totalCapabilityCount;
  }
  return {
    categoryId,
    agentCount: directory.length,
    curatedCapabilityCount,
    totalCapabilityCount,
    agents: directory,
  };
}

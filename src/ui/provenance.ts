/**
 * Capability detail provenance helpers (D5.6).
 */

import { SEC_IDENTITY_CAPABILITY_ID } from "../adapters/quantjourney-sec-identity.ts";
import {
  assessIdentityLinkage,
  type IdentityProfileFacts,
} from "../marketplace/identity-linkage.ts";
import type { AgentProfile, CapabilityRecord } from "../marketplace/types.ts";
import { getAgentForCapability, loadMarketplaceCatalog } from "./catalog-store.ts";

export type ProvenanceView = {
  readonly capabilityId: string;
  readonly agentProfileId: string;
  readonly agentDisplayName: string | null;
  readonly provenance: CapabilityRecord["provenance"];
  readonly sourceKind: CapabilityRecord["sourceKind"];
  readonly erc8004: {
    readonly registered: boolean;
    readonly registryChainId: number | null;
    readonly registryAddress: string | null;
    readonly agentId: string | null;
    readonly providerId: string | null;
  };
  readonly discoveryWarnings: readonly string[];
  readonly quantJourneyAmbiguity: string | null;
  readonly plannedSellerNote: string | null;
  readonly identityLinkageNote: string | null;
};

function toFacts(agent: AgentProfile, sourceKinds: string[]): IdentityProfileFacts {
  return {
    agentProfileId: agent.agentProfileId,
    displayName: agent.displayName,
    providerId: agent.providerId,
    registryChainId: agent.registryChainId,
    registryAddress: agent.registryAddress,
    agentId: agent.agentId,
    origin: agent.origin,
    sourceKinds,
  };
}

export function buildProvenanceView(
  record: CapabilityRecord,
  repoRoot?: string,
): ProvenanceView {
  const agent = getAgentForCapability(record, repoRoot);
  const catalog = loadMarketplaceCatalog(repoRoot);
  const discoveryWarnings: string[] = [];

  if (record.sourceKind === "agent-card-skill") {
    discoveryWarnings.push(
      "Discovery evidence from agent-card skill — documentation only, not B4 verified.",
    );
  }
  if (record.sourceKind === "x402-resource") {
    discoveryWarnings.push(
      "x402 advertised resource — discoverable ≠ payable; inspectionStatus notChecked.",
    );
  }

  let quantJourneyAmbiguity: string | null = null;
  let identityLinkageNote: string | null = null;

  if (
    record.capabilityId === SEC_IDENTITY_CAPABILITY_ID ||
    record.providerKey.includes("QuantJourney")
  ) {
    quantJourneyAmbiguity =
      "Discovery-derived QuantJourney profile and ERC-8004 QuantJourney Research Agent Fabric are not proven as the same registered identity. Owner ≠ authenticated operator.";

    const discoveryAgent = agent;
    const erc = catalog.agents.find(
      (a) =>
        a.displayName?.toLowerCase().includes("quantjourney") &&
        a.providerId != null,
    );
    if (discoveryAgent && erc) {
      const assessment = assessIdentityLinkage(
        toFacts(discoveryAgent, [record.sourceKind]),
        toFacts(erc, ["erc8004-service"]),
      );
      identityLinkageNote = `Linkage verdict: ${assessment.verdict}; safeToMergeProfiles=${assessment.safeToMergeProfiles}.`;
    }
  }

  let plannedSellerNote: string | null = null;
  if (
    record.provenance === "agenthire-operated" ||
    record.sourceKind === "agenthire-planned"
  ) {
    plannedSellerNote =
      "Planned AgentHire seller / reference capability — not an independently verified registered external agent.";
  }

  return {
    capabilityId: record.capabilityId,
    agentProfileId: record.agentProfileId,
    agentDisplayName: record.agentDisplayName,
    provenance: record.provenance,
    sourceKind: record.sourceKind,
    erc8004: {
      registered: Boolean(agent?.registryAddress && agent?.agentId),
      registryChainId: agent?.registryChainId ?? null,
      registryAddress: agent?.registryAddress ?? null,
      agentId: agent?.agentId ?? null,
      providerId: agent?.providerId ?? null,
    },
    discoveryWarnings,
    quantJourneyAmbiguity,
    plannedSellerNote,
    identityLinkageNote,
  };
}

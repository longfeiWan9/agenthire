/**
 * QuantJourney interface-discovery plan (D5.3).
 *
 * Built from local evidence only — no fetch.
 * Max 2 exact source-declared URLs.
 * Empty proposals when no exact OpenAPI/skill URL is source-declared.
 * Do not invent OpenAPI/skill URLs.
 * approvedForNetworkExecution always false.
 */

import {
  SEC_IDENTITY_CAPABILITY_ID,
  SEC_IDENTITY_PROVIDER_KEY,
  SEC_IDENTITY_SERVICE_KEY,
} from "../adapters/quantjourney-sec-identity.ts";

export const INTERFACE_DISCOVERY_PLAN_VERSION = "1.0" as const;
export const INTERFACE_DISCOVERY_MAX_PROPOSALS = 2 as const;

export type InterfaceDocumentProposal = {
  readonly proposalId: string;
  readonly exactUrl: string;
  readonly documentKind: "openapi" | "skill-route" | "other";
  readonly sourceEvidenceId: string;
  readonly sourceDeclared: true;
  readonly approvedForNetworkExecution: false;
  readonly note: string;
};

export type QuantJourneyInterfaceDiscoveryPlan = {
  readonly schemaVersion: typeof INTERFACE_DISCOVERY_PLAN_VERSION;
  readonly mode: "STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_FETCH";
  readonly capabilityId: typeof SEC_IDENTITY_CAPABILITY_ID;
  readonly providerKey: typeof SEC_IDENTITY_PROVIDER_KEY;
  readonly serviceKey: typeof SEC_IDENTITY_SERVICE_KEY;
  readonly agentCardUrl: string;
  readonly agentCardEvidenceId: "DISC-004";
  /**
   * Exact URLs declared by the provider source for interface docs.
   * Empty when the agent-card / selected-capability do not declare an
   * exact OpenAPI or skill endpoint URL (url=null; method/endpoint unknown).
   */
  readonly proposals: readonly InterfaceDocumentProposal[];
  readonly maxProposals: typeof INTERFACE_DISCOVERY_MAX_PROPOSALS;
  readonly approvedForNetworkExecution: false;
  readonly fetchPerformed: false;
  readonly notes: readonly string[];
};

/**
 * Local evidence facts (no I/O):
 * - DISC-004 agent-card: documentSummary.url = null
 * - selected-capability.json: httpMethod=null, endpointUrl=null, openapiInventory=null
 * - Card description mentions OpenAPI generically but does not declare an exact URL
 * - Agent-card URL is discovery-only, not a skill/OpenAPI endpoint
 *
 * Therefore proposals = [] — do not invent https://agents.quantjourney.cloud/openapi.json
 * or any skill route.
 */
export function buildQuantJourneyInterfaceDiscoveryPlan(): QuantJourneyInterfaceDiscoveryPlan {
  return {
    schemaVersion: INTERFACE_DISCOVERY_PLAN_VERSION,
    mode: "STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_FETCH",
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    serviceKey: SEC_IDENTITY_SERVICE_KEY,
    agentCardUrl:
      "https://agents.quantjourney.cloud/.well-known/agent-card.json",
    agentCardEvidenceId: "DISC-004",
    proposals: [],
    maxProposals: INTERFACE_DISCOVERY_MAX_PROPOSALS,
    approvedForNetworkExecution: false,
    fetchPerformed: false,
    notes: [
      "Local evidence only — zero network fetch in D5.3",
      "DISC-004 documentSummary.url is null; no exact OpenAPI URL source-declared",
      "selected-capability interfaceDocumentedDetail: httpMethod=null, endpointUrl=null, openapiInventory=null",
      "Card text mentions OpenAPI query routes generically — not an exact allowlistable URL",
      "Agent-card URL is discovery-only and must not be treated as a skill endpoint",
      "Do not invent OpenAPI or skill URLs",
      "proposals empty because no source-declared exact interface document URL exists (max 2 if any)",
      "approvedForNetworkExecution=false",
    ],
  };
}

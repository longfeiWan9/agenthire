/**
 * Offline service-interface assessment (D4.3b).
 *
 * Combines Day-3 catalog + D4.2 manifest + D4.3a discovery evidence.
 * Zero DNS / HTTP / signing. Does not upgrade B4 milestones.
 */

import {
  MVP_TASK_ID,
  type TaskRelevance,
} from "./inspection-policy.ts";
import type {
  ProviderCatalogDocument,
  ProviderRecord,
  ProviderService,
} from "./types.ts";

export const SERVICE_INTERFACE_ASSESSMENT_VERSION = "1.0" as const;

export type HttpMethodOrNull = "GET" | "HEAD" | "POST" | null;

export type ServiceInterfaceEvidenceSource =
  | "provider-catalog"
  | "inspection-manifest"
  | "discovery-inspection"
  | "registration-metadata";

export type ServiceInterfaceAssessment = {
  readonly providerId: string;
  readonly providerName: string | null;
  readonly agentId: string;
  readonly registryChainId: 8453 | 84532;
  readonly serviceId: string;
  /** Skill id when known from discovery agent-card; otherwise null. */
  readonly skillId: string | null;
  readonly endpointUrl: string;
  readonly method: HttpMethodOrNull;
  readonly catalogMethod: ProviderService["method"];
  readonly requestSchema: "unknown" | "notChecked" | "documented";
  readonly responseSchema: "unknown" | "notChecked" | "documented";
  readonly auth: "unknown" | "noneObserved" | "x402AdvertisedProviderScope";
  readonly taskDescription: string | null;
  readonly claimedTaskTypes: readonly string[];
  readonly taskRelevance: TaskRelevance;
  readonly explicitMvpTaskMatch: boolean;
  readonly x402ClaimScope: "none" | "provider" | "serviceDescription" | "unknown";
  readonly paymentNetworks: readonly string[];
  readonly evidenceSources: readonly ServiceInterfaceEvidenceSource[];
  readonly evidenceIds: readonly string[];
  readonly discoveryStatus: string | null;
  readonly unknowns: readonly string[];
  readonly notes: string;
};

export type ProposedServiceInspection = {
  readonly proposalId: string;
  readonly providerId: string;
  readonly serviceId: string;
  readonly exactUrl: string;
  readonly method: HttpMethodOrNull;
  readonly headers: Record<string, string> | null;
  readonly bodyTemplate: null;
  readonly expectedUnsignedBehavior: string;
  readonly taskRelevance: TaskRelevance;
  readonly documentationEvidenceIds: readonly string[];
  readonly outstandingSafetyQuestions: readonly string[];
  readonly approvedForNetworkExecution: false;
  readonly worth: string;
  readonly sideEffectRisk: string;
  readonly unsignedChallengePotential: string;
  readonly remainingAuthorization: string;
};

export type ProposedServiceInspectionsDocument = {
  readonly schemaVersion: "1.0";
  readonly mode: "READ_ONLY / NO_SIGNING / NO_PAYMENT / NO_NEW_PROVIDER_REQUESTS";
  readonly kind: "proposedServiceInspections";
  readonly assessmentVersion: typeof SERVICE_INTERFACE_ASSESSMENT_VERSION;
  readonly mvpTaskId: typeof MVP_TASK_ID;
  readonly source: {
    readonly catalogPath: string;
    readonly catalogSnapshotAsOf: string;
    readonly discoveryEvidencePath: string;
    readonly discoveryCapturedAt: string | null;
  };
  readonly proposalCount: number;
  readonly maxProposals: 3;
  readonly proposals: readonly ProposedServiceInspection[];
  readonly notes: string;
};

export type DiscoveryEvidenceLike = {
  readonly capturedAt?: string;
  readonly evidences?: readonly {
    readonly discoveryId?: string;
    readonly provider?: string;
    readonly approvedUrl?: string;
    readonly status?: string;
    readonly documentSummary?: {
      readonly kind?: string;
      readonly skills?: readonly {
        readonly id?: string | null;
        readonly name?: string | null;
        readonly description?: string | null;
      }[];
      readonly skillIds?: readonly string[];
    } | null;
    readonly documentationCompatibility?: {
      readonly explicitSkillMatch?: boolean;
      readonly matchedSkillIds?: readonly string[];
      readonly relatedHints?: readonly string[];
    } | null;
  }[];
};

function providerDisplayName(record: ProviderRecord): string | null {
  return record.registration.advertisedName;
}

function assessTaskRelevance(claimed: readonly string[]): {
  readonly taskRelevance: TaskRelevance;
  readonly explicitMvpTaskMatch: boolean;
} {
  const normalized = claimed.map((c) => c.trim().toLowerCase());
  if (
    normalized.includes("wallet-activity-summary@1.0") ||
    normalized.includes("wallet-activity-summary")
  ) {
    return { taskRelevance: "explicitMatch", explicitMvpTaskMatch: true };
  }
  const related = normalized.some(
    (c) =>
      c.includes("wallet-activity") ||
      c.includes("wallet_activity") ||
      c.includes("wallet-analytics") ||
      c.includes("wallet_analytics") ||
      c.includes("activity-summary"),
  );
  if (related) {
    return { taskRelevance: "potentiallyRelated", explicitMvpTaskMatch: false };
  }
  if (claimed.length === 0) {
    return { taskRelevance: "unknown", explicitMvpTaskMatch: false };
  }
  return { taskRelevance: "unrelated", explicitMvpTaskMatch: false };
}

type DiscoveryEvidenceEntry = NonNullable<
  DiscoveryEvidenceLike["evidences"]
>[number];

function discoveryForUrl(
  discovery: DiscoveryEvidenceLike | null | undefined,
  url: string,
): DiscoveryEvidenceEntry | null {
  if (!discovery?.evidences) return null;
  for (const ev of discovery.evidences) {
    if (ev.approvedUrl === url) return ev;
  }
  return null;
}

function skillsForProvider(
  discovery: DiscoveryEvidenceLike | null | undefined,
  providerHint: string,
): readonly { id: string | null; name: string | null; description: string | null }[] {
  if (!discovery?.evidences) return [];
  for (const ev of discovery.evidences) {
    if (
      ev.status === "success" &&
      ev.documentSummary?.kind === "agent-card" &&
      (ev.provider === providerHint ||
        ev.approvedUrl?.includes(providerHint.toLowerCase().replace(/\s+/g, "")))
    ) {
      return (ev.documentSummary.skills ?? []).map((s) => ({
        id: s.id ?? null,
        name: s.name ?? null,
        description: s.description ?? null,
      }));
    }
  }
  // Match by known hosts.
  for (const ev of discovery.evidences) {
    if (ev.status !== "success" || ev.documentSummary?.kind !== "agent-card") {
      continue;
    }
    if (providerHint === "Agent402" && ev.approvedUrl?.includes("agent402.tools")) {
      return (ev.documentSummary.skills ?? []).map((s) => ({
        id: s.id ?? null,
        name: s.name ?? null,
        description: s.description ?? null,
      }));
    }
    if (
      providerHint === "QuantJourney" &&
      ev.approvedUrl?.includes("quantjourney.cloud")
    ) {
      return (ev.documentSummary.skills ?? []).map((s) => ({
        id: s.id ?? null,
        name: s.name ?? null,
        description: s.description ?? null,
      }));
    }
    if (
      providerHint === "Agent Zero" &&
      ev.approvedUrl?.includes("onchainagentintel.io")
    ) {
      return (ev.documentSummary.skills ?? []).map((s) => ({
        id: s.id ?? null,
        name: s.name ?? null,
        description: s.description ?? null,
      }));
    }
  }
  return [];
}

/**
 * Assess catalog services using only local evidence (no network).
 */
export function assessProviderServices(input: {
  readonly catalog: ProviderCatalogDocument;
  readonly discovery?: DiscoveryEvidenceLike | null;
}): readonly ServiceInterfaceAssessment[] {
  const out: ServiceInterfaceAssessment[] = [];
  const discovery = input.discovery ?? null;

  for (const provider of input.catalog.providers) {
    const name = providerDisplayName(provider);
    const hint = name ?? provider.providerId;
    const skills = skillsForProvider(discovery, name ?? "");
    const skillIds = skills.map((s) => s.id).filter((id): id is string => !!id);

    for (const service of provider.services) {
      const disc = discoveryForUrl(discovery, service.endpointUrl);
      const unknowns: string[] = [];
      const evidenceSources: ServiceInterfaceEvidenceSource[] = [
        "provider-catalog",
      ];
      const evidenceIds = [...provider.operational.evidenceIds];

      if (disc) {
        evidenceSources.push("discovery-inspection");
        if (disc.discoveryId) evidenceIds.push(disc.discoveryId);
      }

      // Catalog method OTHER is not an explicit GET/POST/HEAD.
      let method: HttpMethodOrNull = null;
      if (service.method === "GET" || service.method === "POST") {
        method = service.method;
      } else {
        unknowns.push("catalogMethodOTHER_notExplicitHttpVerb");
      }

      if (service.requestSchemaStatus === "notChecked") {
        unknowns.push("requestSchemaNotChecked");
      }
      if (service.claimedTaskTypes.length === 0) {
        unknowns.push("noClaimedTaskTypes");
      }

      let x402ClaimScope: ServiceInterfaceAssessment["x402ClaimScope"] = "unknown";
      if (provider.payment.x402Advertised === true) {
        x402ClaimScope = "provider";
      } else if (provider.payment.x402Advertised === false) {
        x402ClaimScope = "none";
      }
      if (
        typeof service.description === "string" &&
        /x402/i.test(service.description)
      ) {
        x402ClaimScope =
          x402ClaimScope === "provider" ? "provider" : "serviceDescription";
      }

      if (provider.payment.observedOffers.length === 0) {
        unknowns.push("noObservedX402Offers");
      }
      if (provider.payment.advertisedNetworks.length === 0) {
        unknowns.push("advertisedNetworksUnspecified");
      }

      const { taskRelevance, explicitMvpTaskMatch } = assessTaskRelevance(
        service.claimedTaskTypes,
      );

      // Agent-card skills are not claimedTaskTypes on the catalog service.
      let skillId: string | null = null;
      let taskDescription = service.description;
      if (
        service.endpointUrl.endsWith("/.well-known/agent-card.json") &&
        skillIds.length > 0
      ) {
        unknowns.push("agentCardSkillsNotCatalogTaskTypes");
        // Do not invent a single skill binding to the card URL itself.
        skillId = null;
        if (!explicitMvpTaskMatch) {
          unknowns.push("noExplicitWalletActivitySummarySkill");
        }
      }

      // x402-index skill is a seller index, not a payment endpoint.
      if (skillIds.includes("x402-index")) {
        unknowns.push("x402IndexSkillIsNotPaymentEndpoint");
      }

      const auth: ServiceInterfaceAssessment["auth"] =
        provider.payment.x402Advertised === true
          ? "x402AdvertisedProviderScope"
          : "unknown";

      const discoveryStatus = disc?.status ?? null;
      if (discoveryStatus === "networkError" || discoveryStatus === "oversized") {
        unknowns.push(`discovery_${discoveryStatus}`);
      }

      const notesParts: string[] = [];
      if (name === "Agent Zero" && discoveryStatus === "networkError") {
        notesParts.push(
          "Agent Zero discovery inconclusive (ECONNRESET); no invented card contents",
        );
      }
      if (name === "Agent402" && service.serviceId.startsWith("openapi")) {
        notesParts.push(
          "OpenAPI live GET aborted oversized (>256 KiB); no path inventory from live body",
        );
      }
      if (skillIds.length > 0 && service.endpointUrl.includes("agent-card")) {
        notesParts.push(
          `Agent-card skills observed locally: ${skillIds.join(", ")} — none equal ${MVP_TASK_ID}`,
        );
      }
      if (x402ClaimScope === "provider") {
        notesParts.push(
          "Provider-level x402Advertised=true is not per-service payment proof",
        );
      }
      if (
        service.endpointUrl.endsWith("/.well-known/x402") &&
        typeof service.description === "string" &&
        /x402\s*\(v2\)/i.test(service.description)
      ) {
        notesParts.push(
          "Service description mentions x402 (v2); still no observed HTTP 402 offer",
        );
      }

      out.push({
        providerId: provider.providerId,
        providerName: name,
        agentId: provider.identity.agentId,
        registryChainId: provider.identity.registryChainId,
        serviceId: service.serviceId,
        skillId,
        endpointUrl: service.endpointUrl,
        method,
        catalogMethod: service.method,
        requestSchema:
          service.requestSchemaStatus === "verified"
            ? "documented"
            : service.requestSchemaStatus === "notChecked"
              ? "notChecked"
              : "unknown",
        responseSchema: "notChecked",
        auth,
        taskDescription,
        claimedTaskTypes: service.claimedTaskTypes,
        taskRelevance,
        explicitMvpTaskMatch,
        x402ClaimScope,
        paymentNetworks: provider.payment.advertisedNetworks,
        evidenceSources,
        evidenceIds,
        discoveryStatus,
        unknowns,
        notes: notesParts.join(" "),
      });
    }

    // Emit skill-level rows for successful agent-card parses (documentation only).
    for (const skill of skills) {
      if (!skill.id) continue;
      const skillClaimed = [skill.id];
      const { taskRelevance, explicitMvpTaskMatch } =
        assessTaskRelevance(skillClaimed);
      out.push({
        providerId: provider.providerId,
        providerName: name,
        agentId: provider.identity.agentId,
        registryChainId: provider.identity.registryChainId,
        serviceId: `skill:${skill.id}`,
        skillId: skill.id,
        endpointUrl: "unknown",
        method: null,
        catalogMethod: "OTHER",
        requestSchema: "unknown",
        responseSchema: "unknown",
        auth: "unknown",
        taskDescription: skill.description ?? skill.name,
        claimedTaskTypes: skillClaimed,
        taskRelevance,
        explicitMvpTaskMatch,
        x402ClaimScope:
          skill.id === "x402-index"
            ? "unknown"
            : provider.payment.x402Advertised
              ? "provider"
              : "none",
        paymentNetworks: [],
        evidenceSources: ["discovery-inspection"],
        evidenceIds: provider.operational.evidenceIds,
        discoveryStatus: "success",
        unknowns: [
          "skillEndpointUrlUnknown",
          "skillHttpMethodUnknown",
          "skillRequestSchemaUnknown",
          ...(skill.id === "x402-index"
            ? (["x402IndexSkillIsNotPaymentEndpoint"] as const)
            : []),
          ...(!explicitMvpTaskMatch
            ? (["keywordOrSkillIdNotExactMvpTask"] as const)
            : []),
        ],
        notes:
          skill.id === "x402-index"
            ? "x402-index describes a seller index skill — not a payment challenge endpoint"
            : `Discovery skill documentation only; not a B4 upgrade; exact MVP match=${explicitMvpTaskMatch}`,
      });
    }
  }

  return out;
}

/**
 * Build ≤3 unapproved proposed unsigned inspections from local evidence.
 * Only exact catalog URLs already present in Day-3/Day-4 artifacts.
 */
export function buildProposedServiceInspections(input: {
  readonly catalog: ProviderCatalogDocument;
  readonly discovery?: DiscoveryEvidenceLike | null;
  readonly catalogPath?: string;
  readonly discoveryEvidencePath?: string;
}): ProposedServiceInspectionsDocument {
  const catalogPath = input.catalogPath ?? "docs/evidence/provider-catalog.json";
  const discoveryEvidencePath =
    input.discoveryEvidencePath ??
    "docs/day4/evidence/discovery-inspection.json";
  const discovery = input.discovery ?? null;

  const candidates: ProposedServiceInspection[] = [];

  const byUrl = (url: string): ProviderService & { provider: ProviderRecord } | null => {
    for (const provider of input.catalog.providers) {
      for (const service of provider.services) {
        if (service.endpointUrl === url) {
          return { ...service, provider };
        }
      }
    }
    return null;
  };

  // 1) Agent402 .well-known/x402 — catalogued, never contacted in D4.3a.
  {
    const url = "https://agent402.tools/.well-known/x402";
    const hit = byUrl(url);
    if (hit) {
      candidates.push({
        proposalId: "PSI-001",
        providerId: hit.provider.providerId,
        serviceId: hit.serviceId,
        exactUrl: url,
        method: "GET",
        headers: { Accept: "application/json" },
        bodyTemplate: null,
        expectedUnsignedBehavior:
          "Unsigned discovery GET may return an x402 configuration / offer document or an HTTP 402 Payment Required envelope. Treat body/headers as untrusted data. No PAYMENT-SIGNATURE.",
        taskRelevance: "unknown",
        documentationEvidenceIds: [
          ...hit.provider.operational.evidenceIds,
          "DISC-002",
        ],
        outstandingSafetyQuestions: [
          "Confirm GET is safe and idempotent for this exact path",
          "Confirm response ≤256 KiB and no redirect follow",
          "Confirm no cookies/Authorization attached",
          "Sepolia vs Mainnet offer fields still require policy eval after capture",
          "Does not establish wallet-activity-summary@1.0 compatibility",
        ],
        approvedForNetworkExecution: false,
        worth:
          "Provider advertises x402; agent-card exposes PAYMENT-REQUIRED response headers capability; .well-known/x402 never contacted in D4.3a",
        sideEffectRisk:
          "Low if true static discovery document; unknown if endpoint triggers metering — fail closed, no retries",
        unsignedChallengePotential:
          "May yield parsable unsigned challenge or payment metadata for offline policy eval",
        remainingAuthorization:
          "Human must set approvedForNetworkExecution true for this exact URL/method only",
      });
    }
  }

  // 2) QuantJourney .well-known/x402 — description "x402 (v2)", never contacted.
  {
    const url = "https://agents.quantjourney.cloud/.well-known/x402";
    const hit = byUrl(url);
    if (hit) {
      candidates.push({
        proposalId: "PSI-002",
        providerId: hit.provider.providerId,
        serviceId: hit.serviceId,
        exactUrl: url,
        method: "GET",
        headers: { Accept: "application/json" },
        bodyTemplate: null,
        expectedUnsignedBehavior:
          "Unsigned discovery GET may return x402 v2 metadata or 402/503. Historical research mentioned 503 x402_not_configured — do not invent current status. No signing.",
        taskRelevance: "unknown",
        documentationEvidenceIds: [
          ...hit.provider.operational.evidenceIds,
          "DISC-004",
        ],
        outstandingSafetyQuestions: [
          "Confirm GET-only and no side effects",
          "Registration on Sepolia ≠ payment network proof — still parse/policy separately",
          "Prior 503 is historical only; live outcome unknown",
          "No MVP task skill on agent-card — payment doc ≠ task compatibility",
        ],
        approvedForNetworkExecution: false,
        worth:
          "Catalog service description explicitly says x402 (v2); endpoint never contacted; needed to observe offers",
        sideEffectRisk: "Unknown; treat as discovery document with streaming size cap",
        unsignedChallengePotential:
          "Possible unsigned x402 v2 document or challenge for offline parser/policy",
        remainingAuthorization:
          "Human must approve this exact URL/method; no sibling path expansion",
      });
    }
  }

  // 3) Agent402 OpenAPI — already attempted; oversized. Propose only as documentation
  // follow-up requiring separate size-cap authorization (still unapproved; method GET).
  {
    const url = "https://agent402.tools/openapi.json";
    const hit = byUrl(url);
    const disc = discoveryForUrl(discovery, url);
    if (hit && disc?.status === "oversized") {
      candidates.push({
        proposalId: "PSI-003",
        providerId: hit.provider.providerId,
        serviceId: hit.serviceId,
        exactUrl: url,
        method: "GET",
        headers: { Accept: "application/json" },
        bodyTemplate: null,
        expectedUnsignedBehavior:
          "Previous D4.3a GET aborted at 256 KiB (oversized). A future fetch requires separate authorization to raise the size cap for this exact URL only. No operation execution from OpenAPI paths.",
        taskRelevance: "unknown",
        documentationEvidenceIds: [
          ...hit.provider.operational.evidenceIds,
          "DISC-003",
        ],
        outstandingSafetyQuestions: [
          "Requires explicit size-limit raise authorization (not granted in D4.3b)",
          "OpenAPI $ref must not be followed",
          "Discovered operations remain unapproved",
          "Still no proof of wallet-activity-summary@1.0",
        ],
        approvedForNetworkExecution: false,
        worth:
          "Only local evidence of a large OpenAPI surface that may document priced endpoints; current body unavailable due to size cap",
        sideEffectRisk:
          "Bandwidth/DoS risk if size cap raised carelessly; keep streaming abort",
        unsignedChallengePotential:
          "Unlikely to return HTTP 402 itself; may document which operations advertise payment",
        remainingAuthorization:
          "Separate auth for size-cap raise + this exact URL; D4.3b stop forbids raising without that auth",
      });
    }
  }

  const proposals = candidates.slice(0, 3);

  return {
    schemaVersion: "1.0",
    mode: "READ_ONLY / NO_SIGNING / NO_PAYMENT / NO_NEW_PROVIDER_REQUESTS",
    kind: "proposedServiceInspections",
    assessmentVersion: SERVICE_INTERFACE_ASSESSMENT_VERSION,
    mvpTaskId: MVP_TASK_ID,
    source: {
      catalogPath,
      catalogSnapshotAsOf: input.catalog.snapshotAsOf,
      discoveryEvidencePath,
      discoveryCapturedAt: discovery?.capturedAt ?? null,
    },
    proposalCount: proposals.length,
    maxProposals: 3,
    proposals,
    notes:
      "All proposals have approvedForNetworkExecution:false. No new provider HTTP in D4.3b. Agent Zero discovery remains inconclusive — no invented third-party URLs.",
  };
}

/**
 * AgentHire marketplace domain types (D4.5).
 *
 * Hybrid capability discovery — categories aid discoverability; they never
 * restrict what may be listed. STRICTLY_OFFLINE: types + offline catalog only.
 * No execution, payment, or network I/O.
 *
 * Entities: AgentProfile · ServiceCapability · HireJob (boundaries only).
 */

import type {
  CheckResult,
  VerificationStatus,
} from "../providers/types.ts";

export const MARKETPLACE_SCHEMA_VERSION = "1.0" as const;
export const MARKETPLACE_MODE =
  "READ_ONLY / NO_SIGNING / NO_PAYMENT / STRICTLY_OFFLINE" as const;

/** Curated marketplace categories (+ fallback). Multi-category OK. */
export type MarketplaceCategoryId =
  | "research-intelligence"
  | "data-analytics"
  | "content-documents"
  | "developer-tools"
  | "other";

export type CapabilityProvenance = "external" | "agenthire-operated";

export type CapabilitySourceKind =
  | "erc8004-service"
  | "agent-card-skill"
  | "x402-resource"
  | "agenthire-planned";

/**
 * Derived verification view — reuses B3/B4 vocabulary only.
 * Never invent a marketplace-only `verified` shortcut.
 */
export type DerivedVerificationView = {
  readonly endpointStatus: VerificationStatus;
  readonly requestSchemaStatus: VerificationStatus;
  readonly derivedMilestone:
    | "unverified"
    | "discovered"
    | "metadataValidated"
    | "endpointReachable"
    | "challengeVerified"
    | "paymentCompatible"
    | "paidVerified";
  readonly registryIdentity: CheckResult;
  readonly registrationMetadata: CheckResult;
  readonly endpointReachability: CheckResult;
  readonly paymentPolicy: CheckResult;
  readonly notes: string;
};

export type ProtocolHint =
  | "erc8004"
  | "a2a"
  | "mcp"
  | "openapi"
  | "x402"
  | "web"
  | "agenthire-task"
  | "unknown";

export type AgentProfile = {
  readonly agentProfileId: string;
  readonly displayName: string | null;
  readonly providerId: string | null;
  readonly origin: CapabilityProvenance;
  readonly registryChainId: number | null;
  readonly registryAddress: string | null;
  readonly agentId: string | null;
  readonly sourcePaths: readonly string[];
};

/**
 * ServiceCapability — advertised or planned ability.
 * Categories discover; they do not gate listing.
 */
export type ServiceCapability = {
  readonly capabilityId: string;
  readonly agentProfileId: string;
  readonly providerKey: string;
  readonly serviceKey: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly provenance: CapabilityProvenance;
  readonly sourceKind: CapabilitySourceKind;
  readonly categories: readonly MarketplaceCategoryId[];
  /** Original upstream labels preserved (never discarded). */
  readonly originalLabels: readonly string[];
  readonly protocols: readonly ProtocolHint[];
  readonly method: string | null;
  readonly endpointUrl: string | null;
  readonly sanitizedUrl: string | null;
  readonly claimedTaskIds: readonly string[];
  readonly keywords: readonly string[];
  readonly verification: DerivedVerificationView;
  readonly paymentAdvertised: boolean | null;
  readonly fixtureKind: "synthetic" | "captured" | "planned";
  readonly sourceRefs: readonly string[];
  /** Opaque correlation keys for conservative cross-source linking. */
  readonly correlationKeys: readonly string[];
};

/**
 * HireJob — marketplace hire boundary only.
 * No execution engine, payment settlement, or network side effects.
 */
export type HireJob = {
  readonly hireJobId: string;
  readonly capabilityId: string;
  readonly taskId: string | null;
  readonly status: "draft" | "quoted" | "authorized" | "closed";
  readonly notes: string;
};

/** Flattened searchable capability record (catalog row). */
export type CapabilityRecord = ServiceCapability & {
  readonly agentDisplayName: string | null;
};

export type CatalogCounts = {
  readonly agentProfiles: number;
  readonly capabilities: number;
  readonly skills: number;
  readonly resources: number;
  readonly erc8004Services: number;
  readonly planned: number;
  /** Distinct capability IDs after collision handling. */
  readonly uniqueCapabilityIds: number;
};

export type CategorySummaryEntry = {
  readonly categoryId: MarketplaceCategoryId;
  readonly name: string;
  readonly capabilityCount: number;
  readonly agentProfileCount: number;
  readonly skillCount: number;
  readonly resourceCount: number;
  readonly erc8004ServiceCount: number;
  readonly plannedCount: number;
};

export type MarketplaceCatalogDocument = {
  readonly schemaVersion: typeof MARKETPLACE_SCHEMA_VERSION;
  readonly mode: typeof MARKETPLACE_MODE;
  readonly kind: "marketplaceCapabilityCatalog";
  readonly builtAtSource: "offline-evidence";
  readonly snapshotAsOf: string;
  readonly counts: CatalogCounts;
  readonly agents: readonly AgentProfile[];
  readonly capabilities: readonly CapabilityRecord[];
  readonly hireJobBoundary: {
    readonly implemented: false;
    readonly note: "HireJob is a type boundary only in D4.5; no execution or payment.";
  };
  readonly b1b2Reference: {
    readonly taskId: "wallet-activity-summary@1.0";
    readonly categoryId: "data-analytics";
    readonly status: "planned";
    readonly verified: false;
    readonly capabilityId: string;
  };
  readonly sourceInputs: readonly {
    readonly path: string;
    readonly role: string;
  }[];
  readonly notes: readonly string[];
};

export type CategorySummaryDocument = {
  readonly schemaVersion: typeof MARKETPLACE_SCHEMA_VERSION;
  readonly mode: typeof MARKETPLACE_MODE;
  readonly kind: "marketplaceCategorySummary";
  readonly snapshotAsOf: string;
  readonly categories: readonly CategorySummaryEntry[];
  readonly uncategorizedPolicy: "fallback-to-other";
  readonly multiCategoryAllowed: true;
};

export type ExternalIntegrationCandidate = {
  readonly candidateId: string;
  readonly capabilityId: string;
  readonly providerKey: string;
  readonly displayName: string;
  readonly categories: readonly MarketplaceCategoryId[];
  readonly rationale: string;
  readonly priority: "high" | "medium" | "low";
  readonly score: number;
  readonly readOnlyLikely: boolean;
  readonly destructiveRisk: boolean;
  readonly credentialRisk: boolean;
  readonly ambiguous: boolean;
  readonly approvedForNetworkExecution: false;
  readonly paymentCompatible: false;
  readonly sourceKind: CapabilitySourceKind;
};

export type ExternalIntegrationAssessmentDocument = {
  readonly schemaVersion: typeof MARKETPLACE_SCHEMA_VERSION;
  readonly mode: typeof MARKETPLACE_MODE;
  readonly kind: "externalIntegrationCandidates";
  readonly snapshotAsOf: string;
  readonly maxCandidates: 5;
  readonly candidateCount: number;
  readonly approvedForNetworkExecutionTrue: 0;
  readonly candidates: readonly ExternalIntegrationCandidate[];
  readonly emptyCategoriesAllowed: true;
  readonly notes: readonly string[];
};

export type SearchQuery = {
  readonly category?: MarketplaceCategoryId | MarketplaceCategoryId[];
  readonly provider?: string;
  readonly name?: string;
  readonly keywords?: readonly string[];
  readonly taskId?: string;
  readonly protocol?: ProtocolHint;
  readonly verificationMilestone?: DerivedVerificationView["derivedMilestone"];
  /** When true (default), include `other`. */
  readonly includeOther?: boolean;
};

export type SearchHitReason =
  | "exact-task"
  | "explicit-capability"
  | "descriptive"
  | "category";

export type SearchHit = {
  readonly capabilityId: string;
  readonly rankScore: number;
  readonly reasons: readonly SearchHitReason[];
  readonly record: CapabilityRecord;
};

export type SearchResult = {
  readonly query: SearchQuery;
  readonly total: number;
  readonly hits: readonly SearchHit[];
  readonly tieBreak:
    "capabilityId-asc";
  readonly note: "Search ranks discoverability only; it is not integration readiness.";
};

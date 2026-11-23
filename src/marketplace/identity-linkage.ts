/**
 * Explicit identity-linkage assessment (D5.2).
 *
 * QuantJourney ERC-8004 registration and discovery skills profiles must NOT
 * be merged by display-name heuristics alone. Owner ≠ authenticated operator.
 *
 * STRICTLY_OFFLINE — reads structured local facts only.
 */

export const IDENTITY_LINKAGE_MODE =
  "STRICTLY_OFFLINE / NO_SIGNING / NO_PAYMENT" as const;

export type IdentityLinkageVerdict =
  | "sameProvenIdentity"
  | "likelySameOperatorUnproven"
  | "distinct"
  | "insufficientEvidence";

export type IdentityProfileFacts = {
  readonly agentProfileId: string;
  readonly displayName: string | null;
  readonly providerId: string | null;
  readonly registryChainId: number | null;
  readonly registryAddress: string | null;
  readonly agentId: string | null;
  readonly origin: "external" | "agenthire-operated";
  readonly sourceKinds: readonly string[];
};

export type IdentityLinkageAssessment = {
  readonly mode: typeof IDENTITY_LINKAGE_MODE;
  readonly left: IdentityProfileFacts;
  readonly right: IdentityProfileFacts;
  readonly verdict: IdentityLinkageVerdict;
  readonly safeToMergeProfiles: false | true;
  readonly reasons: readonly string[];
  readonly requiredForSafeMerge: readonly string[];
  readonly notes: readonly string[];
};

function normalizeName(name: string | null): string | null {
  if (!name) return null;
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Assess whether two marketplace profiles may be treated as one identity.
 * Name-only / host-heuristic matches never authorize a merge.
 */
export function assessIdentityLinkage(
  left: IdentityProfileFacts,
  right: IdentityProfileFacts,
): IdentityLinkageAssessment {
  const reasons: string[] = [];
  const requiredForSafeMerge = [
    "Exact matching canonical providerId (chain/registry/agentId)",
    "Or explicit human-attested correlation record with evidence refs",
    "Display-name equality alone is insufficient",
  ];

  if (left.agentProfileId === right.agentProfileId) {
    return {
      mode: IDENTITY_LINKAGE_MODE,
      left,
      right,
      verdict: "sameProvenIdentity",
      safeToMergeProfiles: true,
      reasons: ["Identical agentProfileId"],
      requiredForSafeMerge,
      notes: ["Same marketplace profile row"],
    };
  }

  const leftPid = left.providerId;
  const rightPid = right.providerId;
  if (leftPid && rightPid && leftPid === rightPid) {
    return {
      mode: IDENTITY_LINKAGE_MODE,
      left,
      right,
      verdict: "sameProvenIdentity",
      safeToMergeProfiles: true,
      reasons: [`Matching providerId ${leftPid}`],
      requiredForSafeMerge,
      notes: ["Canonical ERC-8004 identity matches"],
    };
  }

  const leftName = normalizeName(left.displayName);
  const rightName = normalizeName(right.displayName);
  const nameExact = leftName !== null && leftName === rightName;
  const nameRelated =
    leftName !== null &&
    rightName !== null &&
    (leftName.includes(rightName) ||
      rightName.includes(leftName) ||
      leftName.replace(/\s+research agent fabric$/, "") ===
        rightName.replace(/\s+research agent fabric$/, ""));

  if (nameExact || nameRelated) {
    reasons.push(
      nameExact
        ? `Display names exact-match ("${left.displayName}") — heuristic only`
        : `Display names related ("${left.displayName}" vs "${right.displayName}") — heuristic only`,
    );
  }

  const oneMissingProvider =
    (leftPid === null && rightPid !== null) ||
    (leftPid !== null && rightPid === null);
  if (oneMissingProvider) {
    reasons.push(
      "One profile lacks providerId (discovery-derived vs on-chain) — unproven merge",
    );
  }

  if (leftPid && rightPid && leftPid !== rightPid) {
    return {
      mode: IDENTITY_LINKAGE_MODE,
      left,
      right,
      verdict: "distinct",
      safeToMergeProfiles: false,
      reasons: [
        ...reasons,
        `Different providerIds: ${leftPid} vs ${rightPid}`,
      ],
      requiredForSafeMerge,
      notes: [
        "Do not merge profiles with conflicting canonical provider IDs",
        "Owner address equality (if later known) still ≠ operator authentication",
      ],
    };
  }

  if (nameExact || nameRelated || oneMissingProvider) {
    return {
      mode: IDENTITY_LINKAGE_MODE,
      left,
      right,
      verdict: "likelySameOperatorUnproven",
      safeToMergeProfiles: false,
      reasons: [
        ...reasons,
        "Name/host heuristics are insufficient for a safe profile merge",
      ],
      requiredForSafeMerge,
      notes: [
        "Keep marketplace AgentProfile rows separate",
        "Cite both profile IDs when discussing QuantJourney identity vs skills",
        "Owner ≠ authenticated operator",
      ],
    };
  }

  return {
    mode: IDENTITY_LINKAGE_MODE,
    left,
    right,
    verdict: "insufficientEvidence",
    safeToMergeProfiles: false,
    reasons: reasons.length
      ? reasons
      : ["No shared providerId and no name correlation"],
    requiredForSafeMerge,
    notes: ["Fail closed — do not merge"],
  };
}

/** Canonical QuantJourney pair from D5.1 audit — must remain unmerged. */
export const QUANTJOURNEY_ERC8004_PROFILE: IdentityProfileFacts = {
  agentProfileId:
    "agent:eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136",
  displayName: "QuantJourney Research Agent Fabric",
  providerId:
    "eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136",
  registryChainId: 84532,
  registryAddress: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  agentId: "9136",
  origin: "external",
  sourceKinds: ["erc8004-service"],
};

export const QUANTJOURNEY_DISCOVERY_PROFILE: IdentityProfileFacts = {
  agentProfileId: "agent:external:1589ec8e8059",
  displayName: "QuantJourney Research Agent Fabric",
  providerId: null,
  registryChainId: null,
  registryAddress: null,
  agentId: null,
  origin: "external",
  sourceKinds: ["agent-card-skill"],
};

export function assessQuantJourneyIdentityLinkage(): IdentityLinkageAssessment {
  return assessIdentityLinkage(
    QUANTJOURNEY_ERC8004_PROFILE,
    QUANTJOURNEY_DISCOVERY_PROFILE,
  );
}

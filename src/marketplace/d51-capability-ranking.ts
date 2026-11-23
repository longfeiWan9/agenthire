/**
 * D5.1 offline external-capability ranking.
 *
 * Transparent weighted scores for implementation-planning selection.
 * Scores are evidence-derived judgments — not objective facts.
 * Selection never flips network execution or payment verification.
 *
 * STRICTLY_OFFLINE — no HTTP/DNS/RPC.
 */

import type {
  CapabilityRecord,
  MarketplaceCategoryId,
} from "./types.ts";

export const D51_RANKING_SCHEMA_VERSION = "1.0" as const;
export const D51_RANKING_MODE =
  "READ_ONLY / NO_SIGNING / NO_PAYMENT / STRICTLY_OFFLINE" as const;

export const D51_SCORE_WEIGHTS = {
  interfaceDocumentation: 25,
  safetyLimitedSideEffects: 20,
  inputOutputVerifiability: 20,
  userValueDemoClarity: 15,
  adapterSimplicity: 10,
  paymentEvidenceClarity: 10,
} as const;

export type D51HardExclusionReason =
  | "destructive-operation"
  | "credential-requirement"
  | "no-safe-invocation-plan"
  | "synthetic-fixture"
  | "agenthire-planned-not-external";

export type D51ScoreBreakdown = {
  readonly interfaceDocumentation: number;
  readonly safetyLimitedSideEffects: number;
  readonly inputOutputVerifiability: number;
  readonly userValueDemoClarity: number;
  readonly adapterSimplicity: number;
  readonly paymentEvidenceClarity: number;
};

export type D51RankedCandidate = {
  readonly capabilityId: string;
  readonly providerKey: string;
  readonly displayName: string;
  readonly categories: readonly MarketplaceCategoryId[];
  readonly sourceKind: CapabilityRecord["sourceKind"];
  readonly agentProfileId: string;
  readonly hardExcluded: boolean;
  readonly exclusionReasons: readonly D51HardExclusionReason[];
  readonly scores: D51ScoreBreakdown;
  readonly totalScore: number;
  readonly scoreNotes: readonly string[];
  readonly evidenceLadder: {
    readonly advertisedCapability: true;
    readonly documentedInterface: boolean;
    readonly endpointReachabilityVerified: false;
    readonly taskExecutionVerified: false;
    readonly paymentCompatibilityVerified: false;
    readonly verifiedSettlement: false;
  };
  readonly method: string | null;
  readonly endpointUrl: string | null;
  readonly paymentAdvertised: boolean | null;
  readonly selectedForImplementationPlanning: boolean;
  readonly approvedForNetworkExecution: false;
};

export type D51RankingDocument = {
  readonly schemaVersion: typeof D51_RANKING_SCHEMA_VERSION;
  readonly mode: typeof D51_RANKING_MODE;
  readonly kind: "d51IntegrationCandidateRanking";
  readonly snapshotAsOf: string;
  readonly weights: typeof D51_SCORE_WEIGHTS;
  readonly primaryCapabilityId: string | null;
  readonly backupCapabilityId: string | null;
  readonly ranked: readonly D51RankedCandidate[];
  readonly notes: readonly string[];
};

const DESTRUCTIVE_RE =
  /\b(delete|destroy|drop|wipe|purge|transfer|withdraw|spend|sign|broadcast|deploy|mint|burn|execute-paid|route-execute|code-run)\b/i;

const CREDENTIAL_RE =
  /\b(api[_-]?key|password|secret|credential|private[_-]?key)\b/i;

function corpusOf(record: CapabilityRecord): string {
  return [
    record.displayName,
    record.description ?? "",
    record.serviceKey,
    record.sanitizedUrl ?? "",
    record.endpointUrl ?? "",
    record.originalLabels.join(" "),
  ].join(" ");
}

export function evaluateHardExclusions(
  record: CapabilityRecord,
): readonly D51HardExclusionReason[] {
  const reasons: D51HardExclusionReason[] = [];
  if (record.fixtureKind === "synthetic") reasons.push("synthetic-fixture");
  if (record.provenance === "agenthire-operated" || record.sourceKind === "agenthire-planned") {
    reasons.push("agenthire-planned-not-external");
  }
  const corpus = corpusOf(record);
  if (DESTRUCTIVE_RE.test(corpus)) reasons.push("destructive-operation");
  if (CREDENTIAL_RE.test(corpus)) reasons.push("credential-requirement");

  const method = (record.method ?? "").toUpperCase();
  const hasMethod = method === "GET" || method === "POST" || method === "HEAD";
  const hasUrl = Boolean(record.endpointUrl || record.sanitizedUrl);
  const hasDescription = Boolean(record.description && record.description.trim());
  // A2A skill with description but no route still lacks a defensible invocation plan
  // until OpenAPI/route evidence exists — hard-exclude from execution approval only
  // via ranking flag; planning may still select it. We do NOT hard-exclude skills
  // solely for missing routes: that would empty the shortlist. Instead exclude
  // bare URL resources with unknown method AND no description.
  if (
    record.sourceKind === "x402-resource" &&
    !hasMethod &&
    !hasDescription
  ) {
    reasons.push("no-safe-invocation-plan");
  }
  if (
    record.sourceKind === "erc8004-service" &&
    !hasDescription &&
    !hasUrl
  ) {
    reasons.push("no-safe-invocation-plan");
  }
  void hasUrl;
  return reasons;
}

function clamp(n: number, max: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, Math.round(n));
}

export function scoreCapability(record: CapabilityRecord): {
  readonly scores: D51ScoreBreakdown;
  readonly totalScore: number;
  readonly scoreNotes: readonly string[];
} {
  const notes: string[] = [];
  const corpus = corpusOf(record);
  const method = (record.method ?? "").toUpperCase();
  const hasMethod = method === "GET" || method === "POST" || method === "HEAD";
  const hasUrl = Boolean(record.endpointUrl || record.sanitizedUrl);
  const hasDescription = Boolean(record.description && record.description.trim());

  // Interface documentation (25)
  let interfaceDocumentation = 0;
  if (hasDescription) {
    interfaceDocumentation += 10;
    notes.push("interface: skill/service description present (+10)");
  }
  if (hasMethod) {
    interfaceDocumentation += 8;
    notes.push(`interface: HTTP method ${method} (+8)`);
  } else {
    notes.push("interface: HTTP method unknown (0)");
  }
  if (hasUrl) {
    interfaceDocumentation += 7;
    notes.push("interface: endpoint URL present (+7)");
  } else {
    notes.push("interface: endpoint URL absent (0)");
  }
  interfaceDocumentation = clamp(
    interfaceDocumentation,
    D51_SCORE_WEIGHTS.interfaceDocumentation,
  );

  // Safety (20)
  let safetyLimitedSideEffects = 0;
  if (!DESTRUCTIVE_RE.test(corpus)) {
    safetyLimitedSideEffects += 8;
    notes.push("safety: non-destructive corpus (+8)");
  }
  if (!CREDENTIAL_RE.test(corpus)) {
    safetyLimitedSideEffects += 6;
    notes.push("safety: no credential hint (+6)");
  }
  if (
    /\b(public-data|read|lookup|snapshot|facts|identity|screen|allowlist|bounded|free)\b/i.test(
      corpus,
    ) ||
    method === "GET" ||
    method === "HEAD"
  ) {
    safetyLimitedSideEffects += 6;
    notes.push("safety: read-only / bounded public-data hints (+6)");
  }
  safetyLimitedSideEffects = clamp(
    safetyLimitedSideEffects,
    D51_SCORE_WEIGHTS.safetyLimitedSideEffects,
  );

  // I/O verifiability (20)
  let inputOutputVerifiability = 0;
  if (
    /\b(identity|cik|lei|facts|schema|checksum|hash|base64|validate|normalize|ticker|accession)\b/i.test(
      corpus,
    )
  ) {
    inputOutputVerifiability += 10;
    notes.push("io: structured / public-identifier output hints (+10)");
  }
  if (/\b(bounded|allowlist|compact|small|one issuer|one ticker|exact)\b/i.test(corpus)) {
    inputOutputVerifiability += 6;
    notes.push("io: bounded input claims (+6)");
  }
  if (hasDescription) {
    inputOutputVerifiability += 4;
    notes.push("io: described expected work (+4)");
  }
  inputOutputVerifiability = clamp(
    inputOutputVerifiability,
    D51_SCORE_WEIGHTS.inputOutputVerifiability,
  );

  // User value / demo clarity (15)
  let userValueDemoClarity = 0;
  if (
    /\b(sec|company|identity|facts|filing|snapshot|screen|catalog|find|gleif)\b/i.test(
      corpus,
    )
  ) {
    userValueDemoClarity += 8;
    notes.push("demo: clear hireable research/analytics task (+8)");
  }
  if (record.categories.some((c) => c !== "other")) {
    userValueDemoClarity += 4;
    notes.push("demo: curated category shelf (+4)");
  }
  if (/\bfree\b/i.test(corpus)) {
    userValueDemoClarity += 3;
    notes.push("demo: free/unmetered claim aids first hire (+3)");
  }
  userValueDemoClarity = clamp(
    userValueDemoClarity,
    D51_SCORE_WEIGHTS.userValueDemoClarity,
  );

  // Adapter simplicity (10)
  let adapterSimplicity = 0;
  if (record.sourceKind === "agent-card-skill" && hasDescription) {
    adapterSimplicity += 4;
    notes.push("adapter: described skill surface (+4)");
  }
  if (hasMethod && hasUrl) {
    adapterSimplicity += 4;
    notes.push("adapter: method+URL reduce discovery work (+4)");
  } else if (!hasMethod && !hasUrl) {
    notes.push("adapter: OpenAPI/route discovery still required (0 method/url)");
  }
  if (
    /\b(identity|lookup|facts|snapshot|validate|checksum|base64)\b/i.test(corpus) &&
    !/\b(route|execute|optimize|simulate|portfolio)\b/i.test(corpus)
  ) {
    adapterSimplicity += 2;
    notes.push("adapter: narrow single-purpose task (+2)");
  }
  adapterSimplicity = clamp(adapterSimplicity, D51_SCORE_WEIGHTS.adapterSimplicity);

  // Payment evidence clarity (10) — advertising alone scores low; verified offer would score high
  let paymentEvidenceClarity = 0;
  if (record.paymentAdvertised === true) {
    paymentEvidenceClarity += 2;
    notes.push("payment: advertised only (+2; discoverable≠payable)");
  } else if (record.paymentAdvertised === false) {
    paymentEvidenceClarity += 1;
    notes.push("payment: explicitly not advertised (+1 honesty)");
  } else {
    notes.push("payment: unknown advertisement (0)");
  }
  // No candidate in local evidence has observed HTTP 402 / verified Sepolia offer.
  notes.push("payment: no observed HTTP 402 / verified Sepolia offer (0)");
  paymentEvidenceClarity = clamp(
    paymentEvidenceClarity,
    D51_SCORE_WEIGHTS.paymentEvidenceClarity,
  );

  const scores: D51ScoreBreakdown = {
    interfaceDocumentation,
    safetyLimitedSideEffects,
    inputOutputVerifiability,
    userValueDemoClarity,
    adapterSimplicity,
    paymentEvidenceClarity,
  };
  const totalScore =
    scores.interfaceDocumentation +
    scores.safetyLimitedSideEffects +
    scores.inputOutputVerifiability +
    scores.userValueDemoClarity +
    scores.adapterSimplicity +
    scores.paymentEvidenceClarity;

  return { scores, totalScore, scoreNotes: notes };
}

export function rankCapabilityRecord(
  record: CapabilityRecord,
): D51RankedCandidate {
  const exclusionReasons = evaluateHardExclusions(record);
  const hardExcluded = exclusionReasons.length > 0;
  const scored = scoreCapability(record);
  const documentedInterface = Boolean(
    (record.method &&
      ["GET", "POST", "HEAD"].includes(record.method.toUpperCase()) &&
      (record.endpointUrl || record.sanitizedUrl)) ||
      (record.description &&
        record.description.trim() &&
        record.sourceKind === "agent-card-skill"),
  );

  return {
    capabilityId: record.capabilityId,
    providerKey: record.providerKey,
    displayName: record.displayName,
    categories: record.categories,
    sourceKind: record.sourceKind,
    agentProfileId: record.agentProfileId,
    hardExcluded,
    exclusionReasons,
    scores: scored.scores,
    totalScore: hardExcluded ? 0 : scored.totalScore,
    scoreNotes: hardExcluded
      ? [
          ...exclusionReasons.map((r) => `hard-exclude:${r}`),
          ...scored.scoreNotes,
        ]
      : scored.scoreNotes,
    evidenceLadder: {
      advertisedCapability: true,
      documentedInterface,
      endpointReachabilityVerified: false,
      taskExecutionVerified: false,
      paymentCompatibilityVerified: false,
      verifiedSettlement: false,
    },
    method: record.method,
    endpointUrl: record.endpointUrl ?? record.sanitizedUrl,
    paymentAdvertised: record.paymentAdvertised,
    selectedForImplementationPlanning: false,
    approvedForNetworkExecution: false,
  };
}

export type D51RankOptions = {
  readonly snapshotAsOf: string;
  /** Capability IDs to consider (shortlist + alternates). */
  readonly candidateCapabilityIds: readonly string[];
  readonly primaryCapabilityId?: string | null;
  readonly backupCapabilityId?: string | null;
};

/**
 * Rank a fixed candidate set. Hard-excluded rows keep score 0 and cannot be selected.
 * Selection flags are applied only to ids explicitly passed as primary/backup.
 */
export function rankIntegrationCandidates(
  records: readonly CapabilityRecord[],
  options: D51RankOptions,
): D51RankingDocument {
  const byId = new Map(records.map((r) => [r.capabilityId, r]));
  const ranked: D51RankedCandidate[] = [];

  for (const id of options.candidateCapabilityIds) {
    const record = byId.get(id);
    if (!record) continue;
    ranked.push(rankCapabilityRecord(record));
  }

  ranked.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.capabilityId < b.capabilityId
      ? -1
      : a.capabilityId > b.capabilityId
        ? 1
        : 0;
  });

  const primary = options.primaryCapabilityId ?? null;
  const backup = options.backupCapabilityId ?? null;

  if (primary) {
    const row = ranked.find((r) => r.capabilityId === primary);
    if (!row || row.hardExcluded) {
      throw new Error(
        `primary capability ${primary} missing or hard-excluded — refusing selection`,
      );
    }
  }
  if (backup) {
    const row = ranked.find((r) => r.capabilityId === backup);
    if (!row || row.hardExcluded) {
      throw new Error(
        `backup capability ${backup} missing or hard-excluded — refusing selection`,
      );
    }
  }

  const withSelection = ranked.map((row) => ({
    ...row,
    selectedForImplementationPlanning:
      row.capabilityId === primary || row.capabilityId === backup,
    approvedForNetworkExecution: false as const,
  }));

  return {
    schemaVersion: D51_RANKING_SCHEMA_VERSION,
    mode: D51_RANKING_MODE,
    kind: "d51IntegrationCandidateRanking",
    snapshotAsOf: options.snapshotAsOf,
    weights: D51_SCORE_WEIGHTS,
    primaryCapabilityId: primary,
    backupCapabilityId: backup,
    ranked: withSelection,
    notes: [
      "Scores are transparent judgments from local evidence — not objective facts.",
      "Hard exclusions block execution approval; planning selection still requires non-excluded rows.",
      "documentedInterface may be true for described skills even when method/URL are unknown.",
      "endpointReachabilityVerified, taskExecutionVerified, paymentCompatibilityVerified, verifiedSettlement remain false.",
      "approvedForNetworkExecution is always false in D5.1.",
      "QuantJourney agent-card states generic A2A delegation is disabled — OpenAPI routes required (not yet retrieved).",
      "STRICTLY_OFFLINE: zero new provider HTTP/DNS/RPC.",
    ],
  };
}

export function stableRankingJson(doc: D51RankingDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

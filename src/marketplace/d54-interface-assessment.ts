/**
 * D5.4 offline external-interface assessment.
 *
 * Stricter than D5.1: L1 requires exact HTTP method + route URL + schema
 * evidence. Synthetic fixtures never upgrade the ladder. Selection may be null.
 *
 * STRICTLY_OFFLINE — no HTTP/DNS/RPC; no signing/payment/execution.
 */

export const D54_SCHEMA_VERSION = "1.0" as const;
export const D54_MODE =
  "STRICTLY_OFFLINE / READ_ONLY_EXTERNAL_EVIDENCE / NO_SIGNING / NO_PAYMENT" as const;

export const D54_SCORE_WEIGHTS = {
  interfaceDocumentation: 30,
  safetyLimitedSideEffects: 20,
  inputOutputVerifiability: 20,
  userValueDemoClarity: 15,
  adapterSimplicity: 10,
  paymentEvidenceClarity: 5,
} as const;

export type D54LadderLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export type D54HardExclusionReason =
  | "unknown-http-method"
  | "unknown-route-url"
  | "unknown-request-or-response-schema"
  | "synthetic-fixture"
  | "destructive-operation"
  | "credential-requirement"
  | "agenthire-planned-not-external"
  | "discovery-document-not-invocation-route";

export type D54DecisionOutcome =
  | "A_keep_quantjourney"
  | "B_switch_capability"
  | "C_no_l1_null_selection";

export type D54InterfaceFacts = {
  readonly capabilityId: string;
  readonly providerKey: string;
  readonly displayName: string;
  readonly sourceKind: string;
  readonly fixtureKind: "captured" | "synthetic" | "planned" | string;
  readonly provenance: string;
  readonly categories: readonly string[];
  readonly description: string | null;
  readonly method: string | null;
  readonly endpointUrl: string | null;
  readonly requestSchemaKnown: boolean;
  readonly responseSchemaKnown: boolean;
  readonly paymentAdvertised: boolean | null;
  readonly endpointReachabilityVerified: boolean;
  readonly taskExecutionVerified: boolean;
  readonly paymentCompatibilityVerified: boolean;
  readonly evidenceRefs: readonly string[];
  readonly notes: readonly string[];
};

export type D54RankedCandidate = {
  readonly capabilityId: string;
  readonly providerKey: string;
  readonly displayName: string;
  readonly sourceKind: string;
  readonly categories: readonly string[];
  readonly ladderLevel: D54LadderLevel;
  readonly hardExcluded: boolean;
  readonly exclusionReasons: readonly D54HardExclusionReason[];
  readonly scores: {
    readonly interfaceDocumentation: number;
    readonly safetyLimitedSideEffects: number;
    readonly inputOutputVerifiability: number;
    readonly userValueDemoClarity: number;
    readonly adapterSimplicity: number;
    readonly paymentEvidenceClarity: number;
  };
  readonly totalScore: number;
  readonly scoreNotes: readonly string[];
  readonly method: string | null;
  readonly endpointUrl: string | null;
  readonly requestSchemaKnown: boolean;
  readonly responseSchemaKnown: boolean;
  readonly approvedForNetworkExecution: false;
  readonly evidenceRefs: readonly string[];
};

const DESTRUCTIVE_RE =
  /\b(delete|destroy|drop|wipe|purge|transfer|withdraw|spend|sign|broadcast|deploy|mint|burn|execute-paid|route-execute|code-run)\b/i;

const CREDENTIAL_RE =
  /\b(api[_-]?key|password|secret|credential|private[_-]?key)\b/i;

const DISCOVERY_PATH_RE =
  /\/\.well-known\/(agent-card|agent-registration|x402)(\.json)?$/i;

const SAFE_METHODS = new Set(["GET", "POST", "HEAD"]);

function clamp(n: number, max: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, Math.round(n));
}

export function hasExactInvocationMethod(method: string | null): boolean {
  if (!method) return false;
  return SAFE_METHODS.has(method.toUpperCase());
}

export function isDiscoveryDocumentUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.pathname === "/" || u.pathname === "") return true;
    if (DISCOVERY_PATH_RE.test(u.pathname)) return true;
    if (/\/openapi\.json$/i.test(u.pathname)) return true;
    if (/\/mcp$/i.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

export function assessLadderLevel(facts: D54InterfaceFacts): D54LadderLevel {
  if (facts.fixtureKind === "synthetic") return "L0";

  const methodOk = hasExactInvocationMethod(facts.method);
  const routeOk = Boolean(facts.endpointUrl) && !isDiscoveryDocumentUrl(facts.endpointUrl);
  const schemaOk = facts.requestSchemaKnown && facts.responseSchemaKnown;
  const l1 = methodOk && routeOk && schemaOk;

  if (!l1) return "L0";
  if (!facts.endpointReachabilityVerified) return "L1";
  if (!facts.taskExecutionVerified) return "L2";
  if (!facts.paymentCompatibilityVerified) return "L3";
  return "L4";
}

export function evaluateD54HardExclusions(
  facts: D54InterfaceFacts,
): readonly D54HardExclusionReason[] {
  const reasons: D54HardExclusionReason[] = [];
  if (facts.fixtureKind === "synthetic") reasons.push("synthetic-fixture");
  if (
    facts.provenance === "agenthire-operated" ||
    facts.sourceKind === "agenthire-planned" ||
    facts.fixtureKind === "planned"
  ) {
    reasons.push("agenthire-planned-not-external");
  }

  const corpus = `${facts.displayName} ${facts.description ?? ""} ${facts.endpointUrl ?? ""}`;
  if (DESTRUCTIVE_RE.test(corpus)) reasons.push("destructive-operation");
  if (CREDENTIAL_RE.test(corpus)) reasons.push("credential-requirement");

  if (!hasExactInvocationMethod(facts.method)) {
    reasons.push("unknown-http-method");
  }
  if (!facts.endpointUrl) {
    reasons.push("unknown-route-url");
  } else if (isDiscoveryDocumentUrl(facts.endpointUrl)) {
    reasons.push("discovery-document-not-invocation-route");
  }
  if (!facts.requestSchemaKnown || !facts.responseSchemaKnown) {
    reasons.push("unknown-request-or-response-schema");
  }

  return reasons;
}

export function scoreD54Candidate(facts: D54InterfaceFacts): {
  readonly scores: D54RankedCandidate["scores"];
  readonly totalScore: number;
  readonly scoreNotes: readonly string[];
} {
  const notes: string[] = [];
  const corpus = `${facts.displayName} ${facts.description ?? ""} ${facts.endpointUrl ?? ""}`;
  const method = (facts.method ?? "").toUpperCase();
  const hasMethod = hasExactInvocationMethod(facts.method);
  const hasUrl = Boolean(facts.endpointUrl);
  const hasDescription = Boolean(facts.description && facts.description.trim());
  const schemaOk = facts.requestSchemaKnown && facts.responseSchemaKnown;

  let interfaceDocumentation = 0;
  if (hasDescription) {
    interfaceDocumentation += 8;
    notes.push("interface: description present (+8)");
  }
  if (hasMethod) {
    interfaceDocumentation += 8;
    notes.push(`interface: HTTP method ${method} (+8)`);
  } else {
    notes.push("interface: HTTP method unknown (0)");
  }
  if (hasUrl && !isDiscoveryDocumentUrl(facts.endpointUrl)) {
    interfaceDocumentation += 7;
    notes.push("interface: invocation route URL present (+7)");
  } else if (hasUrl) {
    notes.push("interface: URL is discovery/document surface only (0 for invocation)");
  } else {
    notes.push("interface: endpoint URL absent (0)");
  }
  if (schemaOk) {
    interfaceDocumentation += 7;
    notes.push("interface: request+response schema known (+7)");
  } else {
    notes.push("interface: request/response schema unknown (0)");
  }
  interfaceDocumentation = clamp(
    interfaceDocumentation,
    D54_SCORE_WEIGHTS.interfaceDocumentation,
  );

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
    D54_SCORE_WEIGHTS.safetyLimitedSideEffects,
  );

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
    D54_SCORE_WEIGHTS.inputOutputVerifiability,
  );

  let userValueDemoClarity = 0;
  if (
    /\b(sec|company|identity|facts|filing|snapshot|screen|catalog|find|gleif)\b/i.test(
      corpus,
    )
  ) {
    userValueDemoClarity += 8;
    notes.push("demo: clear hireable research/analytics task (+8)");
  }
  if (facts.categories.some((c) => c !== "other")) {
    userValueDemoClarity += 4;
    notes.push("demo: curated category shelf (+4)");
  }
  if (/\bfree\b/i.test(corpus)) {
    userValueDemoClarity += 3;
    notes.push("demo: free/unmetered claim aids first hire (+3)");
  }
  userValueDemoClarity = clamp(
    userValueDemoClarity,
    D54_SCORE_WEIGHTS.userValueDemoClarity,
  );

  let adapterSimplicity = 0;
  if (facts.sourceKind === "agent-card-skill" && hasDescription) {
    adapterSimplicity += 4;
    notes.push("adapter: described skill surface (+4)");
  }
  if (hasMethod && hasUrl && schemaOk) {
    adapterSimplicity += 6;
    notes.push("adapter: method+URL+schema reduce discovery work (+6)");
  } else {
    notes.push("adapter: OpenAPI/route/schema discovery still required");
  }
  adapterSimplicity = clamp(adapterSimplicity, D54_SCORE_WEIGHTS.adapterSimplicity);

  let paymentEvidenceClarity = 0;
  if (facts.paymentAdvertised === true) {
    paymentEvidenceClarity += 2;
    notes.push("payment: advertised only (+2; discoverable≠payable)");
  } else if (facts.paymentAdvertised === false) {
    paymentEvidenceClarity += 1;
    notes.push("payment: explicitly not advertised (+1 honesty)");
  } else {
    notes.push("payment: unknown advertisement (0)");
  }
  notes.push("payment: no observed HTTP 402 / verified Sepolia offer (0)");
  paymentEvidenceClarity = clamp(
    paymentEvidenceClarity,
    D54_SCORE_WEIGHTS.paymentEvidenceClarity,
  );

  const scores = {
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

export function rankD54Candidate(facts: D54InterfaceFacts): D54RankedCandidate {
  const exclusionReasons = evaluateD54HardExclusions(facts);
  const hardExcluded = exclusionReasons.length > 0;
  const ladderLevel = assessLadderLevel(facts);
  const scored = scoreD54Candidate(facts);

  return {
    capabilityId: facts.capabilityId,
    providerKey: facts.providerKey,
    displayName: facts.displayName,
    sourceKind: facts.sourceKind,
    categories: facts.categories,
    ladderLevel,
    hardExcluded,
    exclusionReasons,
    scores: scored.scores,
    totalScore: hardExcluded ? 0 : scored.totalScore,
    scoreNotes: hardExcluded
      ? [...exclusionReasons.map((r) => `hard-exclude:${r}`), ...scored.scoreNotes]
      : scored.scoreNotes,
    method: facts.method,
    endpointUrl: facts.endpointUrl,
    requestSchemaKnown: facts.requestSchemaKnown,
    responseSchemaKnown: facts.responseSchemaKnown,
    approvedForNetworkExecution: false,
    evidenceRefs: facts.evidenceRefs,
  };
}

export function decideD54Outcome(args: {
  readonly quantjourneyIdentityLadder: D54LadderLevel;
  readonly ranked: readonly D54RankedCandidate[];
}): {
  readonly outcome: D54DecisionOutcome;
  readonly selectedCapabilityId: string | null;
  readonly rationale: string;
} {
  const l1Plus = args.ranked.filter(
    (c) =>
      !c.hardExcluded &&
      (c.ladderLevel === "L1" ||
        c.ladderLevel === "L2" ||
        c.ladderLevel === "L3" ||
        c.ladderLevel === "L4"),
  );

  if (l1Plus.length === 0) {
    return {
      outcome: "C_no_l1_null_selection",
      selectedCapabilityId: null,
      rationale:
        "No independently operated external capability reaches L1 (exact method + invocation route + schemas) from local evidence. QuantJourney SEC Identity remains L0. Honest null selection.",
    };
  }

  const best = [...l1Plus].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.capabilityId < b.capabilityId ? -1 : a.capabilityId > b.capabilityId ? 1 : 0;
  })[0]!;

  if (
    args.quantjourneyIdentityLadder !== "L0" &&
    best.capabilityId === "cap:79da211975c2"
  ) {
    return {
      outcome: "A_keep_quantjourney",
      selectedCapabilityId: best.capabilityId,
      rationale: "QuantJourney SEC Identity reaches ≥L1 and remains best ranked.",
    };
  }

  return {
    outcome: "B_switch_capability",
    selectedCapabilityId: best.capabilityId,
    rationale: `Switch from QuantJourney Identity (ladder ${args.quantjourneyIdentityLadder}) to ${best.capabilityId} at ${best.ladderLevel}.`,
  };
}

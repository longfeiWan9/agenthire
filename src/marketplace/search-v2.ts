/**
 * Deterministic search v2 (D7.1 Task F).
 *
 * Matches agent/capability text, skills, categories, synonyms.
 * Ranks discoverability only — never invents hire-readiness.
 * No remote LLM / embeddings.
 */

import {
  assessListingQuality,
  matchesListingScope,
  type ListingScope,
} from "./listing-policy.ts";
import {
  classifyCapabilityRegistrationNetwork,
  type RegistrationNetworkFilter,
} from "./agent-identity.ts";
import type {
  AgentProfile,
  CapabilityRecord,
  MarketplaceCatalogDocument,
  MarketplaceCategoryId,
  SearchHitReason,
} from "./types.ts";
import { getCategoryDefinition } from "./categories.ts";

export type SearchV2MatchReason =
  | "exact-capability"
  | "exact-task"
  | "description"
  | "skill-metadata"
  | "category"
  | "agent-name"
  | "synonym";

export type SearchV2Hit = {
  readonly capabilityId: string;
  readonly agentProfileId: string;
  readonly rankScore: number;
  readonly reasons: readonly SearchV2MatchReason[];
  readonly matchExplanation: string;
  readonly record: CapabilityRecord;
  readonly publicTitle: string;
  readonly qualifiesCurated: boolean;
};

export type AgentSearchHit = {
  readonly agentProfileId: string;
  readonly agentDisplayName: string;
  readonly rankScore: number;
  readonly matchExplanation: string;
  readonly capabilityHits: readonly SearchV2Hit[];
};

export type SearchV2Query = {
  readonly q?: string;
  readonly category?: MarketplaceCategoryId;
  readonly network?: RegistrationNetworkFilter;
  readonly listingScope?: ListingScope;
};

export type SearchV2Result = {
  readonly query: SearchV2Query;
  readonly normalizedTerms: readonly string[];
  readonly totalCapabilities: number;
  readonly totalAgents: number;
  readonly capabilityHits: readonly SearchV2Hit[];
  readonly agentHits: readonly AgentSearchHit[];
  readonly lowConfidence: boolean;
  readonly note: string;
};

/** Explicit synonym groups — expand query terms deterministically. */
export const SEARCH_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["json", "schema", "validate", "validation", "json schema"],
  ["sec", "filing", "filings", "company identity", "edgar", "ticker"],
  ["wallet", "activity", "on-chain", "onchain", "address summary"],
  ["research", "organization", "diligence", "entity", "gleif", "lei"],
  ["embedding", "embeddings", "vector"],
  ["timezone", "time zone", "planner"],
];

function expandTerms(raw: string): string[] {
  const base = raw
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const phrases: string[] = [];
  const lower = raw.toLowerCase().trim();
  if (lower) phrases.push(lower);

  const expanded = new Set<string>([...base, ...phrases]);
  for (const term of [...expanded]) {
    for (const group of SEARCH_SYNONYM_GROUPS) {
      if (group.some((g) => g === term || term.includes(g) || g.includes(term))) {
        for (const g of group) expanded.add(g);
      }
    }
  }
  return [...expanded];
}

function corpusOf(record: CapabilityRecord, agent: AgentProfile | null): string {
  return [
    record.displayName,
    record.description ?? "",
    record.serviceKey,
    record.agentDisplayName ?? "",
    agent?.displayName ?? "",
    record.keywords.join(" "),
    record.originalLabels.join(" "),
    record.claimedTaskIds.join(" "),
    record.categories.map((c) => getCategoryDefinition(c).name).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function scoreCapability(
  record: CapabilityRecord,
  agent: AgentProfile | null,
  terms: readonly string[],
  rawQuery: string,
): { score: number; reasons: SearchV2MatchReason[]; explanation: string } | null {
  if (terms.length === 0 && !rawQuery) {
    return {
      score: 1,
      reasons: ["category"],
      explanation: "Listed in catalog scope",
    };
  }

  const reasons = new Set<SearchV2MatchReason>();
  let score = 0;
  const explanations: string[] = [];
  const title = record.displayName.toLowerCase();
  const desc = (record.description ?? "").toLowerCase();
  const agentName = (agent?.displayName ?? record.agentDisplayName ?? "").toLowerCase();
  const corpus = corpusOf(record, agent);
  const q = rawQuery.toLowerCase().trim();

  if (q && title === q) {
    score += 1000;
    reasons.add("exact-capability");
    explanations.push(`Exact capability title match: ${record.displayName}`);
  } else if (q && title.includes(q)) {
    score += 420;
    reasons.add("exact-capability");
    explanations.push(`Matched capability: ${record.displayName}`);
  }

  for (const task of record.claimedTaskIds) {
    if (q && task.toLowerCase().includes(q)) {
      score += 900;
      reasons.add("exact-task");
      explanations.push(`Matched claimed task: ${task}`);
    }
  }

  if (q && desc.includes(q)) {
    score += 280;
    reasons.add("description");
    explanations.push("Strong description match");
  }

  let synonymHits = 0;
  let metaHits = 0;
  for (const term of terms) {
    if (term.length < 2) continue;
    if (record.keywords.some((k) => k.toLowerCase().includes(term))) {
      metaHits += 1;
      score += 55;
    }
    if (record.originalLabels.some((l) => l.toLowerCase().includes(term))) {
      metaHits += 1;
      score += 45;
    }
    if (corpus.includes(term)) {
      // Soft containment — avoid double-counting exact title already scored.
      if (!title.includes(term) || term.length <= 3) {
        synonymHits += 1;
        score += 25;
      }
    }
  }
  if (metaHits > 0) {
    reasons.add("skill-metadata");
    explanations.push("Matched advertised skills / metadata");
  }
  if (synonymHits > 0 && !reasons.has("exact-capability")) {
    reasons.add("synonym");
    if (!explanations.some((e) => e.includes("synonym") || e.includes("skills"))) {
      explanations.push("Matched via synonym / related terms");
    }
  }

  for (const cat of record.categories) {
    const def = getCategoryDefinition(cat);
    if (
      q &&
      (def.name.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        terms.some((t) => def.name.toLowerCase().includes(t)))
    ) {
      score += 40;
      reasons.add("category");
      explanations.push(`Category relevance: ${def.name}`);
      break;
    }
  }

  if (q && agentName.includes(q)) {
    score += 60;
    reasons.add("agent-name");
    explanations.push(`Matched agent name: ${agent?.displayName ?? record.agentDisplayName}`);
  } else if (terms.some((t) => agentName.includes(t) && t.length > 3)) {
    score += 35;
    reasons.add("agent-name");
    explanations.push(`Matched agent name: ${agent?.displayName ?? record.agentDisplayName}`);
  }

  // Evidence quality as transparent secondary signal (small).
  const m = record.verification.derivedMilestone;
  if (m === "metadataValidated") score += 8;
  else if (m === "discovered") score += 3;

  if (score <= 0 || reasons.size === 0) return null;

  // Prefer curated readable rows slightly without crowding incompletes out of "all".
  const quality = assessListingQuality(record);
  if (quality.qualifiesCurated) score += 12;

  return {
    score,
    reasons: [...reasons],
    explanation: explanations[0] ?? "Metadata match",
  };
}

function agentMap(
  catalog: MarketplaceCatalogDocument,
): Map<string, AgentProfile> {
  return new Map(catalog.agents.map((a) => [a.agentProfileId, a]));
}

/**
 * Search capabilities then roll up to agent-first hits.
 */
export function searchMarketplaceV2(
  catalog: MarketplaceCatalogDocument,
  query: SearchV2Query = {},
): SearchV2Result {
  const rawQuery = (query.q ?? "").trim();
  const terms = rawQuery ? expandTerms(rawQuery) : [];
  const scope = query.listingScope ?? "curated";
  const network = query.network ?? "all";
  const agents = agentMap(catalog);

  const capabilityHits: SearchV2Hit[] = [];

  for (const record of catalog.capabilities) {
    if (query.category && !record.categories.includes(query.category)) {
      continue;
    }
    const agent = agents.get(record.agentProfileId) ?? null;
    const net = classifyCapabilityRegistrationNetwork(record, agent);
    if (network !== "all" && net.id !== network) continue;

    const quality = assessListingQuality(record);
    if (!matchesListingScope(quality, scope)) continue;

    const scored = scoreCapability(record, agent, terms, rawQuery);
    if (!scored) {
      // Empty query: include scoped listings with base score.
      if (!rawQuery) {
        capabilityHits.push({
          capabilityId: record.capabilityId,
          agentProfileId: record.agentProfileId,
          rankScore: quality.qualifiesCurated ? 10 : 1,
          reasons: ["category"],
          matchExplanation: "In selected discovery scope",
          record,
          publicTitle: quality.publicTitle,
          qualifiesCurated: quality.qualifiesCurated,
        });
      }
      continue;
    }

    capabilityHits.push({
      capabilityId: record.capabilityId,
      agentProfileId: record.agentProfileId,
      rankScore: scored.score,
      reasons: scored.reasons,
      matchExplanation: scored.explanation,
      record,
      publicTitle: quality.publicTitle,
      qualifiesCurated: quality.qualifiesCurated,
    });
  }

  capabilityHits.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return a.capabilityId.localeCompare(b.capabilityId);
  });

  const byAgent = new Map<string, SearchV2Hit[]>();
  for (const hit of capabilityHits) {
    const list = byAgent.get(hit.agentProfileId) ?? [];
    list.push(hit);
    byAgent.set(hit.agentProfileId, list);
  }

  const agentHits: AgentSearchHit[] = [];
  for (const [agentProfileId, hits] of byAgent) {
    const agent = agents.get(agentProfileId);
    const top = [...hits].sort((a, b) => b.rankScore - a.rankScore);
    const rankScore = top.reduce((s, h, i) => s + h.rankScore / (1 + i * 0.15), 0);
    agentHits.push({
      agentProfileId,
      agentDisplayName: agent?.displayName ?? hits[0]?.record.agentDisplayName ?? agentProfileId,
      rankScore,
      matchExplanation: top[0]?.matchExplanation ?? "Matched capabilities",
      capabilityHits: top.slice(0, 5),
    });
  }
  agentHits.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return a.agentProfileId.localeCompare(b.agentProfileId);
  });

  const topScore = capabilityHits[0]?.rankScore ?? 0;
  const lowConfidence =
    Boolean(rawQuery) &&
    (capabilityHits.length === 0 || topScore < 80);

  return {
    query,
    normalizedTerms: terms,
    totalCapabilities: capabilityHits.length,
    totalAgents: agentHits.length,
    capabilityHits,
    agentHits,
    lowConfidence,
    note: "Search v2 ranks discoverability with deterministic synonym expansion; it is not NLU and not hire-readiness.",
  };
}

/** Map legacy SearchHitReason vocabulary when needed by older callers. */
export function toLegacyReasons(
  reasons: readonly SearchV2MatchReason[],
): SearchHitReason[] {
  const out: SearchHitReason[] = [];
  for (const r of reasons) {
    if (r === "exact-task") out.push("exact-task");
    else if (r === "exact-capability") out.push("explicit-capability");
    else if (r === "category") out.push("category");
    else out.push("descriptive");
  }
  return out.length > 0 ? out : ["descriptive"];
}

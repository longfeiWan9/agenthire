/**
 * Offline integration-readiness assessment (D4.5).
 *
 * Across all marketplace categories (not wallet-summary-only).
 * ≤5 ExternalIntegrationCandidate; all approvedForNetworkExecution: false.
 * Prefer clear narrow read-only; avoid destructive / credentialed / ambiguous.
 * Search ≠ readiness. Empty shortlist is valid.
 *
 * STRICTLY_OFFLINE — no network approval.
 */

import type {
  CapabilityRecord,
  ExternalIntegrationAssessmentDocument,
  ExternalIntegrationCandidate,
  MarketplaceCatalogDocument,
} from "./types.ts";
import {
  MARKETPLACE_MODE,
  MARKETPLACE_SCHEMA_VERSION,
} from "./types.ts";

export const MAX_EXTERNAL_INTEGRATION_CANDIDATES = 5 as const;

const DESTRUCTIVE_RE =
  /\b(delete|destroy|drop|wipe|purge|transfer|withdraw|spend|sign|broadcast|deploy|mint|burn|execute-paid|route-execute)\b/i;

const CREDENTIAL_RE =
  /\b(api[_-]?key|password|secret|credential|token|auth|oauth|private[_-]?key)\b/i;

const READ_ONLY_HINT_RE =
  /\b(get|read|list|lookup|snapshot|schema|find|search|index|report|facts|identity|catalog)\b/i;

const AMBIGUOUS_METHOD = new Set(["OTHER", "METHOD_UNSPECIFIED", ""]);

function isDestructive(record: CapabilityRecord): boolean {
  const corpus = `${record.displayName} ${record.description ?? ""} ${record.serviceKey} ${record.originalLabels.join(" ")}`;
  if (DESTRUCTIVE_RE.test(corpus)) return true;
  const method = (record.method ?? "").toUpperCase();
  return method === "DELETE" || method === "PUT" || method === "PATCH";
}

function isCredentialRisk(record: CapabilityRecord): boolean {
  const corpus = `${record.displayName} ${record.description ?? ""} ${record.sanitizedUrl ?? ""} ${record.endpointUrl ?? ""}`;
  return CREDENTIAL_RE.test(corpus);
}

function isAmbiguous(record: CapabilityRecord): boolean {
  const method = (record.method ?? "").toUpperCase();
  const noDescription = !record.description || !record.description.trim();
  const vagueName =
    record.displayName.length < 4 ||
    /^(web|mcp|a2a|x402|openapi)$/i.test(record.displayName.trim());
  if (AMBIGUOUS_METHOD.has(method) && noDescription && vagueName) return true;
  if (record.sourceKind === "x402-resource" && noDescription && !method) {
    // URL-only resources with unspecified method are ambiguous for integration.
    return true;
  }
  return false;
}

function readOnlyLikely(record: CapabilityRecord): boolean {
  if (isDestructive(record) || isCredentialRisk(record)) return false;
  const method = (record.method ?? "").toUpperCase();
  if (method === "GET" || method === "HEAD") return true;
  const corpus = `${record.displayName} ${record.description ?? ""} ${record.originalLabels.join(" ")} ${record.sanitizedUrl ?? ""}`;
  return READ_ONLY_HINT_RE.test(corpus);
}

function scoreCandidate(record: CapabilityRecord): {
  readonly score: number;
  readonly priority: "high" | "medium" | "low";
  readonly rationale: string;
} {
  let score = 0;
  const bits: string[] = [];

  if (readOnlyLikely(record)) {
    score += 40;
    bits.push("readOnlyLikely(+40)");
  }
  if (!isDestructive(record)) {
    score += 15;
    bits.push("nonDestructive(+15)");
  } else {
    score -= 50;
    bits.push("destructive(-50)");
  }
  if (!isCredentialRisk(record)) {
    score += 15;
    bits.push("noCredentialHint(+15)");
  } else {
    score -= 40;
    bits.push("credentialRisk(-40)");
  }
  if (!isAmbiguous(record)) {
    score += 20;
    bits.push("clear(+20)");
  } else {
    score -= 25;
    bits.push("ambiguous(-25)");
  }

  // Prefer skills / planned with descriptions over bare URL resources.
  if (record.sourceKind === "agent-card-skill" && record.description) {
    score += 18;
    bits.push("skillWithDescription(+18)");
  }
  if (record.sourceKind === "agenthire-planned") {
    score += 10;
    bits.push("plannedReference(+10)");
  }
  if (record.sourceKind === "erc8004-service" && record.description) {
    score += 8;
    bits.push("erc8004Described(+8)");
  }
  if (record.sourceKind === "x402-resource") {
    // Narrow schema/read-ish paths only.
    const url = (record.sanitizedUrl ?? record.endpointUrl ?? "").toLowerCase();
    if (/schema|snapshot|lookup|identity|facts|catalog|index/.test(url)) {
      score += 12;
      bits.push("narrowResourcePath(+12)");
    } else {
      score -= 5;
      bits.push("genericResource(-5)");
    }
  }

  // Multi-category coverage bonus (small) — readiness across categories.
  if (record.categories.length > 0 && !record.categories.includes("other")) {
    score += 5;
    bits.push("curatedCategory(+5)");
  }

  let priority: "high" | "medium" | "low" = "low";
  if (score >= 80) priority = "high";
  else if (score >= 50) priority = "medium";

  return { score, priority, rationale: bits.join(", ") };
}

function toCandidate(
  record: CapabilityRecord,
  scored: ReturnType<typeof scoreCandidate>,
  index: number,
): ExternalIntegrationCandidate {
  return {
    candidateId: `extint-${String(index + 1).padStart(3, "0")}:${record.capabilityId}`,
    capabilityId: record.capabilityId,
    providerKey: record.providerKey,
    displayName: record.displayName,
    categories: record.categories,
    rationale: scored.rationale,
    priority: scored.priority,
    score: scored.score,
    readOnlyLikely: readOnlyLikely(record),
    destructiveRisk: isDestructive(record),
    credentialRisk: isCredentialRisk(record),
    ambiguous: isAmbiguous(record),
    approvedForNetworkExecution: false,
    paymentCompatible: false,
    sourceKind: record.sourceKind,
  };
}

/**
 * Build ≤5 unapproved external integration candidates across categories.
 * Prefers clear narrow read-only; skips destructive/credentialed/ambiguous
 * unless the pool would otherwise be empty and score remains ≥ 40.
 */
export function assessIntegrationReadiness(
  catalog: MarketplaceCatalogDocument,
  maxCandidates: number = MAX_EXTERNAL_INTEGRATION_CANDIDATES,
): ExternalIntegrationAssessmentDocument {
  const limit = Math.min(Math.max(0, maxCandidates), MAX_EXTERNAL_INTEGRATION_CANDIDATES);

  const scored = catalog.capabilities
    .map((record) => ({ record, ...scoreCandidate(record) }))
    .filter((row) => {
      if (row.record.fixtureKind === "synthetic") return false;
      if (isDestructive(row.record)) return false;
      if (isCredentialRisk(row.record)) return false;
      if (isAmbiguous(row.record) && row.score < 55) return false;
      if (!readOnlyLikely(row.record) && row.score < 50) return false;
      return row.score >= 40;
    });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.record.capabilityId < b.record.capabilityId
      ? -1
      : a.record.capabilityId > b.record.capabilityId
        ? 1
        : 0;
  });

  // Diversity: try to cover multiple categories when possible.
  const picked: typeof scored = [];
  const seenCategories = new Set<string>();
  for (const row of scored) {
    if (picked.length >= limit) break;
    const novel = row.record.categories.some((c) => c !== "other" && !seenCategories.has(c));
    if (novel || picked.length < Math.ceil(limit / 2)) {
      picked.push(row);
      for (const c of row.record.categories) seenCategories.add(c);
    }
  }
  for (const row of scored) {
    if (picked.length >= limit) break;
    if (!picked.includes(row)) picked.push(row);
  }

  const candidates = picked.slice(0, limit).map((row, index) =>
    toCandidate(row.record, row, index),
  );

  return {
    schemaVersion: MARKETPLACE_SCHEMA_VERSION,
    mode: MARKETPLACE_MODE,
    kind: "externalIntegrationCandidates",
    snapshotAsOf: catalog.snapshotAsOf,
    maxCandidates: MAX_EXTERNAL_INTEGRATION_CANDIDATES,
    candidateCount: candidates.length,
    approvedForNetworkExecutionTrue: 0,
    candidates,
    emptyCategoriesAllowed: true,
    notes: [
      "Integration readiness ≠ search ranking.",
      "All candidates approvedForNetworkExecution: false — no live follow-up authorized.",
      "paymentCompatible remains false; Sepolia x402 discoverable ≠ payable.",
      "Prefer clear narrow read-only; destructive/credentialed/ambiguous excluded.",
      "Empty shortlist is valid when no safe candidates exist.",
      "Assessment spans all curated categories, not wallet-summary-only.",
    ],
  };
}

export function stableIntegrationJson(
  doc: ExternalIntegrationAssessmentDocument,
): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

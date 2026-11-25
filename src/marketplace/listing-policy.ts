/**
 * Public listing quality policy (D7.1 Task D).
 *
 * Curated default view vs exploratory incomplete / all-advertised views.
 * Deterministic — no generative renaming without evidence support.
 */

import { SEC_IDENTITY_CAPABILITY_ID } from "../adapters/quantjourney-sec-identity.ts";
import type { CapabilityRecord } from "./types.ts";

export type ListingScope = "curated" | "all" | "incomplete";

export type PublicReadinessLabel =
  | "Advertised"
  | "Documented"
  | "Endpoint observed"
  | "Executed and verified"
  | "Payment verified"
  | "Simulation only";

export type ListingQualityAssessment = {
  readonly capabilityId: string;
  readonly qualifiesCurated: boolean;
  readonly incomplete: boolean;
  readonly readableTitle: boolean;
  readonly meaningfulDescription: boolean;
  readonly hasCategory: boolean;
  readonly hasProvenanceRef: boolean;
  readonly hasParentAgent: boolean;
  readonly publicReadiness: PublicReadinessLabel;
  readonly publicTitle: string;
  readonly titleNormalized: boolean;
  readonly reasons: readonly string[];
};

const URL_TITLE_RE = /^https?:\/\//i;
const HASHISH_RE = /^[a-f0-9]{16,}(-[a-f0-9]+)*$/i;
const TRAILING_HASH_RE = /-[a-f0-9]{8,}$/i;

export function isRawUrlTitle(title: string): boolean {
  const t = title.trim();
  return URL_TITLE_RE.test(t) || t.includes("://");
}

export function isReadableCapabilityTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 3) return false;
  if (isRawUrlTitle(t)) return false;
  if (HASHISH_RE.test(t)) return false;
  // Agent402 free-resource keys often end with long hex — treat as weak.
  if (/^[a-z0-9-]+-[a-f0-9]{10,}$/i.test(t) && !/\s/.test(t)) {
    return false;
  }
  return true;
}

export function hasMeaningfulDescription(
  description: string | null | undefined,
): boolean {
  if (!description) return false;
  const t = description.trim();
  if (t.length < 24) return false;
  if (URL_TITLE_RE.test(t) && t.length < 60) return false;
  return true;
}

/**
 * Normalize a raw URL/hash title only when existing evidence supplies a
 * better human label (originalLabels / keywords / serviceKey fragments).
 * Never invent unsupported marketing names.
 */
export function publicCapabilityTitle(record: CapabilityRecord): {
  readonly title: string;
  readonly normalized: boolean;
} {
  const raw = record.displayName.trim();
  if (isReadableCapabilityTitle(raw)) {
    return { title: raw, normalized: false };
  }

  const candidates: string[] = [];
  for (const label of record.originalLabels) {
    if (isReadableCapabilityTitle(label)) candidates.push(label.trim());
  }
  for (const kw of record.keywords) {
    if (kw.includes(" ") && isReadableCapabilityTitle(kw)) {
      candidates.push(kw.trim());
    }
  }
  // serviceKey sometimes is a slug with a usable stem before a hash suffix.
  const sk = record.serviceKey.trim();
  if (sk && !isRawUrlTitle(sk)) {
    const stem = sk.replace(TRAILING_HASH_RE, "").replace(/[-_]+/g, " ").trim();
    if (stem.length >= 4 && /[a-z]/i.test(stem) && isReadableCapabilityTitle(stem)) {
      candidates.push(stem.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }

  if (candidates.length > 0) {
    // Prefer shortest readable non-URL label from evidence.
    candidates.sort((a, b) => a.length - b.length || a.localeCompare(b));
    return { title: candidates[0]!, normalized: true };
  }

  // Keep original; curated filter will exclude URL-only rows.
  return { title: raw || record.serviceKey || record.capabilityId, normalized: false };
}

export function publicReadinessFor(
  record: CapabilityRecord,
): PublicReadinessLabel {
  const m = record.verification.derivedMilestone;
  if (m === "paidVerified") return "Payment verified";
  if (m === "challengeVerified" || m === "paymentCompatible") {
    // Observed challenge/payment policy is not execution verification.
    return "Endpoint observed";
  }
  if (m === "endpointReachable") return "Endpoint observed";
  if (m === "metadataValidated") return "Documented";
  if (record.capabilityId === SEC_IDENTITY_CAPABILITY_ID) return "Simulation only";
  if (record.fixtureKind === "planned" || record.sourceKind === "agenthire-planned") {
    return "Advertised";
  }
  // Discovery evidence without interface docs stays Advertised.
  return "Advertised";
}

export function assessListingQuality(
  record: CapabilityRecord,
): ListingQualityAssessment {
  const { title, normalized } = publicCapabilityTitle(record);
  const readableTitle = isReadableCapabilityTitle(title);
  const meaningfulDescription = hasMeaningfulDescription(record.description);
  const hasCategory = record.categories.length > 0;
  const hasProvenanceRef =
    record.sourceRefs.length > 0 ||
    Boolean(record.sourceKind) ||
    Boolean(record.provenance);
  const hasParentAgent = Boolean(record.agentProfileId);

  const reasons: string[] = [];
  if (!hasParentAgent) reasons.push("Missing parent agentProfileId");
  if (!readableTitle) reasons.push("Title is not human-readable");
  if (!meaningfulDescription) reasons.push("Description missing or too thin");
  if (!hasCategory) reasons.push("No category classification");
  if (!hasProvenanceRef) reasons.push("No provenance/source reference");

  const qualifiesCurated =
    hasParentAgent &&
    readableTitle &&
    meaningfulDescription &&
    hasCategory &&
    hasProvenanceRef;

  return {
    capabilityId: record.capabilityId,
    qualifiesCurated,
    incomplete: !qualifiesCurated,
    readableTitle,
    meaningfulDescription,
    hasCategory,
    hasProvenanceRef,
    hasParentAgent,
    publicReadiness: publicReadinessFor(record),
    publicTitle: title,
    titleNormalized: normalized,
    reasons,
  };
}

export function matchesListingScope(
  assessment: ListingQualityAssessment,
  scope: ListingScope,
): boolean {
  if (scope === "all") return true;
  if (scope === "curated") return assessment.qualifiesCurated;
  return assessment.incomplete;
}

export function isListingScope(value: string): value is ListingScope {
  return value === "curated" || value === "all" || value === "incomplete";
}

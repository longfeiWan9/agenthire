/**
 * Honest marketplace trust / readiness labels (D5.6).
 * Prefer neutral vocabulary; never invent Verified/Trusted/Payment ready.
 */

import { SEC_IDENTITY_CAPABILITY_ID } from "../adapters/quantjourney-sec-identity.ts";
import type {
  CapabilityRecord,
  DerivedVerificationView,
} from "../marketplace/types.ts";

export type EvidenceLevelLabel =
  | "Advertised"
  | "Discovery evidence"
  | "Registry identity observed"
  | "Metadata validated"
  | "Simulation only";

export type HiringReadinessLabel =
  | "Discoverable only"
  | "Offline demo available"
  | "Live execution blocked"
  | "Planning reference";

export type PaymentLabel =
  | "Payment unverified"
  | "Payment unavailable"
  | "Unknown (not Free)"
  | "x402 advertised (unverified)";

export type LadderLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export function evidenceLevelFor(
  record: CapabilityRecord,
): EvidenceLevelLabel {
  if (record.fixtureKind === "planned") return "Advertised";
  if (record.sourceKind === "agenthire-planned") return "Advertised";
  const m = record.verification.derivedMilestone;
  if (m === "metadataValidated") return "Metadata validated";
  if (
    record.verification.registryIdentity === "passed" ||
    record.verification.registrationMetadata === "passed"
  ) {
    return "Registry identity observed";
  }
  if (
    record.sourceKind === "agent-card-skill" ||
    record.sourceKind === "x402-resource"
  ) {
    return "Discovery evidence";
  }
  return "Advertised";
}

export function hiringReadinessFor(
  record: CapabilityRecord,
): HiringReadinessLabel {
  if (record.capabilityId === SEC_IDENTITY_CAPABILITY_ID) {
    return "Offline demo available";
  }
  if (record.sourceKind === "agenthire-planned") {
    return "Planning reference";
  }
  return "Live execution blocked";
}

export function paymentLabelFor(record: CapabilityRecord): PaymentLabel {
  if (record.capabilityId === SEC_IDENTITY_CAPABILITY_ID) {
    return "Payment unavailable";
  }
  if (record.paymentAdvertised === true) {
    return "x402 advertised (unverified)";
  }
  if (record.paymentAdvertised === false) {
    return "Payment unverified";
  }
  return "Unknown (not Free)";
}

/**
 * Honest ladder from local evidence.
 * QuantJourney SEC Identity and peers without documented interface stay L0.
 * D5.4/D5.5: null L1 selection — do not invent higher rungs.
 */
export function ladderLevelFor(record: CapabilityRecord): LadderLevel {
  void record;
  // No capability in the offline catalog has independently documented L1+.
  return "L0";
}

export function ladderNotes(record: CapabilityRecord): string {
  if (record.capabilityId === SEC_IDENTITY_CAPABILITY_ID) {
    return "Interface undocumented (method/URL/schemas unknown). D5.4/D5.5 null L1 selection. Offline simulation only.";
  }
  if (record.sourceKind === "agenthire-planned") {
    return "AgentHire planning reference — not an independently verified registered agent.";
  }
  return "Live hire blocked. Discoverable from local evidence only; interface and payment unverified.";
}

export function interfaceFieldLabel(
  value: string | null | undefined,
): string {
  if (value == null || value === "") return "Unknown";
  return value;
}

export function milestoneLabel(
  milestone: DerivedVerificationView["derivedMilestone"],
): string {
  return milestone;
}

export const TRUST_COPY = {
  advertised: "Advertised",
  interfaceUndocumented: "Interface undocumented",
  discoveryEvidence: "Discovery evidence",
  simulationOnly: "Simulation only",
  liveExecutionBlocked: "Live execution blocked",
  paymentUnverified: "Payment unverified",
} as const;

export const DEMO_DISCLAIMER =
  "Offline demo — local catalog evidence only. No live provider calls, signing, or payment." as const;

export const SIMULATION_RESULT_BANNER =
  "SIMULATED RESULT — NOT RETURNED BY AN EXTERNAL PROVIDER; NO PAYMENT WAS MADE." as const;

/**
 * Honest evidence ladder L0–L4 (D8.1 display + domain notes).
 *
 * Ladder is independent of marketplace execution lifecycle.
 * Simulation / synthetic fixtures never upgrade the ladder.
 * Offline UI approval never implies L3/L4.
 *
 * STRICTLY_OFFLINE
 */

import type { ServiceCapability } from "./types.ts";
import { SEC_IDENTITY_CAPABILITY_ID } from "../adapters/quantjourney-sec-identity.ts";

export type EvidenceLadderLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export type EvidenceLadderRung = {
  readonly level: EvidenceLadderLevel;
  readonly title: string;
  readonly meaning: string;
  readonly reached: boolean;
};

export type EvidenceLadderView = {
  readonly current: EvidenceLadderLevel;
  readonly rungs: readonly EvidenceLadderRung[];
  readonly simulationUpgradesLadder: false;
  readonly notes: readonly string[];
};

const RUNG_DEFS: readonly Omit<EvidenceLadderRung, "reached">[] = [
  {
    level: "L0",
    title: "Advertised / discovery only",
    meaning:
      "Capability appears in local catalog or discovery evidence. Method, route, or schemas may be unknown.",
  },
  {
    level: "L1",
    title: "Documented interface",
    meaning:
      "Exact method + invocation route + request/response schemas evidenced. Synthetic never qualifies.",
  },
  {
    level: "L2",
    title: "Reachability observed",
    meaning:
      "Authorized live HTTP observation reached a public endpoint without task success claims.",
  },
  {
    level: "L3",
    title: "Authorized gated attempt",
    meaning:
      "One-shot authorized challenge/PoW or gated probe with human auth — still not payment settlement.",
  },
  {
    level: "L4",
    title: "Provider-verified hire outcome",
    meaning:
      "Paid or fully authorized live execution with provider-verified result. Not available offline.",
  },
];

/**
 * Catalog truth for D8.1: no capability has independently documented L1+.
 * D5.4/D5.5 null L1 selection still holds. Simulation stays at L0.
 */
export function assessEvidenceLadder(
  record: ServiceCapability,
): EvidenceLadderView {
  const current: EvidenceLadderLevel = "L0";
  const notes: string[] = [
    "Evidence ladder is independent of Discover→Verify lifecycle status",
    "Simulation / synthetic fixtures never upgrade ladder",
  ];
  if (record.capabilityId === SEC_IDENTITY_CAPABILITY_ID) {
    notes.push(
      "SEC Identity: interface undocumented (method/URL/schemas unknown); offline simulation only",
    );
  } else if (record.sourceKind === "x402-resource") {
    notes.push(
      "Agent402 x402 resource: advertised URL ≠ verified invocation interface",
    );
  } else if (record.sourceKind === "agenthire-planned") {
    notes.push("AgentHire planning reference — not independently verified");
  } else {
    notes.push(
      "Live hire blocked. Discoverable from local evidence only; interface and payment unverified.",
    );
  }

  return {
    current,
    rungs: RUNG_DEFS.map((r) => ({
      ...r,
      reached: rungReached(current, r.level),
    })),
    simulationUpgradesLadder: false,
    notes,
  };
}

function rungReached(
  current: EvidenceLadderLevel,
  level: EvidenceLadderLevel,
): boolean {
  const order: Record<EvidenceLadderLevel, number> = {
    L0: 0,
    L1: 1,
    L2: 2,
    L3: 3,
    L4: 4,
  };
  return order[level] <= order[current];
}

export function ladderLevelLabel(level: EvidenceLadderLevel): string {
  return level;
}

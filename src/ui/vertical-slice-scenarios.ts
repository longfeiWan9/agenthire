/**
 * Eight offline marketplace vertical-slice demo scenarios (D8.1 Task E).
 * Sanitized fixtures only — no live provider I/O.
 * Preserves existing HireJob / quote offline demos.
 */

import { SEC_IDENTITY_CAPABILITY_ID } from "../adapters/quantjourney-sec-identity.ts";
import { AGENT402_JSON_VALIDATE_CAPABILITY_ID } from "../marketplace/d73-display-adapter.ts";
import type { MarketplacePhase } from "../marketplace/execution-lifecycle.ts";
import type { HireJobFixtureKind } from "../jobs/types.ts";

export type VerticalSliceScenarioId =
  | "discover-curated-task"
  | "evaluate-capability-ladder"
  | "hire-sec-input-job"
  | "authorize-simulation-only"
  | "execute-fixture-success"
  | "verify-evidence-sanitized"
  | "invalidate-approval-on-input-change"
  | "agent402-hire-blocked-distinctions";

export type VerticalSliceScenario = {
  readonly id: VerticalSliceScenarioId;
  readonly title: string;
  readonly phase: MarketplacePhase;
  readonly route: string;
  readonly capabilityId: string | null;
  readonly fixtureKind: HireJobFixtureKind | null;
  readonly steps: readonly string[];
  readonly expectedSignals: readonly string[];
  readonly preservesOfflineDemos: boolean;
};

export const VERTICAL_SLICE_SCENARIOS: readonly VerticalSliceScenario[] = [
  {
    id: "discover-curated-task",
    title: "Discover — task-first curated agents",
    phase: "discover",
    route: "/?q=SEC+identity",
    capabilityId: null,
    fixtureKind: null,
    steps: [
      "Open Discover",
      "Search for SEC identity (or similar task phrase)",
      "Confirm curated agent cards with registration-network labels",
    ],
    expectedSignals: [
      "What do you need an agent to do?",
      "curated",
      "not 690 verified",
    ],
    preservesOfflineDemos: true,
  },
  {
    id: "evaluate-capability-ladder",
    title: "Evaluate — capability trust ladder L0",
    phase: "evaluate",
    route: `/capabilities/${encodeURIComponent(SEC_IDENTITY_CAPABILITY_ID)}`,
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    fixtureKind: null,
    steps: [
      "Open SEC Company Identity capability",
      "Read evidence ladder L0 and payment unavailable labels",
      "Confirm parent agent link (discovery profile, not Sepolia merge)",
    ],
    expectedSignals: [
      "Ladder L0",
      "Payment unavailable",
      "Offline demo available",
    ],
    preservesOfflineDemos: true,
  },
  {
    id: "hire-sec-input-job",
    title: "Hire — validate ticker and create HireJob",
    phase: "hire",
    route: `/hire/${encodeURIComponent(SEC_IDENTITY_CAPABILITY_ID)}`,
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    fixtureKind: null,
    steps: [
      "Enter ticker AAPL",
      "Validate input",
      "Create HireJob",
      "Observe live quote unavailable",
    ],
    expectedSignals: [
      "quoteUnavailable",
      "Live quote unavailable",
      "paidVerified=false",
    ],
    preservesOfflineDemos: true,
  },
  {
    id: "authorize-simulation-only",
    title: "Authorize — simulation approve ≠ live auth",
    phase: "authorize",
    route: `/hire/${encodeURIComponent(SEC_IDENTITY_CAPABILITY_ID)}`,
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    fixtureKind: null,
    steps: [
      "Reveal synthetic quote",
      "Simulation approve",
      "Confirm executionAuthorization=false and paymentExecutionAuthorization=false",
    ],
    expectedSignals: [
      "simulationApproved",
      "executionAuthorization=false",
      "Offline UI approval ≠ live authorization",
    ],
    preservesOfflineDemos: true,
  },
  {
    id: "execute-fixture-success",
    title: "Execute — offline fixture success-aapl",
    phase: "execute",
    route: `/hire/${encodeURIComponent(SEC_IDENTITY_CAPABILITY_ID)}`,
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    fixtureKind: "success-aapl",
    steps: [
      "Select fixture success-aapl",
      "Run fixture",
      "Confirm simulatedSucceeded and providerExecutionVerified=false",
    ],
    expectedSignals: [
      "success-aapl",
      "SIMULATED RESULT",
      "providerExecutionVerified=false",
    ],
    preservesOfflineDemos: true,
  },
  {
    id: "verify-evidence-sanitized",
    title: "Verify — sanitized evidence viewer",
    phase: "verify",
    route: `/hire/${encodeURIComponent(SEC_IDENTITY_CAPABILITY_ID)}`,
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    fixtureKind: "success-aapl",
    steps: [
      "Inspect evidence viewer payload",
      "Confirm simulation banner",
      "Confirm no secrets (tokens/keys) rendered",
    ],
    expectedSignals: [
      "Evidence viewer",
      "simulated=true",
      "secretsRedacted",
    ],
    preservesOfflineDemos: true,
  },
  {
    id: "invalidate-approval-on-input-change",
    title: "Authorize — invalidate on sensitive input change",
    phase: "authorize",
    route: `/hire/${encodeURIComponent(SEC_IDENTITY_CAPABILITY_ID)}`,
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    fixtureKind: null,
    steps: [
      "Approve simulation",
      "Change ticker (e.g. AAPL → MSFT) and re-validate",
      "Confirm prior approval cleared / invalidated",
    ],
    expectedSignals: [
      "Prior HireJob / quote / approval state cleared",
      "authorizationInvalidated or session null",
    ],
    preservesOfflineDemos: true,
  },
  {
    id: "agent402-hire-blocked-distinctions",
    title: "Evaluate/Hire — Agent402 blocked + PoW vs payment vs UI approval",
    phase: "evaluate",
    route: `/hire/${encodeURIComponent(AGENT402_JSON_VALIDATE_CAPABILITY_ID)}`,
    capabilityId: AGENT402_JSON_VALIDATE_CAPABILITY_ID,
    fixtureKind: null,
    steps: [
      "Open Agent402 JSON-validate hire route",
      "Confirm guided hire unavailable (no invented schema)",
      "Read PoW vs x402 payment vs offline UI approval distinctions",
    ],
    expectedSignals: [
      "Guided hire unavailable",
      "PoW",
      "x402",
      "simulation approval",
    ],
    preservesOfflineDemos: true,
  },
] as const;

export function getVerticalSliceScenario(
  id: VerticalSliceScenarioId,
): VerticalSliceScenario {
  const found = VERTICAL_SLICE_SCENARIOS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`unknown vertical slice scenario: ${id}`);
  }
  return found;
}

export function listVerticalSliceScenarioIds(): readonly VerticalSliceScenarioId[] {
  return VERTICAL_SLICE_SCENARIOS.map((s) => s.id);
}

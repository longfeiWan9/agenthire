/**
 * D8.1 marketplace vertical slice — STRICTLY_OFFLINE.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { SEC_IDENTITY_CAPABILITY_ID } from "../src/adapters/quantjourney-sec-identity.ts";
import {
  AGENT402_JSON_VALIDATE_CAPABILITY_ID,
  buildAgent402PowDisplayView,
  D73_MERGE_DEPENDENCIES,
} from "../src/marketplace/d73-display-adapter.ts";
import { assessEvidenceLadder } from "../src/marketplace/evidence-ladder.ts";
import {
  deriveExecutionLifecycle,
  MARKETPLACE_PHASES,
  SENSITIVE_APPROVAL_FIELDS,
} from "../src/marketplace/execution-lifecycle.ts";
import { getCapabilityById } from "../src/ui/catalog-store.ts";
import {
  isSecretKey,
  sanitizeEvidencePayload,
} from "../src/ui/evidence-sanitizer.ts";
import {
  configureHireInput,
  createValidatedHireJob,
  getOrCreateHireSession,
  resetHireSessionsForTests,
  revealSyntheticQuote,
  revokeHireApproval,
  runNamedOfflineFixture,
  simulateApproveHire,
} from "../src/ui/hire-session.ts";
import {
  listVerticalSliceScenarioIds,
  VERTICAL_SLICE_SCENARIOS,
} from "../src/ui/vertical-slice-scenarios.ts";
import { SIMULATION_RESULT_BANNER } from "../src/ui/trust-labels.ts";

const ROOT = process.cwd();

describe("D8.1 execution lifecycle", () => {
  it("exposes six marketplace phases independent of ladder", () => {
    expect(MARKETPLACE_PHASES).toEqual([
      "discover",
      "evaluate",
      "hire",
      "authorize",
      "execute",
      "verify",
    ]);
    const view = deriveExecutionLifecycle({
      supported: true,
      blockReason: null,
      hasInput: false,
      hasJob: false,
      quoteUnavailable: false,
      syntheticQuoteRevealed: false,
      approvalState: "none",
      authorizationInvalidated: false,
      hasFixtureResult: false,
      fixtureOk: null,
      evidenceLadder: "L0",
    });
    expect(view.evidenceLadder).toBe("L0");
    expect(view.liveExecutionAuthorized).toBe(false);
    expect(view.livePaymentAuthorized).toBe(false);
    expect(view.simulationOnly).toBe(true);
    expect(view.status).toBe("inputsPending");
  });

  it("lists sensitive approval fields for invalidation policy", () => {
    expect(SENSITIVE_APPROVAL_FIELDS).toContain("ticker");
    expect(SENSITIVE_APPROVAL_FIELDS).toContain("amountAtomic");
  });
});

describe("D8.1 hire session lifecycle + evidence", () => {
  beforeEach(() => {
    resetHireSessionsForTests();
  });

  it("derives lifecycle through authorize → execute → verify", () => {
    configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    createValidatedHireJob(SEC_IDENTITY_CAPABILITY_ID);
    const quoted = revealSyntheticQuote(SEC_IDENTITY_CAPABILITY_ID);
    expect(quoted.lifecycle.phase).toBe("authorize");
    expect(quoted.lifecycle.status).toBe("awaitingSimulationAuth");

    const approved = simulateApproveHire(SEC_IDENTITY_CAPABILITY_ID);
    expect(approved.lifecycle.status).toBe("simulationAuthorized");
    expect(approved.lifecycle.liveExecutionAuthorized).toBe(false);

    const executed = runNamedOfflineFixture(
      SEC_IDENTITY_CAPABILITY_ID,
      "success-aapl",
    );
    expect(executed.lifecycle.phase).toBe("verify");
    expect(executed.lifecycle.status).toBe("verifiedSimulated");
    expect(executed.lifecycle.evidenceLadder).toBe("L0");
    expect(executed.banner).toBe(SIMULATION_RESULT_BANNER);
    expect(executed.evidenceView?.simulated).toBe(true);
    expect(executed.evidenceView?.providerExecutionVerified).toBe(false);
    expect(executed.evidenceView?.secretsRedacted).toBeGreaterThanOrEqual(1);
    expect(executed.evidenceJson).not.toMatch(/trap-should-redact/);
    expect(executed.evidenceJson).toMatch(/\[REDACTED\]/);
  });

  it("invalidates approval when sensitive input changes", () => {
    configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    createValidatedHireJob(SEC_IDENTITY_CAPABILITY_ID);
    revealSyntheticQuote(SEC_IDENTITY_CAPABILITY_ID);
    simulateApproveHire(SEC_IDENTITY_CAPABILITY_ID);

    const next = configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "MSFT");
    expect(next.authorizationInvalidated).toBe(true);
    expect(next.session).toBeNull();
    expect(next.job).toBeNull();
    expect(next.actionFeedback).toMatch(/prior approval invalidated/i);
    expect(next.notes.some((n) => /cleared after input change/.test(n))).toBe(
      true,
    );
  });

  it("blocks unsupported capabilities with Agent402 distinctions available", () => {
    const snap = getOrCreateHireSession(AGENT402_JSON_VALIDATE_CAPABILITY_ID);
    expect(snap.supported).toBe(false);
    expect(snap.lifecycle.status).toBe("blocked");
    const display = buildAgent402PowDisplayView();
    expect(display.mergeIntegrated).toBe(false);
    expect(display.ladderCeilingOffline).toBe("L0");
    expect(display.distinctions.length).toBe(3);
  });

  it("revoke marks authorization invalidated", () => {
    configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    createValidatedHireJob(SEC_IDENTITY_CAPABILITY_ID);
    revealSyntheticQuote(SEC_IDENTITY_CAPABILITY_ID);
    simulateApproveHire(SEC_IDENTITY_CAPABILITY_ID);
    const revoked = revokeHireApproval(SEC_IDENTITY_CAPABILITY_ID);
    expect(revoked.authorizationInvalidated).toBe(true);
    expect(revoked.session?.state).toBe("revoked");
  });
});

describe("D8.1 evidence ladder + sanitizer", () => {
  it("keeps SEC Identity at L0 and never upgrades via simulation", () => {
    const record = getCapabilityById(SEC_IDENTITY_CAPABILITY_ID);
    expect(record).not.toBeNull();
    const ladder = assessEvidenceLadder(record!);
    expect(ladder.current).toBe("L0");
    expect(ladder.simulationUpgradesLadder).toBe(false);
    expect(ladder.rungs).toHaveLength(5);
  });

  it("redacts secret-like keys", () => {
    expect(isSecretKey("apiKey")).toBe(true);
    expect(isSecretKey("authorization")).toBe(true);
    expect(isSecretKey("companyName")).toBe(false);
    const view = sanitizeEvidencePayload(
      { companyName: "Apple Inc.", token: "secret", nested: { password: "x" } },
      SIMULATION_RESULT_BANNER,
    );
    expect(view.secretsRedacted).toBe(2);
    expect(view.payload).toEqual({
      companyName: "Apple Inc.",
      token: "[REDACTED]",
      nested: { password: "[REDACTED]" },
    });
  });
});

describe("D8.1 eight offline scenarios", () => {
  it("defines exactly eight scenarios and preserves offline demos", () => {
    expect(listVerticalSliceScenarioIds()).toHaveLength(8);
    expect(VERTICAL_SLICE_SCENARIOS).toHaveLength(8);
    expect(VERTICAL_SLICE_SCENARIOS.every((s) => s.preservesOfflineDemos)).toBe(
      true,
    );
    const ids = new Set(VERTICAL_SLICE_SCENARIOS.map((s) => s.id));
    expect(ids.has("discover-curated-task")).toBe(true);
    expect(ids.has("agent402-hire-blocked-distinctions")).toBe(true);
  });
});

describe("D8.1 D7.3 display adapter (no pow import)", () => {
  it("documents merge dependencies without importing pow runtime", () => {
    expect(D73_MERGE_DEPENDENCIES.length).toBeGreaterThanOrEqual(4);
    expect(D73_MERGE_DEPENDENCIES.some((d) => d.path === "src/pow/")).toBe(
      true,
    );
    const consoleSrc = readFileSync(
      join(ROOT, "components/HireConsole.tsx"),
      "utf8",
    );
    expect(consoleSrc).not.toMatch(/from ["'].*pow\//);
    expect(consoleSrc).toMatch(/Offline UI approval/);
    expect(consoleSrc).toMatch(/data-testid="evidence-viewer"|EvidenceViewer/);
  });
});

/**
 * D6.1 browser QA hardening regressions — STRICTLY_OFFLINE.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { SEC_IDENTITY_CAPABILITY_ID } from "../src/adapters/quantjourney-sec-identity.ts";
import {
  attemptModifiedBindingApprove,
  configureHireInput,
  createValidatedHireJob,
  resetHireSessionsForTests,
  revealSyntheticQuote,
  runNamedOfflineFixture,
  simulateApproveHire,
} from "../src/ui/hire-session.ts";
import {
  networkLabelFor,
  SIMULATION_RESULT_BANNER,
} from "../src/ui/trust-labels.ts";
import { getCapabilityById } from "../src/ui/catalog-store.ts";

const ROOT = process.cwd();

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("D6.1 UI hardening regressions", () => {
  beforeEach(() => {
    resetHireSessionsForTests();
  });

  it("surfaces modified-fingerprint fail-closed as actionFeedback", () => {
    configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    createValidatedHireJob(SEC_IDENTITY_CAPABILITY_ID);
    revealSyntheticQuote(SEC_IDENTITY_CAPABILITY_ID);
    simulateApproveHire(SEC_IDENTITY_CAPABILITY_ID);
    const modified = attemptModifiedBindingApprove(SEC_IDENTITY_CAPABILITY_ID);
    expect(modified.actionFeedback).toMatch(/modified-binding approve ok=false/);
    expect(modified.notes.some((n) => /modified-binding approve ok=false/.test(n))).toBe(
      true,
    );
  });

  it("surfaces validation and fixture feedback outside buried notes", () => {
    const bad = configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "  ");
    expect(bad.actionFeedback).toMatch(/empty/);

    const good = configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    expect(good.actionFeedback).toMatch(/Input accepted/);

    const fixture = runNamedOfflineFixture(SEC_IDENTITY_CAPABILITY_ID, "success-aapl");
    expect(fixture.banner).toBe(SIMULATION_RESULT_BANNER);
    expect(fixture.actionFeedback).toMatch(/providerExecutionVerified=false/);
  });

  it("adds skip link, main landmark id, and safer motion defaults", () => {
    const header = read("components/SiteHeader.tsx");
    const layout = read("app/layout.tsx");
    const css = read("app/globals.css");
    expect(header).toMatch(/skip-link/);
    expect(header).toMatch(/#main-content/);
    expect(layout).toMatch(/id="main-content"/);
    expect(layout).toMatch(/AgentHire D6\.1/);
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/prefers-reduced-motion/);
    expect(css).not.toMatch(/animation:\s*rise[^;]*\bboth\b/);
  });

  it("HireConsole exposes action feedback region and stable note keys", () => {
    const consoleSrc = read("components/HireConsole.tsx");
    expect(consoleSrc).toMatch(/data-testid="hire-action-feedback"/);
    expect(consoleSrc).toMatch(/actionFeedback/);
    expect(consoleSrc).toMatch(/aria-busy/);
    expect(consoleSrc).toMatch(/key=\{`\$\{i\}-/);
    expect(consoleSrc).toMatch(/data-testid="hire-task-guidance"/);
    expect(consoleSrc).toMatch(/Task:/);
  });

  it("labels Base Mainnet vs Sepolia networks without implying hire readiness", () => {
    const mainnet = getCapabilityById("cap:00939f16e744");
    const sepolia = getCapabilityById("cap:7b2e5a7406dd");
    const external = getCapabilityById(SEC_IDENTITY_CAPABILITY_ID);
    expect(mainnet).not.toBeNull();
    expect(sepolia).not.toBeNull();
    expect(external).not.toBeNull();
    expect(networkLabelFor(mainnet!)).toBe("Base Mainnet (8453)");
    expect(networkLabelFor(sepolia!)).toBe("Base Sepolia (84532)");
    expect(networkLabelFor(external!)).toBe("External / unregistered");

    const card = read("components/CapabilityCard.tsx");
    expect(card).toMatch(/networkLabelFor/);
    expect(card).not.toMatch(/record\.protocols\.join/);
  });

  it("reconfiguring input after simulation approve clears approval state", () => {
    configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    createValidatedHireJob(SEC_IDENTITY_CAPABILITY_ID);
    revealSyntheticQuote(SEC_IDENTITY_CAPABILITY_ID);
    const approved = simulateApproveHire(SEC_IDENTITY_CAPABILITY_ID);
    expect(approved.session?.state).toBe("simulationApproved");
    expect(approved.session?.flags.executionAuthorization).toBe(false);
    expect(approved.notes.some((n) => n.includes("approval.state=simulationApproved"))).toBe(
      true,
    );

    const reset = configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "MSFT");
    expect(reset.session).toBeNull();
    expect(reset.job).toBeNull();
    expect(reset.binding).toBeNull();
    expect(reset.syntheticQuote).toBeNull();
    expect(reset.input?.kind).toBe("ticker");
    expect(reset.notes.some((n) => /approval\.state=simulationApproved/.test(n))).toBe(
      false,
    );
    expect(reset.notes.some((n) => /Prior HireJob/.test(n))).toBe(true);
  });
});

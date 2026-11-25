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
import { SIMULATION_RESULT_BANNER } from "../src/ui/trust-labels.ts";

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
  });
});

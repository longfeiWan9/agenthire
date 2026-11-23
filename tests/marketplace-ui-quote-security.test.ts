/**
 * D5.6 quote/approval + security UI tests — STRICTLY_OFFLINE.
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
  revokeHireApproval,
  simulateApproveHire,
} from "../src/ui/hire-session.ts";
import {
  assertSafeCapabilityRouteParam,
  isForbiddenUserPath,
  isUserSuppliedProviderUrl,
  UI_SECURITY_POLICY,
} from "../src/ui/security-guards.ts";

const ROOT = process.cwd();

function readUiSources(): string {
  const files = [
    "src/ui/catalog-store.ts",
    "src/ui/hire-session.ts",
    "src/ui/hire-actions.ts",
    "src/ui/security-guards.ts",
    "src/ui/provenance.ts",
    "src/ui/trust-labels.ts",
    "components/HireConsole.tsx",
    "app/page.tsx",
    "app/capabilities/[capabilityId]/page.tsx",
    "app/hire/[capabilityId]/page.tsx",
  ];
  return files.map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
}

describe("D5.6 UI quote/approval", () => {
  beforeEach(() => {
    resetHireSessionsForTests();
  });

  it("live quote unavailable; synthetic labeled; modified binding fail-closed", () => {
    configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    const jobbed = createValidatedHireJob(SEC_IDENTITY_CAPABILITY_ID);
    expect(jobbed.liveQuote?.status).toBe("unavailable");

    const synth = revealSyntheticQuote(SEC_IDENTITY_CAPABILITY_ID);
    expect(synth.syntheticQuote?.provenance).toMatch(/synthetic|advertised/i);
    expect(synth.notes.some((n) => /SYNTHETIC/i.test(n))).toBe(true);

    simulateApproveHire(SEC_IDENTITY_CAPABILITY_ID);
    // After approve, modified binding should fail closed (replay/substitution).
    const modified = attemptModifiedBindingApprove(SEC_IDENTITY_CAPABILITY_ID);
    expect(modified.notes.some((n) => /modified-binding approve ok=false/.test(n))).toBe(
      true,
    );
  });

  it("revokes simulation approval without granting live pay", () => {
    configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    createValidatedHireJob(SEC_IDENTITY_CAPABILITY_ID);
    revealSyntheticQuote(SEC_IDENTITY_CAPABILITY_ID);
    simulateApproveHire(SEC_IDENTITY_CAPABILITY_ID);
    const revoked = revokeHireApproval(SEC_IDENTITY_CAPABILITY_ID);
    expect(revoked.session?.state).toBe("revoked");
    expect(revoked.session?.flags.paymentExecutionAuthorization).toBe(false);
  });
});

describe("D5.6 UI security", () => {
  it("exposes offline-only security policy", () => {
    expect(UI_SECURITY_POLICY.allowProviderHttp).toBe(false);
    expect(UI_SECURITY_POLICY.allowUserProviderUrls).toBe(false);
    expect(UI_SECURITY_POLICY.allowMarkerReuse).toBe(false);
    expect(UI_SECURITY_POLICY.allowB4Mutation).toBe(false);
    expect(UI_SECURITY_POLICY.allowExternalFontsCdn).toBe(false);
  });

  it("rejects SSRF-ish urls, file paths, and unsafe capability ids", () => {
    expect(isUserSuppliedProviderUrl("https://evil.example/x")).toBe(true);
    expect(isUserSuppliedProviderUrl("AAPL")).toBe(false);
    expect(isForbiddenUserPath("/etc/passwd")).toBe(true);
    expect(isForbiddenUserPath("docs/day5/evidence/openapi-001-live-attempt.marker")).toBe(
      true,
    );
    expect(assertSafeCapabilityRouteParam("../secrets").ok).toBe(false);
    expect(assertSafeCapabilityRouteParam(SEC_IDENTITY_CAPABILITY_ID).ok).toBe(true);
  });

  it("UI sources do not introduce provider fetchers, CDN fonts, or marker resets", () => {
    const src = readUiSources();
    expect(src).not.toMatch(/fonts\.googleapis\.com/);
    expect(src).not.toMatch(/fonts\.gstatic\.com/);
    expect(src).not.toMatch(/writeFileSync\s*\(/);
    expect(src).not.toMatch(/unlinkSync\s*\(/);
    expect(src).not.toMatch(/rmSync\s*\(/);
    expect(src).not.toMatch(/fetch\(\s*['"`]https?:\/\//);
    expect(src).not.toMatch(/new\s+WebSocket\s*\(/);
    expect(src).not.toMatch(/createWalletClient|privateKeyToAccount|signTypedData/);
    // Policy remains fail-closed; deny-list may name markers without resetting them.
    expect(src).toMatch(/allowMarkerReuse:\s*false/);
    expect(src).toMatch(/allowB4Mutation:\s*false/);
    expect(src).toMatch(/allowProviderHttp:\s*false/);
    // Catalog loader uses fixed relative evidence paths only.
    expect(src).toMatch(/docs\/marketplace\/evidence\/capability-catalog\.json/);
  });

  it("does not mutate B4 verification evidence file", () => {
    const before = readFileSync(
      join(ROOT, "docs/evidence/provider-verification.json"),
      "utf8",
    );
    configureHireInput(SEC_IDENTITY_CAPABILITY_ID, "ticker", "AAPL");
    createValidatedHireJob(SEC_IDENTITY_CAPABILITY_ID);
    runNamedOfflineNoop();
    const after = readFileSync(
      join(ROOT, "docs/evidence/provider-verification.json"),
      "utf8",
    );
    expect(after).toBe(before);
  });
});

function runNamedOfflineNoop(): void {
  // touch hire path only; no file writes to evidence
  revealSyntheticQuote(SEC_IDENTITY_CAPABILITY_ID);
}

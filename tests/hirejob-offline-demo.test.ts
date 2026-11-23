/**
 * D5.2 offline HireJob fixture runner + demo tests.
 * STRICTLY_OFFLINE — simulated results never claimed as provider returns.
 */

import { describe, expect, it } from "vitest";
import {
  HIREJOB_FIXTURE_CASES,
  runAllOfflineHireJobFixtures,
  runOfflineHireJobFixture,
  SIMULATION_BANNER,
} from "../src/jobs/index.ts";
import {
  formatDemoHireJobOffline,
  runDemoHireJobOffline,
} from "../src/scripts/demo-hirejob-offline.ts";

describe("offline HireJob fixture runner", () => {
  it("is not named executePaidTask or runLiveAgent", async () => {
    const mod = await import("../src/jobs/offline-fixture-runner.ts");
    expect("executePaidTask" in mod).toBe(false);
    expect("runLiveAgent" in mod).toBe(false);
    expect(typeof mod.runOfflineHireJobFixture).toBe("function");
  });

  it("covers all first-adapter-spec fixture kinds", () => {
    const kinds = HIREJOB_FIXTURE_CASES.map((c) => c.kind).sort();
    expect(kinds).toEqual(
      [
        "compatible-payment-unapproved-402",
        "incompatible-payment-402",
        "invalid-input-empty",
        "invalid-input-url",
        "provider-error-4xx",
        "provider-error-5xx",
        "success-aapl",
      ].sort(),
    );
    for (const c of HIREJOB_FIXTURE_CASES) {
      expect(c.fixtureKind).toBe("synthetic");
    }
  });

  it("runs every fixture successfully offline", () => {
    const results = runAllOfflineHireJobFixtures();
    expect(results).toHaveLength(HIREJOB_FIXTURE_CASES.length);
    for (const r of results) {
      expect(r.ok).toBe(true);
      expect(r.banner).toBe(SIMULATION_BANNER);
      expect(r.job.flags.approvedForNetworkExecution).toBe(false);
      expect(r.job.flags.paidVerified).toBe(false);
      expect(r.job.result.providerExecutionVerified).toBe(false);
    }
  });

  it("success-aapl ends simulatedSucceeded with synthetic provenance warning", () => {
    const r = runOfflineHireJobFixture("success-aapl");
    expect(r.ok).toBe(true);
    expect(r.job.status).toBe("simulatedSucceeded");
    expect(r.job.result.outcomeKind).toBe("simulatedFixture");
    expect(r.job.result.warning).toContain(
      "SIMULATED RESULT — NOT RETURNED BY AN EXTERNAL PROVIDER",
    );
    expect(r.job.result.warning).toContain("NO PAYMENT WAS MADE");
  });

  it("invalid inputs fail closed locally", () => {
    const empty = runOfflineHireJobFixture("invalid-input-empty");
    expect(empty.job.status).toBe("simulatedFailed");
    const url = runOfflineHireJobFixture("invalid-input-url");
    expect(url.job.status).toBe("simulatedFailed");
  });

  it("payment fixtures block without signing", () => {
    const incompatible = runOfflineHireJobFixture("incompatible-payment-402");
    expect(incompatible.job.status).toBe("blocked");
    expect(incompatible.job.payment.status).toBe("policyIncompatible");

    const compatible = runOfflineHireJobFixture(
      "compatible-payment-unapproved-402",
    );
    expect(compatible.job.status).toBe("blocked");
    expect(compatible.job.payment.status).toBe("policyCompatibleUnapproved");
    expect(compatible.job.payment.paymentApprovalGranted).toBe(false);
  });
});

describe("demo:hirejob:offline", () => {
  it("prints simulation banner and succeeds with nonzero-exit contract on failure path", () => {
    const report = runDemoHireJobOffline();
    const text = formatDemoHireJobOffline(report);
    expect(text).toContain(SIMULATION_BANNER);
    expect(text).toContain("STRICTLY_OFFLINE");
    expect(report.ok).toBe(true);
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(HIREJOB_FIXTURE_CASES.length);
    expect(report.identitySafeToMerge).toBe(false);
  });
});

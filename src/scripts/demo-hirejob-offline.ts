/**
 * Offline HireJob demo (D5.2).
 *
 * pnpm demo:hirejob:offline
 *
 * STRICTLY_OFFLINE — zero provider network, signing, payment, or live execution.
 * Simulated results are never presented as provider returns.
 */

import {
  createDefaultAdapterRegistry,
  quantJourneySecIdentityAdapter,
} from "../adapters/index.ts";
import {
  HIREJOB_FIXTURE_CASES,
  runAllOfflineHireJobFixtures,
  runOfflineHireJobFixture,
  SIMULATION_BANNER,
} from "../jobs/index.ts";
import { assessQuantJourneyIdentityLinkage } from "../marketplace/identity-linkage.ts";

export type DemoHireJobOfflineReport = {
  readonly mode: "STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_EXECUTION";
  readonly banner: typeof SIMULATION_BANNER;
  readonly adapterRegistered: boolean;
  readonly fixtureCount: number;
  readonly passed: number;
  readonly failed: number;
  readonly identityLinkageVerdict: string;
  readonly identitySafeToMerge: false;
  readonly lines: readonly string[];
  readonly ok: boolean;
};

export function runDemoHireJobOffline(): DemoHireJobOfflineReport {
  const lines: string[] = [];
  lines.push("AgentHire D5.2 — Offline HireJob Demo");
  lines.push(
    "mode=STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_EXECUTION",
  );
  lines.push(SIMULATION_BANNER);
  lines.push("");

  const registry = createDefaultAdapterRegistry(quantJourneySecIdentityAdapter);
  const resolved = registry.resolve({
    by: "capabilityId",
    capabilityId: quantJourneySecIdentityAdapter.meta.capabilityId,
  });
  const adapterRegistered = resolved.ok;
  lines.push(
    `adapter: ${quantJourneySecIdentityAdapter.meta.adapterId} registered=${adapterRegistered}`,
  );
  lines.push(
    `executionMode=${quantJourneySecIdentityAdapter.meta.executionMode}`,
  );
  lines.push(
    `interfaceDocumented=${quantJourneySecIdentityAdapter.interfaceDocumentation.interfaceDocumented} method=${String(quantJourneySecIdentityAdapter.interfaceDocumentation.method)} url=${String(quantJourneySecIdentityAdapter.interfaceDocumentation.url)}`,
  );
  lines.push(
    `approvedForNetworkExecution=${quantJourneySecIdentityAdapter.executionAuthorization.approvedForNetworkExecution}`,
  );
  lines.push("");

  const identity = assessQuantJourneyIdentityLinkage();
  lines.push(
    `identityLinkage: verdict=${identity.verdict} safeToMergeProfiles=${identity.safeToMergeProfiles}`,
  );
  for (const reason of identity.reasons) {
    lines.push(`  - ${reason}`);
  }
  lines.push("");

  const results = runAllOfflineHireJobFixtures("1970-01-01T00:00:00.000Z");
  let passed = 0;
  let failed = 0;
  for (const result of results) {
    const mark = result.ok ? "PASS" : "FAIL";
    if (result.ok) passed += 1;
    else failed += 1;
    lines.push(
      `[${mark}] ${result.fixture.kind} → status=${result.job.status} payment=${result.job.payment.status}`,
    );
    lines.push(`       ${SIMULATION_BANNER}`);
  }

  // Spotlight success path
  const success = runOfflineHireJobFixture("success-aapl");
  lines.push("");
  lines.push("Spotlight: success-aapl (synthetic)");
  lines.push(`  hireJobId=${success.job.hireJobId}`);
  lines.push(`  status=${success.job.status}`);
  lines.push(
    `  providerExecutionVerified=${success.job.result.providerExecutionVerified}`,
  );
  lines.push(`  paidVerified=${success.job.flags.paidVerified}`);
  lines.push(`  ${success.banner}`);

  const ok =
    adapterRegistered &&
    failed === 0 &&
    identity.safeToMergeProfiles === false &&
    passed === HIREJOB_FIXTURE_CASES.length;

  lines.push("");
  lines.push(
    ok
      ? `Demo OK — ${passed}/${HIREJOB_FIXTURE_CASES.length} fixtures; zero network`
      : `Demo FAILED — passed=${passed} failed=${failed}`,
  );

  return {
    mode: "STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_EXECUTION",
    banner: SIMULATION_BANNER,
    adapterRegistered,
    fixtureCount: HIREJOB_FIXTURE_CASES.length,
    passed,
    failed,
    identityLinkageVerdict: identity.verdict,
    identitySafeToMerge: false,
    lines,
    ok,
  };
}

export function formatDemoHireJobOffline(
  report: DemoHireJobOfflineReport = runDemoHireJobOffline(),
): string {
  return report.lines.join("\n");
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === new URL(entry, "file://").href;
  } catch {
    return entry.replace(/\\/g, "/").endsWith("/src/scripts/demo-hirejob-offline.ts");
  }
}

if (isMainModule()) {
  const report = runDemoHireJobOffline();
  console.log(formatDemoHireJobOffline(report));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

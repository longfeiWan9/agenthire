/**
 * Offline HireJob quote + approval demo (D5.3).
 *
 * pnpm demo:hirejob:quote:offline
 *
 * STRICTLY_OFFLINE — zero provider network, signing, payment, or service execution.
 * Scenarios A–E. Banner mandatory on every path.
 */

import {
  buildQuantJourneyInterfaceDiscoveryPlan,
  QUOTE_APPROVAL_BANNER,
  runScenarioAAdvertisedOnly,
  runScenarioBSyntheticCompatibleApprove,
  runScenarioCIncompatibleBlock,
  runScenarioDSubstitutionReplayFailClosed,
  runScenarioERejectRevokeExpire,
} from "../hiring/index.ts";

export type DemoHireJobQuoteOfflineReport = {
  readonly mode: "STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_SERVICE_EXECUTION";
  readonly banner: typeof QUOTE_APPROVAL_BANNER;
  readonly proposalCount: number;
  readonly scenariosPassed: number;
  readonly scenariosFailed: number;
  readonly lines: readonly string[];
  readonly ok: boolean;
  /** Stable fingerprint for determinism checks across two runs. */
  readonly determinismKey: string;
};

function scenarioPass(label: string, ok: boolean, detail: string): string {
  return `[${ok ? "PASS" : "FAIL"}] ${label} — ${detail}`;
}

export function runDemoHireJobQuoteOffline(
  createdAt: string = "1970-01-01T00:00:00.000Z",
): DemoHireJobQuoteOfflineReport {
  const lines: string[] = [];
  lines.push("AgentHire D5.3 — Offline Quote Preview & Manual Approval Demo");
  lines.push(
    "mode=STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_SERVICE_EXECUTION",
  );
  lines.push(QUOTE_APPROVAL_BANNER);
  lines.push("");

  const plan = buildQuantJourneyInterfaceDiscoveryPlan();
  lines.push(
    `QuantJourney interface-discovery plan: proposals=${plan.proposals.length} (max ${plan.maxProposals}) fetchPerformed=${plan.fetchPerformed} approvedForNetworkExecution=${plan.approvedForNetworkExecution}`,
  );
  for (const note of plan.notes.slice(0, 4)) {
    lines.push(`  - ${note}`);
  }
  lines.push("");

  let passed = 0;
  let failed = 0;

  // A
  const a = runScenarioAAdvertisedOnly(createdAt);
  const aOk =
    a.quote.provenance === "advertisedPricing" &&
    a.quote.paymentReady === false &&
    a.quote.amount.unknown === true &&
    a.job.status === "quoteUnavailable" &&
    a.job.flags.paidVerified === false &&
    a.liveExecutionPermission === false;
  if (aOk) passed += 1;
  else failed += 1;
  lines.push(
    scenarioPass(
      "A advertised-only",
      aOk,
      `status=${a.job.status} provenance=${a.quote.provenance} unknownAmount=${a.quote.amount.unknown} paymentReady=${a.quote.paymentReady}`,
    ),
  );
  lines.push(`       ${QUOTE_APPROVAL_BANNER}`);

  // B
  const b = runScenarioBSyntheticCompatibleApprove(createdAt);
  const bOk =
    b.quote.provenance === "syntheticFixture" &&
    b.quote.status === "policyCompatibleUnapproved" &&
    b.quote.amount.displayUsdc === "0.025000" &&
    b.session.state === "simulationApproved" &&
    b.session.flags.executionAuthorization === false &&
    b.session.flags.paymentExecutionAuthorization === false &&
    b.liveExecutionPermission === false &&
    b.livePaymentPermission === false &&
    b.job.flags.paidVerified === false;
  if (bOk) passed += 1;
  else failed += 1;
  lines.push(
    scenarioPass(
      "B synthetic compatible + simulationApprove",
      bOk,
      `quote=${b.quote.status} usdc=${b.quote.amount.displayUsdc} approval=${b.session.state} execAuth=${b.session.flags.executionAuthorization}`,
    ),
  );
  lines.push(`       ${QUOTE_APPROVAL_BANNER}`);

  // C
  const c = runScenarioCIncompatibleBlock(createdAt);
  const cOk =
    c.quote.status === "policyIncompatible" &&
    c.job.status === "blocked" &&
    c.job.payment.status === "policyIncompatible" &&
    c.job.flags.paidVerified === false;
  if (cOk) passed += 1;
  else failed += 1;
  lines.push(
    scenarioPass(
      "C incompatible 402 blocked",
      cOk,
      `quote=${c.quote.status} job=${c.job.status} payment=${c.job.payment.status}`,
    ),
  );
  lines.push(`       ${QUOTE_APPROVAL_BANNER}`);

  // D
  const d = runScenarioDSubstitutionReplayFailClosed(createdAt);
  const dOk =
    d.substitutionBlocked &&
    d.replayBlocked &&
    d.notes.some((n) => n.includes("substitution ok=false")) &&
    d.notes.some((n) => n.includes("replay ok=false"));
  if (dOk) passed += 1;
  else failed += 1;
  lines.push(
    scenarioPass(
      "D substitution/replay fail-closed",
      dOk,
      d.notes.filter((n) => n.startsWith("substitution") || n.startsWith("replay")).join("; "),
    ),
  );
  lines.push(`       ${QUOTE_APPROVAL_BANNER}`);

  // E
  const e = runScenarioERejectRevokeExpire(createdAt);
  const eOk =
    e.rejected.session.state === "simulationRejected" &&
    e.revoked.state === "revoked" &&
    e.expired.state === "expired";
  if (eOk) passed += 1;
  else failed += 1;
  lines.push(
    scenarioPass(
      "E reject/revoke/expire",
      eOk,
      `rejected=${e.rejected.session.state} revoked=${e.revoked.state} expired=${e.expired.state}`,
    ),
  );
  lines.push(`       ${QUOTE_APPROVAL_BANNER}`);

  const ok = failed === 0 && passed === 5 && plan.proposals.length === 0;
  lines.push("");
  lines.push(
    ok
      ? `Demo OK — ${passed}/5 scenarios; QuantJourney proposals=${plan.proposals.length}; zero network`
      : `Demo FAILED — passed=${passed} failed=${failed} proposals=${plan.proposals.length}`,
  );

  const determinismKey = [
    a.quote.quoteId,
    b.quote.quoteId,
    b.session.fingerprint,
    c.quote.quoteId,
    String(plan.proposals.length),
    e.rejected.session.state,
    e.revoked.state,
    e.expired.state,
  ].join("|");

  return {
    mode: "STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_SERVICE_EXECUTION",
    banner: QUOTE_APPROVAL_BANNER,
    proposalCount: plan.proposals.length,
    scenariosPassed: passed,
    scenariosFailed: failed,
    lines,
    ok,
    determinismKey,
  };
}

export function formatDemoHireJobQuoteOffline(
  report: DemoHireJobQuoteOfflineReport = runDemoHireJobQuoteOffline(),
): string {
  return report.lines.join("\n");
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === new URL(entry, "file://").href;
  } catch {
    return entry
      .replace(/\\/g, "/")
      .endsWith("/src/scripts/demo-hirejob-quote-offline.ts");
  }
}

if (isMainModule()) {
  const report = runDemoHireJobQuoteOffline();
  console.log(formatDemoHireJobQuoteOffline(report));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

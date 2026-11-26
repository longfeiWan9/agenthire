/**
 * CLI: inspect allowlisted unsigned x402 discovery endpoints (D4.3c).
 *
 * Usage:
 *   pnpm inspect:x402-discovery                 # dry-run (zero network)
 *   pnpm inspect:x402-discovery --approved-live # one approved live batch
 *
 * No arbitrary URL/method/body CLI overrides.
 * Mode: READ_ONLY / NO_SIGNING / NO_PAYMENT / TWO_APPROVED_GET_TARGETS_ONLY
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_X402_DISCOVERY_TARGETS,
  listApprovedX402DiscoveryTargets,
} from "../providers/x402-discovery-allowlist.ts";
import {
  X402_DISCOVERY_INSPECTION_MODE,
  X402_SPEC_REVISIONS,
  countSuccessfulX402DiscoveryReads,
  inspectX402DiscoveryBatch,
  type X402DiscoveryInspectionBatch,
  type X402DiscoveryInspectionEvidence,
  type X402DiscoveryRunMode,
} from "../providers/x402-discovery-inspection.ts";

function parseArgs(argv: readonly string[]): {
  readonly runMode: X402DiscoveryRunMode;
  readonly writeEvidence: boolean;
} {
  const args = argv.slice(2);
  let approvedLive = false;
  for (const arg of args) {
    if (arg === "--approved-live") {
      approvedLive = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage:",
          "  pnpm inspect:x402-discovery                 dry-run (zero network)",
          "  pnpm inspect:x402-discovery --approved-live one approved live batch",
          "",
          "No arbitrary URL arguments. Exact XDISC-001/002 only.",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    if (arg.startsWith("http://") || arg.startsWith("https://")) {
      throw new Error(
        `Arbitrary URL arguments are not allowed (got ${arg}). Use the immutable XDISC-001/002 allowlist only.`,
      );
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    throw new Error(
      `Unexpected argument: ${arg}. No positional URLs or ids are accepted.`,
    );
  }
  return {
    runMode: approvedLive ? "approved-live" : "dry-run",
    writeEvidence: approvedLive,
  };
}

function formatEvidence(e: X402DiscoveryInspectionEvidence): string {
  const lines = [
    `## ${e.discoveryId} — ${e.provider}`,
    `- priorProposalId: ${e.priorProposalId}`,
    `- approvedUrl: ${e.approvedUrl}`,
    `- runMode: ${e.runMode}`,
    `- status: ${e.status}`,
    `- observedAt: ${e.observedAt}`,
    `- httpStatus: ${e.httpStatus ?? "n/a"}`,
    `- contentType: ${e.contentType ?? "n/a"}`,
    `- contentSha256: ${e.contentSha256 ?? "n/a"}`,
    `- byteLength: ${e.byteLength ?? "n/a"}`,
    `- pinnedAddress: ${e.pinnedAddress ?? "n/a"}`,
    `- elapsedMs: ${e.elapsedMs ?? "n/a"}`,
    `- paymentRequiredObserved: ${e.paymentRequiredObserved}`,
    `- paymentRequiredHeaderPresent: ${e.paymentRequiredHeaderPresent}`,
    `- layers.transport: ${e.layers.transport}`,
    `- layers.documentRecognition: ${e.layers.documentRecognition}`,
    `- layers.x402Parse: ${e.layers.x402Parse}`,
    `- layers.sepoliaPolicy: ${e.layers.sepoliaPolicy}`,
    `- mvpTaskBound: ${e.mvpTaskBound}`,
  ];
  if (e.redirectLocation) {
    lines.push(`- redirectLocation: ${e.redirectLocation}`);
  }
  if (e.error) {
    lines.push(`- error: ${e.error}`);
    if (e.errorClass) lines.push(`- errorClass: ${e.errorClass}`);
  }
  if (e.documentSummary) {
    lines.push(
      `- document.recognitionKind: ${e.documentSummary.recognitionKind}`,
      `- document.x402Version: ${e.documentSummary.x402Version ?? "n/a"}`,
      `- document.kind: ${e.documentSummary.kind ?? "n/a"}`,
      `- document.name: ${e.documentSummary.name ?? "n/a"}`,
      `- document.advertisedResourceCount: ${e.documentSummary.advertisedResourceCount}`,
      `- document.facilitatorBaseUrl: ${e.documentSummary.facilitatorBaseUrl ?? "n/a"}`,
      `- document.notes: ${e.documentSummary.notes}`,
    );
  }
  if (e.challengeParse) {
    if (e.challengeParse.ok) {
      lines.push(
        `- challengeParse: ok (accepts=${e.challengeParse.challenge.accepts.length}, source=${e.challengeParse.challenge.source})`,
      );
    } else {
      lines.push(
        `- challengeParse: failed (${e.challengeParse.reason}) — ${e.challengeParse.message}`,
      );
    }
  }
  if (e.offerPolicy) {
    lines.push(
      `- offerPolicy.parseOk: ${e.offerPolicy.parseOk}`,
      `- offerPolicy.anyStructurallyCompatible: ${e.offerPolicy.anyStructurallyCompatible}`,
      `- offerPolicy.anyPolicyPass: ${e.offerPolicy.anyPolicyPass}`,
      `- offerPolicy.notes: ${e.offerPolicy.notes}`,
    );
  }
  return lines.join("\n");
}

function formatMarkdownReport(batch: X402DiscoveryInspectionBatch): string {
  const rows = batch.evidences
    .map((e) => {
      const recog = e.documentSummary?.recognitionKind ?? "—";
      const parse =
        e.challengeParse == null
          ? "—"
          : e.challengeParse.ok
            ? "ok"
            : e.challengeParse.reason;
      const policy = e.layers.sepoliaPolicy;
      return `| ${e.discoveryId} | ${e.provider} | ${e.status} | \`${e.approvedUrl}\` | ${e.httpStatus ?? "—"} | ${e.contentSha256?.slice(0, 12) ?? "—"}… | ${recog} | ${parse} | ${policy} | ${e.error ?? ""} |`;
    })
    .join("\n");

  return [
    "# AgentHire D4.3c — Live Unsigned x402 Discovery Inspection",
    "",
    `Mode: **${X402_DISCOVERY_INSPECTION_MODE}**`,
    `Run: \`${batch.runMode}\` · source: \`${batch.source}\` · captured: \`${batch.capturedAt}\``,
    `Successful document observations: **${batch.successCount}/${batch.targetCount}**; paymentRequired: **${batch.paymentRequiredCount}**.`,
    `MVP task: \`${batch.mvpTaskId}\` — never bound from discovery alone.`,
    "",
    "## Spec revisions consulted (research ≠ permission)",
    "",
    `- x402 specification v2: ${X402_SPEC_REVISIONS.specificationV2Url}`,
    `- HTTP transport v2: ${X402_SPEC_REVISIONS.httpTransportV2Url}`,
    `- Upstream repo HEAD at research time: \`${X402_SPEC_REVISIONS.repositoryHeadCommit}\``,
    "",
    "## Authorized destinations (exactly two)",
    "",
    "| ID | Provider | URL | Prior proposal |",
    "| --- | --- | --- | --- |",
    ...APPROVED_X402_DISCOVERY_TARGETS.map(
      (t) =>
        `| ${t.id} | ${t.provider} | \`${t.url}\` | ${t.priorProposalId} |`,
    ),
    "",
    "## HTTP / layer results",
    "",
    "| ID | Provider | Status | URL | HTTP | sha256 prefix | Document | x402 parse | Dual-network policy | Error |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    rows,
    "",
    "## Discovery / protocol / task",
    "",
    "- Layers kept separate: transport · document recognition · x402 parse · dual-network payment policy.",
    "- Manifest JSON = claims only; advertised resources / facilitator endpoints were **not** fetched.",
    "- PAYMENT-REQUIRED validated against verified v2 HTTP transport (header canonical).",
    "- Mainnet ≠ Sepolia. No payment approval. No signing. No PAYMENT-SIGNATURE sent.",
    `- Explicit MVP skill \`${batch.mvpTaskId}\` is **not** established by these discovery GETs.`,
    "",
    "## Security",
    "",
    "- Exact two GET destinations; no retries; 0 redirects; ≤10s; ≤256 KiB; concurrency ≤2.",
    "- TLS verify + SNI; public DNS/IP pin; no creds/cookies/body.",
    "- Never contacted: Agent Zero `/v1/intel`, Agent402 `/openapi.json`, MCP, facilitators, RPC, D4.3a retries.",
    "- No historical catalog B4 flips (`endpointReachable` / `challengeVerified` / `paymentCompatible` / `paidVerified`).",
    "",
    "## Unapproved next candidates",
    "",
    "- PSI-003 OpenAPI size-cap raise remains **unauthorized**.",
    "- Any advertised resource URL from manifests remains **unapproved**.",
    "- Signing / facilitators / payment settlement remain **forbidden**.",
    "",
    "## Viability",
    "",
    "See executive summary above and Project-store A–H report. Discovery observations alone do not authorize payment or task execution.",
    "",
    "Evidence JSON: `docs/day4/evidence/x402-discovery-inspection.json`.",
    "",
  ].join("\n");
}

export async function runInspectX402Discovery(options?: {
  readonly argv?: readonly string[];
  readonly repoRoot?: string;
  readonly writeEvidencePath?: string | null;
  readonly writeMarkdownPath?: string | null;
  readonly now?: () => Date;
}): Promise<{
  readonly batch: X402DiscoveryInspectionBatch;
  readonly successCount: number;
  readonly ok: boolean;
  readonly report: string;
  readonly markdown: string;
  readonly runMode: X402DiscoveryRunMode;
}> {
  const parsed = parseArgs(options?.argv ?? process.argv);
  const now = options?.now ?? (() => new Date());
  const observedAt = now().toISOString();
  const targets = listApprovedX402DiscoveryTargets();

  const batch = await inspectX402DiscoveryBatch({
    runMode: parsed.runMode,
    observedAt,
    targets,
  });

  const successCount = countSuccessfulX402DiscoveryReads(batch.evidences);
  // Live: success if we completed both targets without fatal CLI error.
  // paymentRequired is a valid observation, not a transport failure.
  const observedCount = batch.evidences.filter(
    (e) => e.status !== "planned",
  ).length;
  const ok =
    parsed.runMode === "dry-run"
      ? batch.evidences.length === targets.length
      : observedCount === targets.length;

  const header = [
    "# AgentHire x402 discovery inspection (D4.3c)",
    `Mode: ${X402_DISCOVERY_INSPECTION_MODE}`,
    `runMode: ${batch.runMode}`,
    `schemaVersion: ${batch.schemaVersion}`,
    `targets: ${batch.targetCount}`,
    `successfulDocumentObservations: ${successCount}`,
    `paymentRequiredObservations: ${batch.paymentRequiredCount}`,
    `overall: ${ok ? "PASS" : "FAIL"}`,
    "",
  ].join("\n");

  const body = batch.evidences.map(formatEvidence).join("\n\n");
  const report = `${header}${body}\n`;
  const markdown = formatMarkdownReport(batch);

  if (parsed.writeEvidence || options?.writeEvidencePath) {
    const repoRoot =
      options?.repoRoot ??
      join(dirname(fileURLToPath(import.meta.url)), "../..");
    const evidencePath =
      options?.writeEvidencePath ??
      join(repoRoot, "docs/day4/evidence/x402-discovery-inspection.json");
    const markdownPath =
      options?.writeMarkdownPath ??
      join(repoRoot, "docs/day4/x402-discovery-live-report.md");

    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(
      evidencePath,
      `${JSON.stringify(batch, null, 2)}\n`,
      "utf8",
    );
    mkdirSync(dirname(markdownPath), { recursive: true });
    writeFileSync(markdownPath, `${markdown}\n`, "utf8");
  }

  return {
    batch,
    successCount,
    ok,
    report,
    markdown,
    runMode: parsed.runMode,
  };
}

async function main(): Promise<void> {
  const { ok, report, runMode } = await runInspectX402Discovery();
  process.stdout.write(report);
  process.exitCode = ok || runMode === "dry-run" ? 0 : 1;
}

const isDirectRun =
  process.argv[1] != null &&
  (process.argv[1].endsWith("inspect-x402-discovery.ts") ||
    process.argv[1].endsWith("inspect-x402-discovery.js"));

if (isDirectRun) {
  main().catch((error) => {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    process.stderr.write(`inspect-x402-discovery fatal: ${message}\n`);
    process.exitCode = 1;
  });
}

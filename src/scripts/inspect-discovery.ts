/**
 * CLI: inspect allowlisted agent discovery documents (D4.3a).
 *
 * Usage:
 *   pnpm inspect:discovery                 # dry-run (zero network)
 *   pnpm inspect:discovery --approved-live # one approved live batch
 *
 * No arbitrary URL args. No general --execute probe.
 * Mode: READ_ONLY / NO_SIGNING / APPROVED_DISCOVERY_GET_ONLY
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_DISCOVERY_TARGETS,
  listApprovedDiscoveryTargets,
} from "../providers/discovery-allowlist.ts";
import {
  DISCOVERY_INSPECTION_MODE,
  countSuccessfulDiscoveryReads,
  inspectDiscoveryBatch,
  type DiscoveryInspectionBatch,
  type DiscoveryInspectionEvidence,
  type DiscoveryRunMode,
} from "../providers/discovery-inspection.ts";

function parseArgs(argv: readonly string[]): {
  readonly runMode: DiscoveryRunMode;
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
          "  pnpm inspect:discovery                 dry-run (zero network)",
          "  pnpm inspect:discovery --approved-live one approved live batch",
          "",
          "No arbitrary URL arguments. Exact DISC-001..004 only.",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    // Reject anything that looks like a URL or unknown flag / positional.
    if (arg.startsWith("http://") || arg.startsWith("https://")) {
      throw new Error(
        `Arbitrary URL arguments are not allowed (got ${arg}). Use the immutable DISC-001..004 allowlist only.`,
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

function formatEvidence(e: DiscoveryInspectionEvidence): string {
  const compat = e.documentationCompatibility;
  const lines = [
    `## ${e.discoveryId} — ${e.provider}`,
    `- approvedUrl: ${e.approvedUrl}`,
    `- documentKind: ${e.documentKind}`,
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
  ];
  if (e.redirectLocation) {
    lines.push(`- redirectLocation: ${e.redirectLocation}`);
  }
  if (e.error) {
    lines.push(`- error: ${e.error}`);
    if (e.errorClass) lines.push(`- errorClass: ${e.errorClass}`);
  }
  if (e.documentSummary?.kind === "agent-card") {
    lines.push(
      `- agent-card.name: ${e.documentSummary.name ?? "n/a"}`,
      `- agent-card.skillCount: ${e.documentSummary.skillCount}`,
      `- agent-card.skillIds: ${e.documentSummary.skillIds.join(", ") || "(none)"}`,
    );
  }
  if (e.documentSummary?.kind === "openapi") {
    lines.push(
      `- openapi: ${e.documentSummary.openapi ?? "n/a"}`,
      `- openapi.title: ${e.documentSummary.title ?? "n/a"}`,
      `- openapi.pathCount: ${e.documentSummary.pathCount}`,
      `- openapi.operations: ${e.documentSummary.operations.length}`,
      `- openapi.unresolvedRefCount: ${e.documentSummary.unresolvedRefCount}`,
    );
  }
  if (compat) {
    lines.push(
      `- documentationCompatibility.explicitSkillMatch: ${compat.explicitSkillMatch}`,
      `- documentationCompatibility.relatedHints: ${compat.relatedHints.join(", ") || "(none)"}`,
      `- documentationCompatibility.notes: ${compat.notes}`,
    );
  }
  return lines.join("\n");
}

function formatMarkdownReport(batch: DiscoveryInspectionBatch): string {
  const rows = batch.evidences
    .map((e) => {
      const skillOrOps =
        e.documentSummary?.kind === "agent-card"
          ? `${e.documentSummary.skillCount} skills`
          : e.documentSummary?.kind === "openapi"
            ? `${e.documentSummary.operations.length} ops / ${e.documentSummary.pathCount} paths`
            : "—";
      return `| ${e.discoveryId} | ${e.provider} | ${e.status} | \`${e.approvedUrl}\` | ${e.httpStatus ?? "—"} | ${e.contentSha256?.slice(0, 12) ?? "—"}… | ${skillOrOps} | ${e.error ?? ""} |`;
    })
    .join("\n");

  return [
    "# AgentHire D4.3a — Discovery Document Inspection",
    "",
    `Mode: **${DISCOVERY_INSPECTION_MODE}**`,
    `Run: \`${batch.runMode}\` · source: \`${batch.source}\` · captured: \`${batch.capturedAt}\``,
    `Successful document parses: **${batch.successCount}/${batch.targetCount}**.`,
    "",
    "## Authorized destinations",
    "",
    "| ID | Provider | URL | Kind |",
    "| --- | --- | --- | --- |",
    ...APPROVED_DISCOVERY_TARGETS.map(
      (t) => `| ${t.id} | ${t.provider} | \`${t.url}\` | ${t.documentKind} |`,
    ),
    "",
    "## Results",
    "",
    "| ID | Provider | Status | URL | HTTP | sha256 prefix | Summary | Error |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    rows,
    "",
    "Evidence JSON: `docs/day4/evidence/discovery-inspection.json`.",
    "",
    "## Guardrails",
    "",
    "- Exact four GET destinations only; no `.well-known/x402`, `/v1/intel`, or discovered OpenAPI ops.",
    "- Documents treated as untrusted data; `$ref` / links not fetched.",
    "- DocumentationCompatibility only — no B4 milestone upgrades from docs alone.",
    "- HTTP 402 recorded sanitized (no PAYMENT-SIGNATURE / x402 verification).",
    "- D4.3b execution remains unapproved.",
    "",
  ].join("\n");
}

export async function runInspectDiscovery(options?: {
  readonly argv?: readonly string[];
  readonly repoRoot?: string;
  readonly writeEvidencePath?: string | null;
  readonly writeMarkdownPath?: string | null;
  readonly now?: () => Date;
}): Promise<{
  readonly batch: DiscoveryInspectionBatch;
  readonly successCount: number;
  readonly ok: boolean;
  readonly report: string;
  readonly markdown: string;
  readonly runMode: DiscoveryRunMode;
}> {
  const parsed = parseArgs(options?.argv ?? process.argv);
  const now = options?.now ?? (() => new Date());
  const observedAt = now().toISOString();
  const targets = listApprovedDiscoveryTargets();

  const batch = await inspectDiscoveryBatch({
    runMode: parsed.runMode,
    observedAt,
    targets,
  });

  const successCount = countSuccessfulDiscoveryReads(batch.evidences);
  const ok =
    parsed.runMode === "dry-run"
      ? batch.evidences.length === targets.length
      : successCount > 0;

  const header = [
    "# AgentHire discovery inspection (D4.3a)",
    `Mode: ${DISCOVERY_INSPECTION_MODE}`,
    `runMode: ${batch.runMode}`,
    `schemaVersion: ${batch.schemaVersion}`,
    `targets: ${batch.targetCount}`,
    `successfulDocumentParses: ${successCount}`,
    `overall: ${ok ? "PASS" : parsed.runMode === "dry-run" ? "PASS" : "FAIL"}`,
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
      join(repoRoot, "docs/day4/evidence/discovery-inspection.json");
    const markdownPath =
      options?.writeMarkdownPath ??
      join(repoRoot, "docs/day4/discovery-inspection-report.md");

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
  const { ok, report, runMode } = await runInspectDiscovery();
  process.stdout.write(report);
  // Dry-run always exits 0 when plan enumerates four targets.
  // Live exits nonzero only if zero successful document parses.
  process.exitCode = ok || runMode === "dry-run" ? 0 : 1;
}

const isDirectRun =
  process.argv[1] != null &&
  (process.argv[1].endsWith("inspect-discovery.ts") ||
    process.argv[1].endsWith("inspect-discovery.js"));

if (isDirectRun) {
  main().catch((error) => {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    process.stderr.write(`inspect-discovery fatal: ${message}\n`);
    process.exitCode = 1;
  });
}

/**
 * CLI: recover full Agent402 resource catalog (D4.4b / CATALOG-001).
 *
 * Usage:
 *   pnpm recover:agent402-catalog                 # dry-run (zero network)
 *   pnpm recover:agent402-catalog --approved-live # one approved live GET
 *
 * Single-use attempt marker is written BEFORE network I/O on --approved-live.
 * Existing marker blocks re-run. No force-reset. No arbitrary URL args.
 *
 * Mode: READ_ONLY / NO_SIGNING / NO_PAYMENT / ONE_APPROVED_DISCOVERY_GET_ONLY
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATALOG_001_APPROVED_URL,
  CATALOG_001_ATTEMPT_MARKER_REL,
  CATALOG_001_REQUEST_ID,
  CATALOG_RECOVERY_MODE,
  D43C_AGENT402_CONTENT_SHA256,
  analyzeRecoveredAgent402Catalog,
  recoverAgent402Catalog,
  renderFullCatalogAnalysisMarkdown,
  sha256Text,
  stableStringify,
  type CatalogRecoveryRunMode,
} from "../providers/agent402-catalog-recovery.ts";

function parseArgs(argv: readonly string[]): {
  readonly runMode: CatalogRecoveryRunMode;
  readonly writeArtifacts: boolean;
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
          "  pnpm recover:agent402-catalog                 dry-run (zero network)",
          "  pnpm recover:agent402-catalog --approved-live one approved live GET",
          "",
          `Exact allowlist: ${CATALOG_001_REQUEST_ID} → ${CATALOG_001_APPROVED_URL}`,
          `Single-use marker: ${CATALOG_001_ATTEMPT_MARKER_REL}`,
          "No arbitrary URL arguments. No force-reset.",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    if (arg === "--force" || arg === "--reset" || arg === "--force-retry") {
      throw new Error(
        `Rejected "${arg}": CATALOG-001 has no auto-reset / force-retry. ` +
          `Remove the attempt marker only via explicit out-of-band human action.`,
      );
    }
    if (arg.startsWith("http://") || arg.startsWith("https://")) {
      throw new Error(
        `Arbitrary URL arguments are not allowed (got ${arg}). Use CATALOG-001 allowlist only.`,
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
    writeArtifacts: approvedLive,
  };
}

export async function runRecoverAgent402Catalog(options?: {
  readonly argv?: readonly string[];
  readonly repoRoot?: string;
  readonly observedAt?: string;
  readonly markerPath?: string;
  readonly rawTempDir?: string;
  readonly skipMarkerWrite?: boolean;
  readonly writeArtifacts?: boolean;
}): Promise<{
  readonly ok: boolean;
  readonly runMode: CatalogRecoveryRunMode;
  readonly status: string;
  readonly coverage: string;
  readonly retained: number;
  readonly shaMatch: boolean | null;
  readonly catalogPath: string | null;
  readonly analysisPath: string | null;
  readonly shortlistPath: string | null;
  readonly markdownPath: string | null;
  readonly markerPath: string;
  readonly report: string;
  readonly error?: string;
}> {
  const repoRoot =
    options?.repoRoot ??
    join(dirname(fileURLToPath(import.meta.url)), "../..");
  const parsed = parseArgs(options?.argv ?? process.argv);
  const writeArtifacts = options?.writeArtifacts ?? parsed.writeArtifacts;

  const catalog = await recoverAgent402Catalog({
    runMode: parsed.runMode,
    observedAt: options?.observedAt,
    repoRoot,
    markerPath: options?.markerPath,
    rawTempDir: options?.rawTempDir,
    skipMarkerWrite: options?.skipMarkerWrite,
  });

  const lines = [
    "# AgentHire Agent402 catalog recovery (D4.4b)",
    `Mode: ${CATALOG_RECOVERY_MODE}`,
    `requestId: ${CATALOG_001_REQUEST_ID}`,
    `runMode: ${catalog.runMode}`,
    `status: ${catalog.status}`,
    `approvedUrl: ${catalog.approvedUrl}`,
    `httpStatus: ${catalog.summary.httpStatus ?? "n/a"}`,
    `rawResponseBytes: ${catalog.summary.rawResponseBytes ?? "n/a"}`,
    `rawResponseSha256: ${catalog.summary.rawResponseSha256 ?? "n/a"}`,
    `priorD43cSha256: ${D43C_AGENT402_CONTENT_SHA256}`,
    `matchesPreviousResponseHash: ${catalog.summary.matchesPreviousResponseHash}`,
    `advertisedResourceCount: ${catalog.summary.advertisedResourceCount ?? "n/a"}`,
    `parsedResourceCount: ${catalog.summary.parsedResourceCount}`,
    `normalizedResourceCount: ${catalog.summary.normalizedResourceCount}`,
    `safelyRetainedResourceCount: ${catalog.summary.safelyRetainedResourceCount}`,
    `omittedResourceCount: ${catalog.summary.omittedResourceCount}`,
    `parseFailureCount: ${catalog.summary.parseFailureCount}`,
    `coverage: ${catalog.summary.coverage}`,
    `attemptMarkerPath: ${catalog.attemptMarkerPath}`,
    `rawBodyCommitted: false`,
    `mvpTaskBound: false`,
  ];
  if (catalog.error) {
    lines.push(`error: ${catalog.error}`);
    if (catalog.errorClass) lines.push(`errorClass: ${catalog.errorClass}`);
  }

  let catalogPath: string | null = null;
  let analysisPath: string | null = null;
  let shortlistPath: string | null = null;
  let markdownPath: string | null = null;

  // Only persist on successful recovery — never overwrite good evidence
  // with an attemptBlocked / transport-failure shell document.
  if (
    writeArtifacts &&
    catalog.runMode === "approved-live" &&
    catalog.status === "success"
  ) {
    const evidenceDir = join(repoRoot, "docs/day4/evidence");
    mkdirSync(evidenceDir, { recursive: true });
    mkdirSync(join(repoRoot, "docs/day4"), { recursive: true });

    catalogPath = join(evidenceDir, "agent402-full-resource-catalog.json");
    analysisPath = join(evidenceDir, "agent402-full-catalog-analysis.json");
    shortlistPath = join(evidenceDir, "full-catalog-resource-shortlist.json");
    markdownPath = join(repoRoot, "docs/day4/agent402-full-catalog-analysis.md");

    const catalogRel = "docs/day4/evidence/agent402-full-resource-catalog.json";
    const { analysis, shortlist } = analyzeRecoveredAgent402Catalog(
      catalog,
      catalogRel,
    );
    const markdown = renderFullCatalogAnalysisMarkdown(analysis, catalog);

    const catalogJson = stableStringify(catalog);
    const analysisJson = stableStringify(analysis);
    const shortlistJson = stableStringify(shortlist);

    // Dual-build byte identity for analysis/shortlist.
    const again = analyzeRecoveredAgent402Catalog(catalog, catalogRel);
    if (
      stableStringify(again.analysis) !== analysisJson ||
      stableStringify(again.shortlist) !== shortlistJson
    ) {
      throw new Error("Full catalog analysis is not deterministic across dual build");
    }

    writeFileSync(catalogPath, catalogJson, "utf8");
    writeFileSync(analysisPath, analysisJson, "utf8");
    writeFileSync(shortlistPath, shortlistJson, "utf8");
    writeFileSync(markdownPath, markdown, "utf8");

    lines.push(
      `catalogPath: ${catalogPath}`,
      `catalogSha256: ${sha256Text(catalogJson)}`,
      `analysisPath: ${analysisPath}`,
      `analysisSha256: ${sha256Text(analysisJson)}`,
      `shortlistPath: ${shortlistPath}`,
      `shortlistSha256: ${sha256Text(shortlistJson)}`,
      `markdownPath: ${markdownPath}`,
    );
  }

  const ok =
    parsed.runMode === "dry-run"
      ? catalog.status === "planned"
      : catalog.status === "success";

  lines.push(`overall: ${ok ? "PASS" : "FAIL"}`, "");
  const report = `${lines.join("\n")}`;

  return {
    ok,
    runMode: catalog.runMode,
    status: catalog.status,
    coverage: catalog.summary.coverage,
    retained: catalog.summary.safelyRetainedResourceCount,
    shaMatch: catalog.summary.matchesPreviousResponseHash,
    catalogPath,
    analysisPath,
    shortlistPath,
    markdownPath,
    markerPath: catalog.attemptMarkerPath,
    report,
    error: catalog.error ?? undefined,
  };
}

/**
 * Offline analysis of an already-recovered catalog artifact.
 * Zero network. Optional companion to recover:agent402-catalog.
 */
export async function runAnalyzeAgent402Catalog(options?: {
  readonly repoRoot?: string;
  readonly argv?: readonly string[];
}): Promise<{
  readonly ok: boolean;
  readonly analysisSha256: string;
  readonly shortlistSha256: string;
  readonly error?: string;
}> {
  const argv = options?.argv ?? process.argv;
  for (const arg of argv.slice(2)) {
    if (
      arg === "--live" ||
      arg === "--fetch" ||
      arg === "--probe" ||
      arg === "--execute" ||
      arg === "--approved-live" ||
      arg.startsWith("--live")
    ) {
      return {
        ok: false,
        analysisSha256: "",
        shortlistSha256: "",
        error: `Rejected network/execution flag "${arg}". analyze:agent402-catalog is offline.`,
      };
    }
  }

  const repoRoot =
    options?.repoRoot ??
    join(dirname(fileURLToPath(import.meta.url)), "../..");
  const { readFileSync } = await import("node:fs");
  const catalogRel = "docs/day4/evidence/agent402-full-resource-catalog.json";
  const catalogPath = join(repoRoot, catalogRel);
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const { analysis, shortlist } = analyzeRecoveredAgent402Catalog(
    catalog,
    catalogRel,
  );
  const analysisJson = stableStringify(analysis);
  const shortlistJson = stableStringify(shortlist);
  const again = analyzeRecoveredAgent402Catalog(catalog, catalogRel);
  if (
    stableStringify(again.analysis) !== analysisJson ||
    stableStringify(again.shortlist) !== shortlistJson
  ) {
    throw new Error("analyze:agent402-catalog not deterministic");
  }

  const evidenceDir = join(repoRoot, "docs/day4/evidence");
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    join(evidenceDir, "agent402-full-catalog-analysis.json"),
    analysisJson,
    "utf8",
  );
  writeFileSync(
    join(evidenceDir, "full-catalog-resource-shortlist.json"),
    shortlistJson,
    "utf8",
  );
  writeFileSync(
    join(repoRoot, "docs/day4/agent402-full-catalog-analysis.md"),
    renderFullCatalogAnalysisMarkdown(analysis, catalog),
    "utf8",
  );

  return {
    ok: true,
    analysisSha256: sha256Text(analysisJson),
    shortlistSha256: sha256Text(shortlistJson),
  };
}

async function main(): Promise<void> {
  const isAnalyze =
    process.argv[1] != null &&
    (process.argv[1].endsWith("analyze-agent402-catalog.ts") ||
      process.argv[1].endsWith("analyze-agent402-catalog.js"));

  if (isAnalyze) {
    const result = await runAnalyzeAgent402Catalog();
    if (!result.ok) {
      process.stderr.write(`${result.error}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      [
        "analyze:agent402-catalog — offline",
        `analysisSha256: ${result.analysisSha256}`,
        `shortlistSha256: ${result.shortlistSha256}`,
        "",
      ].join("\n"),
    );
    return;
  }

  const result = await runRecoverAgent402Catalog();
  process.stdout.write(result.report);
  process.exitCode = result.ok || result.runMode === "dry-run" ? 0 : 1;
}

const isDirect =
  process.argv[1] != null &&
  (process.argv[1].endsWith("recover-agent402-catalog.ts") ||
    process.argv[1].endsWith("recover-agent402-catalog.js") ||
    process.argv[1].endsWith("analyze-agent402-catalog.ts") ||
    process.argv[1].endsWith("analyze-agent402-catalog.js"));

if (isDirect) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`recover-agent402-catalog fatal: ${message}\n`);
    process.exitCode = 1;
  });
}

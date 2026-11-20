/**
 * CLI: offline advertised x402 resource-catalog analysis (D4.4).
 *
 * Usage:
 *   pnpm analyze:resources
 *
 * STRICTLY_OFFLINE — rejects --live / --fetch / --probe / --execute.
 * Reads local D4.3c discovery evidence only. No DNS / HTTP / RPC.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeResourceCatalog,
  buildShortlistDocument,
  loadCatalogSourcesFromDiscoveryEvidence,
  renderResourceCatalogMarkdown,
  sha256Hex,
  stableStringify,
} from "../providers/resource-analysis.ts";

const FORBIDDEN_FLAGS = new Set([
  "--live",
  "--fetch",
  "--probe",
  "--execute",
  "--approved-live",
  "--network",
]);

export function parseAnalyzeResourcesArgs(argv: readonly string[]): {
  readonly ok: true;
} | {
  readonly ok: false;
  readonly message: string;
} {
  const args = argv.slice(2);
  for (const arg of args) {
    if (FORBIDDEN_FLAGS.has(arg) || arg.startsWith("--live")) {
      return {
        ok: false,
        message: `Rejected network/execution flag "${arg}". analyze:resources is STRICTLY_OFFLINE.`,
      };
    }
    if (arg === "--help" || arg === "-h") {
      return {
        ok: false,
        message: [
          "Usage: pnpm analyze:resources",
          "Offline only. Rejects --live/--fetch/--probe/--execute.",
        ].join("\n"),
      };
    }
    if (arg.startsWith("-")) {
      return {
        ok: false,
        message: `Unknown flag "${arg}". Usage: pnpm analyze:resources`,
      };
    }
  }
  return { ok: true };
}

export async function runAnalyzeResources(options?: {
  readonly repoRoot?: string;
  readonly argv?: readonly string[];
}): Promise<{
  readonly ok: boolean;
  readonly coverage: string;
  readonly reported: number;
  readonly recoverable: number;
  readonly shortlist: number;
  readonly analysisSha256: string;
  readonly shortlistSha256: string;
  readonly analysisPath: string;
  readonly shortlistPath: string;
  readonly markdownPath: string;
  readonly error?: string;
}> {
  const repoRoot =
    options?.repoRoot ??
    join(dirname(fileURLToPath(import.meta.url)), "../..");
  const argv = options?.argv ?? process.argv;
  const parsed = parseAnalyzeResourcesArgs(argv);
  if (!parsed.ok) {
    return {
      ok: false,
      coverage: "unavailable",
      reported: 0,
      recoverable: 0,
      shortlist: 0,
      analysisSha256: "",
      shortlistSha256: "",
      analysisPath: "",
      shortlistPath: "",
      markdownPath: "",
      error: parsed.message,
    };
  }

  const sourceRel = "docs/day4/evidence/x402-discovery-inspection.json";
  const sourcePath = join(repoRoot, sourceRel);
  const fileJson = readFileSync(sourcePath, "utf8");
  const sources = loadCatalogSourcesFromDiscoveryEvidence(fileJson, sourceRel);
  const analysis = analyzeResourceCatalog(sources);
  const shortlistDoc = buildShortlistDocument(analysis);
  const markdown = renderResourceCatalogMarkdown(analysis);

  const analysisJson = stableStringify(analysis);
  const shortlistJson = stableStringify(shortlistDoc);

  // Dual-run byte identity within the same process (no Date.now()/random).
  const againAnalysis = stableStringify(analyzeResourceCatalog(sources));
  const againShortlist = stableStringify(
    buildShortlistDocument(analyzeResourceCatalog(sources)),
  );
  if (againAnalysis !== analysisJson || againShortlist !== shortlistJson) {
    throw new Error("Resource catalog analysis is not deterministic across dual build");
  }

  const outDir = join(repoRoot, "docs/day4/evidence");
  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(repoRoot, "docs/day4"), { recursive: true });

  const analysisPath = join(outDir, "resource-catalog-analysis.json");
  const shortlistPath = join(outDir, "resource-inspection-shortlist.json");
  const markdownPath = join(repoRoot, "docs/day4/resource-catalog-analysis.md");

  writeFileSync(analysisPath, analysisJson, "utf8");
  writeFileSync(shortlistPath, shortlistJson, "utf8");
  writeFileSync(markdownPath, markdown, "utf8");

  return {
    ok: true,
    coverage: analysis.coverage.coverage,
    reported: analysis.coverage.reportedResourceCount,
    recoverable: analysis.coverage.recoverableResourceCount,
    shortlist: analysis.shortlist.length,
    analysisSha256: sha256Hex(analysisJson),
    shortlistSha256: sha256Hex(shortlistJson),
    analysisPath,
    shortlistPath,
    markdownPath,
  };
}

async function main(): Promise<void> {
  const result = await runAnalyzeResources();
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    [
      "analyze:resources — STRICTLY_OFFLINE",
      `coverage: ${result.coverage}`,
      `reported: ${result.reported}`,
      `recoverable: ${result.recoverable}`,
      `shortlist: ${result.shortlist}`,
      `approvedForNetworkExecutionTrue: 0`,
      `analysis: ${result.analysisPath}`,
      `analysisSha256: ${result.analysisSha256}`,
      `shortlist: ${result.shortlistPath}`,
      `shortlistSha256: ${result.shortlistSha256}`,
      `markdown: ${result.markdownPath}`,
      "",
    ].join("\n"),
  );
}

const isDirect =
  process.argv[1] != null &&
  (process.argv[1].endsWith("analyze-resources.ts") ||
    process.argv[1].endsWith("analyze-resources.js"));

if (isDirect) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`analyze-resources fatal: ${message}\n`);
    process.exitCode = 1;
  });
}

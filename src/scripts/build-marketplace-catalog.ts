/**
 * CLI: offline hybrid marketplace capability catalog (D4.5).
 *
 * Usage: pnpm build:marketplace
 * STRICTLY_OFFLINE — zero DNS / HTTP / RPC / facilitator.
 * Dual-build must be byte-identical.
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMarketplaceCatalog,
  loadMarketplaceEvidence,
} from "../marketplace/catalog.ts";
import {
  assessIntegrationReadiness,
  stableIntegrationJson,
} from "../marketplace/integration-readiness.ts";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function runBuildMarketplaceCatalog(options?: {
  readonly repoRoot?: string;
  readonly snapshotAsOf?: string;
  readonly writeArtifacts?: boolean;
}): Promise<{
  readonly ok: boolean;
  readonly catalogSha256: string;
  readonly categorySummarySha256: string;
  readonly candidatesSha256: string;
  readonly counts: {
    readonly agentProfiles: number;
    readonly capabilities: number;
    readonly skills: number;
    readonly resources: number;
    readonly erc8004Services: number;
    readonly planned: number;
  };
  readonly candidateCount: number;
  readonly report: string;
  readonly error?: string;
}> {
  const repoRoot =
    options?.repoRoot ??
    join(dirname(fileURLToPath(import.meta.url)), "../..");
  const writeArtifacts = options?.writeArtifacts !== false;

  for (const arg of (options as { argv?: string[] } | undefined)?.argv ??
    process.argv.slice(2)) {
    if (
      arg === "--live" ||
      arg === "--fetch" ||
      arg === "--approved-live" ||
      arg === "--probe" ||
      arg.startsWith("--live")
    ) {
      return {
        ok: false,
        catalogSha256: "",
        categorySummarySha256: "",
        candidatesSha256: "",
        counts: {
          agentProfiles: 0,
          capabilities: 0,
          skills: 0,
          resources: 0,
          erc8004Services: 0,
          planned: 0,
        },
        candidateCount: 0,
        report: "",
        error: `Rejected network flag "${arg}". build:marketplace is STRICTLY_OFFLINE.`,
      };
    }
  }

  const evidence = loadMarketplaceEvidence(repoRoot);
  const buildInput = {
    ...evidence,
    ...(options?.snapshotAsOf
      ? { snapshotAsOf: options.snapshotAsOf }
      : {}),
  };

  const first = buildMarketplaceCatalog(buildInput);
  const second = buildMarketplaceCatalog(buildInput);
  if (
    first.catalogJson !== second.catalogJson ||
    first.categorySummaryJson !== second.categorySummaryJson
  ) {
    throw new Error("Marketplace catalog dual-build is not byte-identical");
  }

  const candidates = assessIntegrationReadiness(first.catalog);
  const candidatesJson = stableIntegrationJson(candidates);
  const candidatesAgain = assessIntegrationReadiness(first.catalog);
  if (stableIntegrationJson(candidatesAgain) !== candidatesJson) {
    throw new Error("Integration candidates dual-build is not byte-identical");
  }

  if (writeArtifacts) {
    const evidenceDir = join(repoRoot, "docs/marketplace/evidence");
    const docsDir = join(repoRoot, "docs/marketplace");
    mkdirSync(evidenceDir, { recursive: true });
    mkdirSync(docsDir, { recursive: true });

    writeFileSync(
      join(evidenceDir, "capability-catalog.json"),
      first.catalogJson,
      "utf8",
    );
    writeFileSync(
      join(evidenceDir, "category-summary.json"),
      first.categorySummaryJson,
      "utf8",
    );
    writeFileSync(
      join(evidenceDir, "external-integration-candidates.json"),
      candidatesJson,
      "utf8",
    );
  }

  const lines = [
    "# AgentHire marketplace catalog build (D4.5)",
    "mode: READ_ONLY / NO_SIGNING / NO_PAYMENT / STRICTLY_OFFLINE",
    `snapshotAsOf: ${first.catalog.snapshotAsOf}`,
    `agentProfiles: ${first.catalog.counts.agentProfiles}`,
    `capabilities: ${first.catalog.counts.capabilities}`,
    `skills: ${first.catalog.counts.skills}`,
    `resources: ${first.catalog.counts.resources}`,
    `erc8004Services: ${first.catalog.counts.erc8004Services}`,
    `planned: ${first.catalog.counts.planned}`,
    `b1b2CapabilityId: ${first.catalog.b1b2Reference.capabilityId}`,
    `candidateCount: ${candidates.candidateCount}`,
    `approvedForNetworkExecutionTrue: ${candidates.approvedForNetworkExecutionTrue}`,
    `catalogSha256: ${first.catalogSha256}`,
    `categorySummarySha256: ${first.categorySummarySha256}`,
    `candidatesSha256: ${sha256(candidatesJson)}`,
    "dualBuild: byte-identical",
    "overall: PASS",
    "",
  ];

  return {
    ok: true,
    catalogSha256: first.catalogSha256,
    categorySummarySha256: first.categorySummarySha256,
    candidatesSha256: sha256(candidatesJson),
    counts: {
      agentProfiles: first.catalog.counts.agentProfiles,
      capabilities: first.catalog.counts.capabilities,
      skills: first.catalog.counts.skills,
      resources: first.catalog.counts.resources,
      erc8004Services: first.catalog.counts.erc8004Services,
      planned: first.catalog.counts.planned,
    },
    candidateCount: candidates.candidateCount,
    report: lines.join("\n"),
  };
}

async function main(): Promise<void> {
  const result = await runBuildMarketplaceCatalog();
  if (!result.ok) {
    process.stderr.write(`${result.error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(result.report);
}

const isDirect =
  process.argv[1] != null &&
  (process.argv[1].endsWith("build-marketplace-catalog.ts") ||
    process.argv[1].endsWith("build-marketplace-catalog.js"));

if (isDirect) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`build-marketplace-catalog fatal: ${message}\n`);
    process.exitCode = 1;
  });
}

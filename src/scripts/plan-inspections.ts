/**
 * CLI: offline inspection planning over the Day-3 provider catalog.
 *
 * Usage: pnpm plan:inspections
 *
 * READ_ONLY / NO_SIGNING / NO_NETWORK_INSPECTION — no DNS, no HTTP.
 * Writes a proposal manifest only; approvedForNetworkExecution is always false.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256OfString, stableStringify } from "../providers/catalog.ts";
import { buildInspectionManifest } from "../providers/inspection-policy.ts";
import type { ProviderCatalogDocument } from "../providers/types.ts";

export async function runPlanInspections(options?: {
  readonly repoRoot?: string;
}): Promise<{
  readonly ok: boolean;
  readonly serviceCount: number;
  readonly eligibleForReview: number;
  readonly needsMoreInformation: number;
  readonly rejected: number;
  readonly manifestSha256: string;
  readonly manifestPath: string;
}> {
  const repoRoot =
    options?.repoRoot ??
    join(dirname(fileURLToPath(import.meta.url)), "../..");

  const catalogPath = join(repoRoot, "docs/evidence/provider-catalog.json");
  const catalogJson = readFileSync(catalogPath, "utf8");
  const catalog = JSON.parse(catalogJson) as ProviderCatalogDocument;
  const catalogSha256 = createHash("sha256")
    .update(catalogJson, "utf8")
    .digest("hex");

  const manifest = buildInspectionManifest({
    providers: catalog.providers,
    catalogPath: "docs/evidence/provider-catalog.json",
    catalogSnapshotAsOf: catalog.snapshotAsOf,
    catalogSha256,
  });

  const manifestJson = `${stableStringify(manifest)}\n`;
  const manifestSha256 = sha256OfString(manifestJson);
  const outDir = join(repoRoot, "docs/day4/evidence");
  const manifestPath = join(outDir, "inspection-manifest.json");

  mkdirSync(outDir, { recursive: true });
  writeFileSync(manifestPath, manifestJson, "utf8");

  // Dual-run byte identity check within the same process.
  const again = `${stableStringify(
    buildInspectionManifest({
      providers: catalog.providers,
      catalogPath: "docs/evidence/provider-catalog.json",
      catalogSnapshotAsOf: catalog.snapshotAsOf,
      catalogSha256,
    }),
  )}\n`;
  if (again !== manifestJson) {
    throw new Error("Inspection manifest is not deterministic across dual build");
  }

  return {
    ok: true,
    serviceCount: manifest.summary.serviceCount,
    eligibleForReview: manifest.summary.eligibleForReview,
    needsMoreInformation: manifest.summary.needsMoreInformation,
    rejected: manifest.summary.rejected,
    manifestSha256,
    manifestPath,
  };
}

async function main(): Promise<void> {
  const result = await runPlanInspections();
  process.stdout.write(
    [
      "plan:inspections — offline proposal only",
      `services: ${result.serviceCount}`,
      `eligibleForReview: ${result.eligibleForReview}`,
      `needsMoreInformation: ${result.needsMoreInformation}`,
      `rejected: ${result.rejected}`,
      `approvedForNetworkExecutionTrue: 0`,
      `manifest: ${result.manifestPath}`,
      `sha256: ${result.manifestSha256}`,
      "",
    ].join("\n"),
  );
}

const isDirect =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirect) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`plan:inspections failed: ${message}\n`);
    process.exitCode = 1;
  });
}

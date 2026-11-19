/**
 * CLI: offline ProviderRecord@1.0 catalog from D3.4 + D3.5 evidence.
 *
 * Usage: pnpm build:catalog
 * Exit: nonzero if zero providers produced.
 *
 * READ_ONLY / NO_SIGNING — no RPC, no HTTP.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCatalogDocuments,
  formatProviderCatalogMarkdown,
  loadEvidenceFiles,
} from "../providers/catalog.ts";

export async function runBuildCatalog(options?: {
  readonly repoRoot?: string;
  readonly generatedAt?: string;
  readonly writeDiagnostics?: boolean;
}): Promise<{
  readonly ok: boolean;
  readonly providerCount: number;
  readonly catalogSha256: string;
  readonly verificationSha256: string;
  readonly report: string;
}> {
  const repoRoot =
    options?.repoRoot ??
    join(dirname(fileURLToPath(import.meta.url)), "../..");
  const registryPath = join(repoRoot, "docs/evidence/registry-reads.json");
  const metadataPath = join(
    repoRoot,
    "docs/evidence/registration-metadata.json",
  );
  const generatedAt = options?.generatedAt ?? "1970-01-01T00:00:00.000Z";

  const { registry, metadata } = loadEvidenceFiles({
    registryPath,
    metadataPath,
  });

  const result = buildCatalogDocuments({
    registry,
    metadata,
    generatedAt,
    registryEvidencePath: "docs/evidence/registry-reads.json",
    metadataEvidencePath: "docs/evidence/registration-metadata.json",
  });

  const catalogPath = join(repoRoot, "docs/evidence/provider-catalog.json");
  const verificationPath = join(
    repoRoot,
    "docs/evidence/provider-verification.json",
  );
  const markdownPath = join(repoRoot, "docs/provider-catalog.md");
  const diagnosticsPath = join(
    repoRoot,
    "docs/evidence/provider-catalog-diagnostics.json",
  );

  mkdirSync(dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, result.catalogJson, "utf8");
  writeFileSync(verificationPath, result.verificationJson, "utf8");
  writeFileSync(
    markdownPath,
    `${formatProviderCatalogMarkdown({
      catalog: result.catalog,
      verification: result.verification,
      catalogSha256: result.catalogSha256,
      verificationSha256: result.verificationSha256,
    })}\n`,
    "utf8",
  );

  if (options?.writeDiagnostics !== false) {
    writeFileSync(diagnosticsPath, result.diagnosticsJson, "utf8");
  }

  const ok = result.catalog.providerCount > 0;
  const lines = [
    "# AgentHire provider catalog (D3.6)",
    "Mode: READ_ONLY / NO_SIGNING",
    `generatedAt: ${generatedAt}`,
    `providers: ${result.catalog.providerCount}`,
    `evidences: ${result.verification.evidenceCount}`,
    `verifications: ${result.verification.verificationCount}`,
    `catalogSha256: ${result.catalogSha256}`,
    `verificationSha256: ${result.verificationSha256}`,
    `overall: ${ok ? "PASS" : "FAIL"}`,
    "",
    ...result.catalog.providers.map(
      (p) =>
        `- ${p.providerId} | ${p.registration.advertisedName ?? "n/a"} | services=${p.services.length} | x402=${p.payment.x402Advertised} | fetch=${p.registration.fetchStatus}`,
    ),
    "",
  ];

  return {
    ok,
    providerCount: result.catalog.providerCount,
    catalogSha256: result.catalogSha256,
    verificationSha256: result.verificationSha256,
    report: lines.join("\n"),
  };
}

async function main(): Promise<void> {
  // Fixed timestamp → byte-identical reruns for SHA-256 reproducibility.
  const generatedAt = "2026-11-19T10:00:00.000Z";
  const { ok, report } = await runBuildCatalog({ generatedAt });
  process.stdout.write(report);
  process.exitCode = ok ? 0 : 1;
}

const isDirectRun =
  process.argv[1] != null &&
  (process.argv[1].endsWith("build-catalog.ts") ||
    process.argv[1].endsWith("build-catalog.js"));

if (isDirectRun) {
  main().catch((error) => {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    process.stderr.write(`build-catalog fatal: ${message}\n`);
    process.exitCode = 1;
  });
}

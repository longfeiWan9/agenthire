/**
 * CLI: offline proposed service inspections (D4.3b).
 *
 * Usage: pnpm plan:service-inspections
 *
 * READ_ONLY / NO_SIGNING / NO_PAYMENT / NO_NEW_PROVIDER_REQUESTS
 * Writes docs/day4/evidence/proposed-service-inspections.json
 * Dual-run must be byte-identical. approvedForNetworkExecution always false.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256OfString, stableStringify } from "../providers/catalog.ts";
import {
  buildProposedServiceInspections,
  type DiscoveryEvidenceLike,
} from "../providers/service-interface.ts";
import type { ProviderCatalogDocument } from "../providers/types.ts";

export async function runPlanServiceInspections(options?: {
  readonly repoRoot?: string;
}): Promise<{
  readonly ok: boolean;
  readonly proposalCount: number;
  readonly documentSha256: string;
  readonly documentPath: string;
}> {
  const repoRoot =
    options?.repoRoot ??
    join(dirname(fileURLToPath(import.meta.url)), "../..");

  const catalogPath = join(repoRoot, "docs/evidence/provider-catalog.json");
  const discoveryPath = join(
    repoRoot,
    "docs/day4/evidence/discovery-inspection.json",
  );
  const catalog = JSON.parse(
    readFileSync(catalogPath, "utf8"),
  ) as ProviderCatalogDocument;
  const discovery = JSON.parse(
    readFileSync(discoveryPath, "utf8"),
  ) as DiscoveryEvidenceLike;

  const build = (): string =>
    `${stableStringify(
      buildProposedServiceInspections({
        catalog,
        discovery,
        catalogPath: "docs/evidence/provider-catalog.json",
        discoveryEvidencePath: "docs/day4/evidence/discovery-inspection.json",
      }),
    )}\n`;

  const documentJson = build();
  const again = build();
  if (again !== documentJson) {
    throw new Error(
      "proposed-service-inspections.json is not deterministic across dual build",
    );
  }

  const documentSha256 = sha256OfString(documentJson);
  const outDir = join(repoRoot, "docs/day4/evidence");
  const documentPath = join(outDir, "proposed-service-inspections.json");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(documentPath, documentJson, "utf8");

  const parsed = JSON.parse(documentJson) as { proposalCount: number };
  return {
    ok: true,
    proposalCount: parsed.proposalCount,
    documentSha256,
    documentPath,
  };
}

async function main(): Promise<void> {
  const result = await runPlanServiceInspections();
  process.stdout.write(
    JSON.stringify(
      {
        ok: result.ok,
        proposalCount: result.proposalCount,
        documentSha256: result.documentSha256,
        documentPath: result.documentPath,
      },
      null,
      2,
    ) + "\n",
  );
}

const isDirect =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirect) {
  main().catch((err) => {
    process.stderr.write(
      `${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  });
}

/**
 * CLI: offline re-analysis of recovered Agent402 full catalog (D4.4b).
 *
 * Usage: pnpm analyze:agent402-catalog
 * Zero network. Rejects --live/--fetch/--probe/--execute/--approved-live.
 */

import { runAnalyzeAgent402Catalog } from "./recover-agent402-catalog.ts";

async function main(): Promise<void> {
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
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`analyze-agent402-catalog fatal: ${message}\n`);
  process.exitCode = 1;
});

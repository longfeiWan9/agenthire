/**
 * CLI entry: D7.3 offline PoW operator (wraps runPowPreparation).
 *
 *   pnpm pow:operator
 *   pnpm pow:operator --offline-simulate
 *
 * Default is offline dry-run. Live mode is gated and not demonstrated here.
 */

import { runPowOperatorCli } from "../pow/operator-cli.ts";

async function main(): Promise<void> {
  const report = await runPowOperatorCli();
  if (!report.ok && report.status !== "help") {
    process.exitCode = 1;
  }
}

const isDirect =
  process.argv[1] != null &&
  (process.argv[1].endsWith("pow-operator.ts") ||
    process.argv[1].endsWith("pow-operator.js"));

if (isDirect) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

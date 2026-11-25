/**
 * CLI: D7.3 Stage A — one-time Agent402 challenge API schema observation.
 *
 * Usage:
 *   pnpm observe:agent402-challenge-schema                 # dry-run (zero network)
 *   pnpm observe:agent402-challenge-schema --approved-live # one approved live GET
 *
 * Single-use marker written BEFORE DNS/network on --approved-live.
 * No POST, no solve, no retry, no arbitrary URLs.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STAGE_A_APPROVED_URL,
  STAGE_A_MARKER_REL,
  STAGE_A_MAX_BYTES,
  STAGE_A_REQUEST_ID,
  STAGE_A_TIMEOUT_MS,
  observeAgent402ChallengeSchema,
  renderStageAObservationMarkdown,
  stageAMarkerExists,
  type ChallengeSchemaRunMode,
} from "../providers/agent402-challenge-schema-observation.ts";

function parseArgs(argv: readonly string[]): {
  readonly runMode: ChallengeSchemaRunMode;
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
          "  pnpm observe:agent402-challenge-schema                 dry-run (zero network)",
          "  pnpm observe:agent402-challenge-schema --approved-live one approved live GET",
          "",
          `Exact allowlist: GET ${STAGE_A_APPROVED_URL}`,
          `Limits: ≤${STAGE_A_TIMEOUT_MS}ms · ≤${STAGE_A_MAX_BYTES} bytes · 0 redirects · 0 retries`,
          `Marker: ${STAGE_A_MARKER_REL} (${STAGE_A_REQUEST_ID})`,
          "Schema/transport observation only. No POST. No solve. No force-reset.",
          "",
        ].join("\n"),
      );
      process.exit(0);
    }
    if (
      arg === "--force" ||
      arg === "--reset" ||
      arg === "--retry" ||
      arg === "--force-retry" ||
      arg === "--force-reset" ||
      arg === "--solve" ||
      arg === "--post"
    ) {
      throw new Error(
        `Rejected "${arg}": Stage A is one-shot GET schema observation only. ` +
          `No solve/POST/force-reset.`,
      );
    }
    if (arg.startsWith("http://") || arg.startsWith("https://")) {
      throw new Error(
        `Arbitrary URL arguments are not allowed (got ${arg}). Use Stage A allowlist only.`,
      );
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    throw new Error(
      `Unexpected argument: ${arg}. No positional URLs or ids are accepted.`,
    );
  }
  return { runMode: approvedLive ? "approved-live" : "dry-run" };
}

function asiaShanghaiLabel(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} CST (UTC+8)`;
}

export async function runObserveAgent402ChallengeSchema(options?: {
  readonly argv?: readonly string[];
  readonly repoRoot?: string;
}): Promise<{
  readonly ok: boolean;
  readonly runMode: ChallengeSchemaRunMode;
  readonly status: string;
}> {
  const { runMode } = parseArgs(options?.argv ?? process.argv);
  const repoRoot =
    options?.repoRoot ??
    join(dirname(fileURLToPath(import.meta.url)), "..", "..");

  if (runMode === "approved-live") {
    const markerPath = join(repoRoot, STAGE_A_MARKER_REL);
    if (stageAMarkerExists(markerPath)) {
      process.stderr.write(
        `attemptBlocked: marker exists at ${markerPath}\n`,
      );
      return { ok: false, runMode, status: "attemptBlocked" };
    }
  }

  const { request, result } = await observeAgent402ChallengeSchema({
    repoRoot,
    runMode,
    writeArtifacts: runMode === "approved-live",
  });

  process.stdout.write(
    JSON.stringify(
      {
        runMode,
        status: result.status,
        httpStatus: result.httpStatus,
        rawResponseSha256: result.rawResponseSha256,
        pinnedAddress: result.pinnedAddress,
        dnsResolverUsed: result.dnsResolverUsed,
        parseOk: result.adapterCompatibility?.parseOk ?? null,
        authorizationConsumed: result.authorizationConsumed,
        evidenceLevel: result.evidenceLevel,
      },
      null,
      2,
    ) + "\n",
  );

  if (runMode === "approved-live") {
    const report = renderStageAObservationMarkdown({
      request,
      result,
      worktree: repoRoot,
      branch: "cursor/d7.3-agent402-pow-preparation",
      asiaShanghaiLabel: asiaShanghaiLabel(result.observedAt),
    });
    const reportPath = join(
      repoRoot,
      "docs/day7/d7.3-stage-a-pow-challenge-observation.md",
    );
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, report, { encoding: "utf8" });
    process.stderr.write(`Wrote ${reportPath}\n`);
  }

  const ok =
    runMode === "dry-run"
      ? result.status === "planned"
      : result.networkRequestPerformed && result.authorizationConsumed;

  return { ok, runMode, status: result.status };
}

const isMain =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  runObserveAgent402ChallengeSchema()
    .then((r) => {
      process.exitCode = r.ok ? 0 : 1;
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}

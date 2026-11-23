/**
 * CLI: one-time Agent402 OpenAPI documentation inspection (D5.5 / OPENAPI-001).
 *
 * Usage:
 *   pnpm inspect:agent402-openapi                 # dry-run (zero network)
 *   pnpm inspect:agent402-openapi --approved-live # one approved live GET
 *
 * Single-use attempt marker is written BEFORE network I/O on --approved-live
 * only when security controls are complete. Existing marker blocks re-run.
 * No force-reset. No arbitrary URL args. Does not touch D4.4b catalog marker.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OPENAPI_001_APPROVED_URL,
  OPENAPI_001_ATTEMPT_MARKER_REL,
  OPENAPI_001_MAX_BYTES,
  OPENAPI_001_REQUEST_ID,
  OPENAPI_001_TIMEOUT_MS,
  OPENAPI_INSPECTION_MODE,
  inspectAgent402OpenApi,
  renderIntegrationDecisionMarkdown,
  renderInterfaceAssessmentMarkdown,
  renderOpenApiInspectionMarkdown,
  sha256Text,
  stableStringify,
  type OpenApiInspectionRunMode,
} from "../providers/agent402-openapi-inspection.ts";

function parseArgs(argv: readonly string[]): {
  readonly runMode: OpenApiInspectionRunMode;
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
          "  pnpm inspect:agent402-openapi                 dry-run (zero network)",
          "  pnpm inspect:agent402-openapi --approved-live one approved live GET",
          "",
          `Exact allowlist: ${OPENAPI_001_REQUEST_ID} → ${OPENAPI_001_APPROVED_URL}`,
          `Limits: ≤${OPENAPI_001_TIMEOUT_MS}ms · ≤${OPENAPI_001_MAX_BYTES} bytes · 0 redirects · 0 retries`,
          `Single-use marker: ${OPENAPI_001_ATTEMPT_MARKER_REL}`,
          "No arbitrary URL arguments. No force-reset. Does not reuse D4.4b marker.",
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
      arg === "--force-reset"
    ) {
      throw new Error(
        `Rejected "${arg}": OPENAPI-001 has no auto-reset / force-retry. ` +
          `Remove the attempt marker only via explicit out-of-band human action ` +
          `after renewed authorization. Dry-run never consumes the live attempt.`,
      );
    }
    if (arg.startsWith("http://") || arg.startsWith("https://")) {
      throw new Error(
        `Arbitrary URL arguments are not allowed (got ${arg}). Use OPENAPI-001 allowlist only.`,
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

export async function runInspectAgent402OpenApi(options?: {
  readonly argv?: readonly string[];
  readonly repoRoot?: string;
  readonly observedAt?: string;
  readonly markerPath?: string;
  readonly skipMarkerWrite?: boolean;
  readonly writeArtifacts?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<{
  readonly ok: boolean;
  readonly runMode: OpenApiInspectionRunMode;
  readonly status: string;
  readonly l1Count: number;
  readonly selection: string | null;
  readonly outcome: string;
  readonly byteLength: number | null;
  readonly sha256: string | null;
  readonly networkRequestPerformed: boolean;
  readonly attemptPath: string | null;
  readonly candidatesPath: string | null;
  readonly markerPath: string;
  readonly report: string;
  readonly error?: string;
}> {
  const repoRoot =
    options?.repoRoot ??
    join(dirname(fileURLToPath(import.meta.url)), "../..");
  const parsed = parseArgs(options?.argv ?? process.argv);
  const writeArtifacts = options?.writeArtifacts ?? parsed.writeArtifacts;

  const result = await inspectAgent402OpenApi({
    runMode: parsed.runMode,
    observedAt: options?.observedAt,
    repoRoot,
    markerPath: options?.markerPath,
    skipMarkerWrite: options?.skipMarkerWrite,
    env: options?.env,
  });

  const { attempt, candidates, rawBody } = result;

  const lines = [
    "# AgentHire Agent402 OpenAPI inspection (D5.5)",
    `Mode: ${OPENAPI_INSPECTION_MODE}`,
    `requestId: ${OPENAPI_001_REQUEST_ID}`,
    `runMode: ${attempt.runMode}`,
    `status: ${attempt.status}`,
    `approvedUrl: ${attempt.approvedUrl}`,
    `httpStatus: ${attempt.httpStatus ?? "n/a"}`,
    `rawResponseBytes: ${attempt.rawResponseBytes ?? "n/a"}`,
    `rawResponseSha256: ${attempt.rawResponseSha256 ?? "n/a"}`,
    `maxBytes: ${attempt.maxBytes}`,
    `timeoutMs: ${attempt.timeoutMs}`,
    `controlsComplete: ${attempt.controls.controlsComplete}`,
    `networkRequestPerformed: ${attempt.networkRequestPerformed}`,
    `attemptMarkerPath: ${attempt.attemptMarkerPath}`,
    `reusedD44bCatalogMarker: ${attempt.reusedD44bCatalogMarker}`,
    `l1Count: ${candidates.l1Count}`,
    `decision: ${candidates.decision.outcome}`,
    `selection: ${candidates.decision.selectedCapabilityId ?? "null"}`,
    `selectedOperationKey: ${candidates.decision.selectedOperationKey ?? "null"}`,
  ];
  if (attempt.error) {
    lines.push(`error: ${attempt.error}`);
    if (attempt.errorClass) lines.push(`errorClass: ${attempt.errorClass}`);
  }

  let attemptPath: string | null = null;
  let candidatesPath: string | null = null;

  // Persist evidence for the consumed live attempt (success or transport
  // failure). Never overwrite prior artifacts with attemptBlocked shells —
  // that was a D4.4b incident class; marker-blocked re-runs must preserve
  // the first attempt's evidence in place.
  if (
    writeArtifacts &&
    attempt.runMode === "approved-live" &&
    attempt.status !== "attemptBlocked"
  ) {
    const evidenceDir = join(repoRoot, "docs/day5/evidence");
    const day5Dir = join(repoRoot, "docs/day5");
    mkdirSync(evidenceDir, { recursive: true });
    mkdirSync(day5Dir, { recursive: true });

    attemptPath = join(evidenceDir, "d5.5-request-attempt.json");
    candidatesPath = join(evidenceDir, "d5.5-interface-candidates.json");
    const inspectionMd = join(day5Dir, "d5.5-openapi-inspection-report.md");
    const assessmentMd = join(day5Dir, "d5.5-agent402-interface-assessment.md");
    const decisionMd = join(day5Dir, "d5.5-integration-decision.md");

    const attemptJson = stableStringify(attempt);
    const candidatesJson = stableStringify(candidates);

    writeFileSync(attemptPath, attemptJson, "utf8");
    writeFileSync(candidatesPath, candidatesJson, "utf8");
    writeFileSync(
      inspectionMd,
      renderOpenApiInspectionMarkdown({ attempt, candidates }),
      "utf8",
    );
    writeFileSync(
      assessmentMd,
      renderInterfaceAssessmentMarkdown(candidates),
      "utf8",
    );
    writeFileSync(
      decisionMd,
      renderIntegrationDecisionMarkdown(candidates),
      "utf8",
    );

    if (
      attempt.status === "success" &&
      attempt.rawBodyCommitted &&
      rawBody &&
      attempt.rawBodyPath
    ) {
      const rawPath = join(repoRoot, attempt.rawBodyPath);
      mkdirSync(dirname(rawPath), { recursive: true });
      writeFileSync(rawPath, rawBody);
      lines.push(
        `rawBodyPath: ${attempt.rawBodyPath}`,
        `rawBodySha256: ${attempt.rawResponseSha256}`,
      );
    }

    lines.push(
      `attemptPath: ${attemptPath}`,
      `attemptSha256: ${sha256Text(attemptJson)}`,
      `candidatesPath: ${candidatesPath}`,
      `candidatesSha256: ${sha256Text(candidatesJson)}`,
      `inspectionMd: ${inspectionMd}`,
      `assessmentMd: ${assessmentMd}`,
      `decisionMd: ${decisionMd}`,
    );
  } else if (
    writeArtifacts &&
    attempt.runMode === "approved-live" &&
    attempt.status === "attemptBlocked"
  ) {
    lines.push(
      "artifactWrite: skipped (attemptBlocked must not overwrite prior OPENAPI-001 evidence)",
    );
  }

  const ok =
    parsed.runMode === "dry-run"
      ? attempt.status === "planned"
      : attempt.status === "success";

  lines.push(`overall: ${ok ? "PASS" : "FAIL"}`, "");
  const report = `${lines.join("\n")}`;

  return {
    ok,
    runMode: attempt.runMode,
    status: attempt.status,
    l1Count: candidates.l1Count,
    selection: candidates.decision.selectedCapabilityId,
    outcome: candidates.decision.outcome,
    byteLength: attempt.rawResponseBytes,
    sha256: attempt.rawResponseSha256,
    networkRequestPerformed: attempt.networkRequestPerformed,
    attemptPath,
    candidatesPath,
    markerPath: attempt.attemptMarkerPath,
    report,
    error: attempt.error ?? undefined,
  };
}

async function main(): Promise<void> {
  const result = await runInspectAgent402OpenApi();
  process.stdout.write(result.report);
  process.exit(result.ok ? 0 : 1);
}

const isDirect =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirect) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}

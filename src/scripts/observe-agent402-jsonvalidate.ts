/**
 * CLI: one-time Agent402 JSON Schema validation observation
 * (D6-R1.5 / JSONVALIDATE-001 or JSONVALIDATE-002).
 *
 * Usage:
 *   pnpm observe:agent402-jsonvalidate                 # dry-run (zero network)
 *   pnpm observe:agent402-jsonvalidate --approved-live # one approved live POST
 *   pnpm observe:agent402-jsonvalidate --request-id=JSONVALIDATE-002 --approved-live
 *
 * Single-use attempt marker is written BEFORE network I/O on --approved-live
 * only when security controls are complete. Existing marker blocks re-run.
 * No force-reset. No arbitrary URL args. No 402 follow-up / pay / PoW.
 * Does not touch OPENAPI-001, D4.4b, or sibling JSONVALIDATE markers.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  JSONVALIDATE_001_APPROVED_URL,
  JSONVALIDATE_001_MAX_BYTES,
  JSONVALIDATE_001_REQUEST_ID,
  JSONVALIDATE_001_TIMEOUT_MS,
  JSONVALIDATE_002_REQUEST_ID,
  JSONVALIDATE_OBSERVATION_MODE,
  attemptMarkerRelFor,
  evidenceBasenamePrefix,
  isJsonValidateRequestId,
  observeAgent402JsonValidate,
  renderObservationMarkdown,
  sha256Text,
  stableStringify,
  type JsonValidateRequestId,
  type JsonValidateRunMode,
} from "../providers/agent402-jsonvalidate-observation.ts";

function parseArgs(argv: readonly string[]): {
  readonly runMode: JsonValidateRunMode;
  readonly requestId: JsonValidateRequestId;
  readonly writeArtifacts: boolean;
} {
  const args = argv.slice(2);
  let approvedLive = false;
  let requestId: JsonValidateRequestId = JSONVALIDATE_001_REQUEST_ID;
  for (const arg of args) {
    if (arg === "--approved-live") {
      approvedLive = true;
      continue;
    }
    if (arg.startsWith("--request-id=")) {
      const value = arg.slice("--request-id=".length);
      if (!isJsonValidateRequestId(value)) {
        throw new Error(
          `Unsupported --request-id=${value}. Allowed: ${JSONVALIDATE_001_REQUEST_ID}, ${JSONVALIDATE_002_REQUEST_ID}`,
        );
      }
      requestId = value;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage:",
          "  pnpm observe:agent402-jsonvalidate                 dry-run (zero network)",
          "  pnpm observe:agent402-jsonvalidate --approved-live one approved live POST",
          "  pnpm observe:agent402-jsonvalidate --request-id=JSONVALIDATE-002 --approved-live",
          "",
          `Exact allowlist: POST ${JSONVALIDATE_001_APPROVED_URL}`,
          `Limits: ≤${JSONVALIDATE_001_TIMEOUT_MS}ms · ≤${JSONVALIDATE_001_MAX_BYTES} bytes · 0 redirects · 0 retries`,
          `Markers: ${attemptMarkerRelFor(JSONVALIDATE_001_REQUEST_ID)} | ${attemptMarkerRelFor(JSONVALIDATE_002_REQUEST_ID)}`,
          "No arbitrary URL arguments. No force-reset. No 402 follow-up/pay/PoW.",
          "Does not reuse OPENAPI-001, D4.4b, or sibling JSONVALIDATE markers.",
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
        `Rejected "${arg}": JSONVALIDATE attempts have no auto-reset / force-retry. ` +
          `Remove the attempt marker only via explicit out-of-band human action ` +
          `after renewed authorization. Dry-run never consumes the live attempt.`,
      );
    }
    if (arg.startsWith("http://") || arg.startsWith("https://")) {
      throw new Error(
        `Arbitrary URL arguments are not allowed (got ${arg}). Use JSONVALIDATE allowlist only.`,
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
    requestId,
    writeArtifacts: approvedLive,
  };
}

export async function runObserveAgent402JsonValidate(options?: {
  readonly argv?: readonly string[];
  readonly repoRoot?: string;
  readonly observedAt?: string;
  readonly markerPath?: string;
  readonly skipMarkerWrite?: boolean;
  readonly writeArtifacts?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<{
  readonly ok: boolean;
  readonly runMode: JsonValidateRunMode;
  readonly requestId: JsonValidateRequestId;
  readonly status: string;
  readonly interpretation: string;
  readonly httpStatus: number | null;
  readonly authorizationConsumed: boolean;
  readonly networkRequestPerformed: boolean;
  readonly ladderObserved: string;
  readonly pinnedAddress: string | null;
  readonly requestPath: string | null;
  readonly resultPath: string | null;
  readonly markerPath: string;
  readonly report: string;
  readonly error?: string;
}> {
  const repoRoot =
    options?.repoRoot ??
    join(dirname(fileURLToPath(import.meta.url)), "../..");
  const parsed = parseArgs(options?.argv ?? process.argv);
  const writeArtifacts = options?.writeArtifacts ?? parsed.writeArtifacts;
  const requestId = parsed.requestId;
  const prefix = evidenceBasenamePrefix(requestId);

  const { request, result, rawBody } = await observeAgent402JsonValidate({
    runMode: parsed.runMode,
    requestId,
    observedAt: options?.observedAt,
    repoRoot,
    markerPath: options?.markerPath,
    skipMarkerWrite: options?.skipMarkerWrite,
    env: options?.env,
  });

  const lines = [
    "# AgentHire Agent402 JSON-validate observation (D6-R1.5)",
    `Mode: ${JSONVALIDATE_OBSERVATION_MODE}`,
    `requestId: ${requestId}`,
    `runMode: ${result.runMode}`,
    `status: ${result.status}`,
    `interpretation: ${result.interpretation}`,
    `approvedUrl: ${result.approvedUrl}`,
    `method: ${result.method}`,
    `requestBodySha256: ${result.requestBodySha256}`,
    `httpStatus: ${result.httpStatus ?? "n/a"}`,
    `pinnedAddress: ${result.pinnedAddress ?? "n/a"}`,
    `rawResponseBytes: ${result.rawResponseBytes ?? "n/a"}`,
    `rawResponseSha256: ${result.rawResponseSha256 ?? "n/a"}`,
    `maxBytes: ${result.maxBytes}`,
    `timeoutMs: ${result.timeoutMs}`,
    `controlsComplete: ${result.controls.controlsComplete}`,
    `networkRequestPerformed: ${result.networkRequestPerformed}`,
    `authorizationConsumed: ${result.authorizationConsumed}`,
    `genuineProvider: ${result.genuineProvider ?? "n/a"}`,
    `attemptMarkerPath: ${result.attemptMarkerPath}`,
    `ladder: ${result.ladder.priorLevel} -> ${result.ladder.observedLevel}`,
    `independentValid: ${result.independentValidation.valid}`,
  ];
  if (result.envelopeComparison) {
    lines.push(
      `envelopeAgreement: ${result.envelopeComparison.agreement}`,
      `providerValid: ${result.envelopeComparison.providerValid}`,
    );
  }
  if (result.error) {
    lines.push(`error: ${result.error}`);
    if (result.errorClass) lines.push(`errorClass: ${result.errorClass}`);
  }

  let requestPath: string | null = null;
  let resultPath: string | null = null;

  // Persist evidence for the consumed live attempt (success or transport
  // failure). Never overwrite prior artifacts with attemptBlocked shells.
  // Never overwrite sibling JSONVALIDATE evidence (001 vs 002).
  if (
    writeArtifacts &&
    result.runMode === "approved-live" &&
    result.status !== "attemptBlocked"
  ) {
    const evidenceDir = join(repoRoot, "docs/day6/evidence");
    const day6Dir = join(repoRoot, "docs/day6");
    mkdirSync(evidenceDir, { recursive: true });
    mkdirSync(day6Dir, { recursive: true });

    requestPath = join(evidenceDir, `${prefix}-request.json`);
    resultPath = join(evidenceDir, `${prefix}-result.json`);
    const reportMd = join(
      day6Dir,
      requestId === JSONVALIDATE_002_REQUEST_ID
        ? "d6-r15-agent402-jsonvalidate-002-observation-report.md"
        : "d6-r15-agent402-observation-report.md",
    );

    const requestJson = stableStringify(request);
    const resultJson = stableStringify(result);

    writeFileSync(requestPath, requestJson, "utf8");
    writeFileSync(resultPath, resultJson, "utf8");
    writeFileSync(
      reportMd,
      renderObservationMarkdown({ request, result }),
      "utf8",
    );

    if (
      result.status === "success" &&
      result.rawBodyCommitted &&
      rawBody &&
      result.rawBodyPath
    ) {
      const rawPath = join(repoRoot, result.rawBodyPath);
      mkdirSync(dirname(rawPath), { recursive: true });
      writeFileSync(rawPath, rawBody);
      lines.push(
        `rawBodyPath: ${result.rawBodyPath}`,
        `rawBodySha256: ${result.rawResponseSha256}`,
      );
    } else if (
      rawBody &&
      (result.status === "paymentRequired" ||
        result.status === "invalidEnvelope" ||
        result.status === "invalidJson" ||
        result.status === "httpError" ||
        result.status === "unauthorized" ||
        result.status === "notFound")
    ) {
      // Bounded sanitized snapshot already in result; optionally keep raw
      // bytes for offline 402/error analysis under a distinct path.
      const snapPath = join(evidenceDir, `${prefix}-response-snapshot.bin`);
      writeFileSync(snapPath, rawBody);
      lines.push(`responseSnapshotPath: ${snapPath}`);
    }

    lines.push(
      `requestPath: ${requestPath}`,
      `requestSha256: ${sha256Text(requestJson)}`,
      `resultPath: ${resultPath}`,
      `resultSha256: ${sha256Text(resultJson)}`,
      `reportMd: ${reportMd}`,
    );
  } else if (
    writeArtifacts &&
    result.runMode === "approved-live" &&
    result.status === "attemptBlocked"
  ) {
    lines.push(
      `artifactWrite: skipped (attemptBlocked must not overwrite prior ${requestId} evidence)`,
    );
  }

  const ok =
    parsed.runMode === "dry-run"
      ? result.status === "planned"
      : result.status === "success" || result.status === "paymentRequired";

  lines.push(`overall: ${ok ? "PASS" : "FAIL"}`, "");
  const report = `${lines.join("\n")}`;

  return {
    ok,
    runMode: result.runMode,
    requestId,
    status: result.status,
    interpretation: result.interpretation,
    httpStatus: result.httpStatus,
    authorizationConsumed: result.authorizationConsumed,
    networkRequestPerformed: result.networkRequestPerformed,
    ladderObserved: result.ladder.observedLevel,
    pinnedAddress: result.pinnedAddress,
    requestPath,
    resultPath,
    markerPath: result.attemptMarkerPath,
    report,
    error: result.error ?? undefined,
  };
}

async function main(): Promise<void> {
  const result = await runObserveAgent402JsonValidate();
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

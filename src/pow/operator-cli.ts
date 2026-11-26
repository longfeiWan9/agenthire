/**
 * Human-operated PoW CLI wrapping `runPowPreparation` (D7.3).
 *
 * Default: offline dry-run — prints proposed scope + safety limits; never
 * treats mere invocation as consent to contact the provider.
 *
 * Live mode requires BOTH:
 *   --approved-live
 *   --grant-live-authorization=POW-L3-GET-002+POW-L3-POST-002
 * AND environment:
 *   AGENTHIRE_POW_L3_LIVE_AUTH=POW-L3-GET-002+POW-L3-POST-002
 *
 * That dual gate is not satisfiable by default config. Unsupported args,
 * URLs, endpoints, and execution modes are rejected.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatAuthorizedScopeLines,
  POW_AUTHORIZED_LIMITS,
} from "./auth-limits.ts";
import {
  powRequestBodySha256,
  runPowPreparation,
  type RunPowPreparationResult,
} from "./adapter.ts";
import { createFakePowTransport } from "./fake-transport.ts";
import {
  POW_CHALLENGE_GET_REQUEST_ID,
  POW_SUBMIT_POST_REQUEST_ID,
  type PowChallenge,
  type PowRunMode,
} from "./types.ts";

export const POW_OPERATOR_LIVE_GRANT_VALUE =
  `${POW_CHALLENGE_GET_REQUEST_ID}+${POW_SUBMIT_POST_REQUEST_ID}` as const;

export const POW_OPERATOR_LIVE_AUTH_ENV = "AGENTHIRE_POW_L3_LIVE_AUTH" as const;

export type PowOperatorCliMode =
  | "dry-run"
  | "offline-simulate"
  | "approved-live";

export type PowOperatorParseOk = {
  readonly ok: true;
  readonly mode: PowOperatorCliMode;
  readonly liveAuthorizationGranted: boolean;
};

export type PowOperatorParseFail = {
  readonly ok: false;
  readonly reason: string;
};

export type PowOperatorParseResult = PowOperatorParseOk | PowOperatorParseFail;

const REJECTED_FLAGS = new Set([
  "--force",
  "--reset",
  "--retry",
  "--force-retry",
  "--force-reset",
  "--url",
  "--endpoint",
  "--base-url",
  "--live",
  "--execute-live",
  "--pay",
  "--sign",
  "--wallet",
]);

export function parsePowOperatorArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): PowOperatorParseResult {
  const args = argv.slice(2);
  let approvedLive = false;
  let offlineSimulate = false;
  let grantValue: string | null = null;

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      return {
        ok: false,
        reason: "HELP",
      };
    }
    if (arg === "--approved-live") {
      approvedLive = true;
      continue;
    }
    if (arg === "--offline-simulate") {
      offlineSimulate = true;
      continue;
    }
    if (arg === "--dry-run") {
      // Explicit dry-run (also the default).
      continue;
    }
    if (arg.startsWith("--grant-live-authorization=")) {
      grantValue = arg.slice("--grant-live-authorization=".length);
      continue;
    }
    if (arg === "--grant-live-authorization") {
      return {
        ok: false,
        reason:
          "Rejected bare --grant-live-authorization (require --grant-live-authorization=POW-L3-GET-002+POW-L3-POST-002)",
      };
    }
    if (REJECTED_FLAGS.has(arg)) {
      return {
        ok: false,
        reason: `Rejected unsupported flag "${arg}"`,
      };
    }
    if (arg.startsWith("http://") || arg.startsWith("https://")) {
      return {
        ok: false,
        reason: `Arbitrary URL arguments are not allowed (got ${arg}). Fixed allowlist only.`,
      };
    }
    if (arg.startsWith("-")) {
      return { ok: false, reason: `Unknown flag: ${arg}` };
    }
    return {
      ok: false,
      reason: `Unexpected argument: ${arg}. No positional URLs or endpoints are accepted.`,
    };
  }

  if (approvedLive && offlineSimulate) {
    return {
      ok: false,
      reason: "Rejected conflicting modes: --approved-live and --offline-simulate",
    };
  }

  if (approvedLive) {
    const envGrant = env[POW_OPERATOR_LIVE_AUTH_ENV];
    const grantOk =
      grantValue === POW_OPERATOR_LIVE_GRANT_VALUE &&
      envGrant === POW_OPERATOR_LIVE_GRANT_VALUE;
    if (!grantOk) {
      return {
        ok: false,
        reason:
          "approved-live refused: requires --grant-live-authorization=" +
          `${POW_OPERATOR_LIVE_GRANT_VALUE} AND env ${POW_OPERATOR_LIVE_AUTH_ENV}=` +
          `${POW_OPERATOR_LIVE_GRANT_VALUE} (not satisfiable by default config; ` +
          "mere invocation is not consent)",
      };
    }
    return {
      ok: true,
      mode: "approved-live",
      liveAuthorizationGranted: true,
    };
  }

  if (offlineSimulate) {
    return {
      ok: true,
      mode: "offline-simulate",
      liveAuthorizationGranted: false,
    };
  }

  return {
    ok: true,
    mode: "dry-run",
    liveAuthorizationGranted: false,
  };
}

export function powOperatorHelpText(): string {
  const L = POW_AUTHORIZED_LIMITS;
  return [
    "AgentHire D7.3 — PoW operator CLI (wraps runPowPreparation)",
    "",
    "Usage:",
    "  pnpm pow:operator                         offline dry-run (default; zero network)",
    "  pnpm pow:operator --dry-run                same as default",
    "  pnpm pow:operator --offline-simulate       fake-transport session (≠ L3)",
    "  pnpm pow:operator --approved-live ...      refused unless dual live grant + env",
    "",
    "Live authorization gate (NOT default; do not invent flags):",
    `  --approved-live --grant-live-authorization=${POW_OPERATOR_LIVE_GRANT_VALUE}`,
    `  ${POW_OPERATOR_LIVE_AUTH_ENV}=${POW_OPERATOR_LIVE_GRANT_VALUE}`,
    "",
    `Allowlist GET:  ${L.challengeUrl}`,
    `Allowlist POST: ${L.submitUrl}`,
    `Markers: ${L.getAuthId} then ${L.postAuthId}`,
    "Unsupported: arbitrary URLs, retries, redirects, payment/signing flags.",
    "Simulation success is never ladder L3.",
    "",
  ].join("\n");
}

export type PowOperatorCliReport = {
  readonly mode: PowOperatorCliMode;
  readonly ok: boolean;
  readonly status: string;
  readonly simulationOnly: boolean;
  readonly providerExecutionVerified: boolean;
  readonly liveAuthorizationGranted: boolean;
  readonly lines: readonly string[];
  readonly result: RunPowPreparationResult | null;
};

function softOfflineChallenge(): PowChallenge {
  return {
    token: "cli-offline-token",
    challenge: "cli-offline-challenge",
    difficultyBits: 8,
    expiresAtUnixSeconds: null,
    algorithm: null,
    submitHeader: null,
    submitFormat: null,
    ttlSeconds: null,
    slug: "json-validate",
    rawKeys: ["challenge", "difficultyBits", "slug", "token"],
    fixtureKind: "synthetic",
    parseMode: "compat",
  };
}

export async function runPowOperatorCli(options?: {
  readonly argv?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly repoRoot?: string;
  readonly stdout?: (line: string) => void;
  readonly stderr?: (line: string) => void;
  /** Test hook: inject transport for approved-live (never real provider in offline tests). */
  readonly transportForLiveTest?: Parameters<typeof runPowPreparation>[0]["transport"];
  readonly skipLiveMarkersForTest?: boolean;
  readonly clockIso?: string;
  readonly now?: () => number;
}): Promise<PowOperatorCliReport> {
  const writeOut = options?.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const writeErr = options?.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  const parsed = parsePowOperatorArgs(
    options?.argv ?? process.argv,
    options?.env ?? process.env,
  );

  if (!parsed.ok) {
    if (parsed.reason === "HELP") {
      writeOut(powOperatorHelpText().trimEnd());
      return {
        mode: "dry-run",
        ok: true,
        status: "help",
        simulationOnly: true,
        providerExecutionVerified: false,
        liveAuthorizationGranted: false,
        lines: powOperatorHelpText().trimEnd().split("\n"),
        result: null,
      };
    }
    writeErr(`operator refused: ${parsed.reason}`);
    return {
      mode: "dry-run",
      ok: false,
      status: "unauthorized",
      simulationOnly: true,
      providerExecutionVerified: false,
      liveAuthorizationGranted: false,
      lines: [`operator refused: ${parsed.reason}`],
      result: null,
    };
  }

  const repoRoot =
    options?.repoRoot ??
    join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const scopeLines = [...formatAuthorizedScopeLines()];
  for (const line of scopeLines) writeOut(line);
  writeOut(
    "Consent note: invoking this command alone is NOT authorization to contact Agent402.",
  );

  if (parsed.mode === "dry-run") {
    writeOut("mode=dry-run (offline) — no transport, no markers, no provider I/O");
    writeOut("Evidence: not L3");
    return {
      mode: "dry-run",
      ok: true,
      status: "dry-run",
      simulationOnly: true,
      providerExecutionVerified: false,
      liveAuthorizationGranted: false,
      lines: [
        ...scopeLines,
        "Consent note: invoking this command alone is NOT authorization to contact Agent402.",
        "mode=dry-run (offline) — no transport, no markers, no provider I/O",
        "Evidence: not L3",
      ],
      result: null,
    };
  }

  if (parsed.mode === "offline-simulate") {
    const challenge = softOfflineChallenge();
    const fake = createFakePowTransport({
      challenge,
      expectedBodySha256: powRequestBodySha256(),
    });
    const result = await runPowPreparation({
      sessionId: `pow-operator-offline-${Date.now()}`,
      runMode: "offline-simulation",
      transport: fake.exchange,
      clockIso: options?.clockIso ?? new Date(0).toISOString(),
      now: options?.now,
      liveAuthorizationGranted: false,
      repoRoot,
    });
    writeOut(
      `mode=offline-simulate status=${result.session.status} simulationOnly=${result.simulationOnly} providerExecutionVerified=${result.providerExecutionVerified}`,
    );
    writeOut("Evidence: not L3 (fake transport)");
    return {
      mode: "offline-simulate",
      ok: result.session.status === "verified",
      status: result.session.status,
      simulationOnly: result.simulationOnly,
      providerExecutionVerified: result.providerExecutionVerified,
      liveAuthorizationGranted: false,
      lines: [
        ...scopeLines,
        `mode=offline-simulate status=${result.session.status}`,
        "Evidence: not L3 (fake transport)",
      ],
      result,
    };
  }

  // approved-live path — still requires Product-Owner dual auth outside this CLI.
  const runMode: PowRunMode = "approved-live";
  const result = await runPowPreparation({
    sessionId: `pow-operator-live-${Date.now()}`,
    runMode,
    liveAuthorizationGranted: parsed.liveAuthorizationGranted,
    repoRoot,
    transport: options?.transportForLiveTest,
    skipLiveMarkersForTest: options?.skipLiveMarkersForTest,
    clockIso: options?.clockIso ?? new Date().toISOString(),
    now: options?.now,
  });
  writeOut(
    `mode=approved-live status=${result.session.status} simulationOnly=${result.simulationOnly} providerExecutionVerified=${result.providerExecutionVerified}`,
  );
  if (result.simulationOnly || !result.providerExecutionVerified) {
    writeOut("Evidence: not L3 unless full live checklist is satisfied");
  }
  return {
    mode: "approved-live",
    ok: result.session.status === "verified" && result.providerExecutionVerified,
    status: result.session.status,
    simulationOnly: result.simulationOnly,
    providerExecutionVerified: result.providerExecutionVerified,
    liveAuthorizationGranted: parsed.liveAuthorizationGranted,
    lines: [
      ...scopeLines,
      `mode=approved-live status=${result.session.status}`,
    ],
    result,
  };
}

/**
 * CLI: securely resolve ERC-8004 registration metadata for the D3.5 set.
 *
 * Usage: pnpm read:metadata
 * Exit: nonzero if zero successful metadata reads.
 *
 * READ_ONLY / NO_SIGNING — approved HTTPS URLs only; no service endpoint calls,
 * no x402, no wallets.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type RegistrationMetadataEvidence,
  D35_METADATA_TARGETS,
  countSuccessfulMetadataReads,
  evidenceToJson,
  resolveRegistrationMetadataBatch,
} from "../erc8004/metadata.ts";

function formatHuman(evidence: RegistrationMetadataEvidence): string {
  const services =
    evidence.advertisedServices.length === 0
      ? "  (none)"
      : evidence.advertisedServices
          .map(
            (s) =>
              `  - ${s.name} → ${s.endpoint}` +
              (s.version ? ` (v${s.version})` : "") +
              ` [${s.verificationStatus}]`,
          )
          .join("\n");

  const issues =
    evidence.validationIssues.length === 0
      ? "  (none)"
      : evidence.validationIssues
          .map((i) => `  - [${i.severity}/${i.code}] ${i.message}`)
          .join("\n");

  return [
    `## ${evidence.networkName} agent ${evidence.agentId}`,
    `- status: ${evidence.status}`,
    `- caip2: ${evidence.caip2}`,
    `- registry: ${evidence.registryAddress}`,
    `- onChainTokenURI: ${evidence.onChainTokenURI}`,
    `- approvedFetchURI: ${evidence.approvedFetchURI}`,
    `- displayURI: ${evidence.displayURI}`,
    `- observedAt: ${evidence.observedAt}`,
    `- httpStatus: ${evidence.httpStatus ?? "n/a"}`,
    `- contentType: ${evidence.contentType ?? "n/a"}`,
    `- contentSha256: ${evidence.contentSha256 ?? "n/a"}`,
    `- byteLength: ${evidence.byteLength ?? "n/a"}`,
    `- pinnedAddress: ${evidence.pinnedAddress ?? "n/a"}`,
    `- elapsedMs: ${evidence.elapsedMs ?? "n/a"}`,
    `- registration.name: ${evidence.registration?.name ?? "n/a"}`,
    `- registration.type: ${evidence.registration?.type ?? "n/a"}`,
    `- x402Support: ${evidence.registration?.x402Support ?? "n/a"}`,
    `- active: ${evidence.registration?.active ?? "n/a"}`,
    `- advertisedServices (${evidence.advertisedServices.length}):`,
    services,
    `- validationIssues (${evidence.validationIssues.length}):`,
    issues,
    evidence.error ? `- error: ${evidence.error}` : null,
    evidence.fetchErrorClass
      ? `- fetchErrorClass: ${evidence.fetchErrorClass}`
      : null,
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}

function formatMarkdownReport(
  evidences: readonly RegistrationMetadataEvidence[],
  capturedAt: string,
  successCount: number,
): string {
  const rows = evidences
    .map((e) => {
      const svc = e.advertisedServices
        .map((s) => s.name)
        .slice(0, 6)
        .join(", ");
      return `| ${e.networkName} | ${e.agentId} | ${e.status} | \`${e.displayURI}\` | ${e.contentSha256?.slice(0, 12) ?? "n/a"}… | ${e.advertisedServices.length} (${svc || "—"}) | ${e.error ?? ""} |`;
    })
    .join("\n");

  return [
    "# AgentHire D3.5 — Registration Metadata",
    "",
    "Status: live fetch of exact approved HTTPS registration documents.",
    "Mode remains **READ_ONLY / NO_SIGNING**.",
    "Advertised services are recorded as claims only (`verificationStatus: notChecked`).",
    "Service endpoints are **not** contacted.",
    "",
    "## 1. Purpose",
    "",
    "Securely resolve ERC-8004 registration metadata for the three D3.4 agents,",
    "with connection-time SSRF protections, offline schema validation, and typed",
    "`RegistrationMetadataEvidence` (`schemaVersion: \"1.0\"`).",
    "",
    "## 2. CLI",
    "",
    "```bash",
    "pnpm read:metadata",
    "```",
    "",
    "Exit code is nonzero if **zero** documents validate successfully.",
    "One document failure does not stop the others. Max concurrency: 2.",
    "",
    "## 3. Security controls",
    "",
    "| Control | Behavior |",
    "| --- | --- |",
    "| Allowlist | Exact URL match only (3 approved HTTPS documents) |",
    "| TLS | `rejectUnauthorized: true` |",
    "| Redirects | Refused (3xx → fetchFailed) |",
    "| DNS / IP | Reject private, loopback, link-local, CGNAT, multicast, special-use |",
    "| Pinning | Resolve → validate → dial pinned IP with SNI/`Host` (no DNS rebinding) |",
    "| Timeout | 10s |",
    "| Size | 256 KiB streaming limit |",
    "| Concurrency | max 2 |",
    "| Retry | one transient retry |",
    "| Credentials | no cookies / Authorization / URL userinfo |",
    "| URI fields | separate `onChainTokenURI` / `approvedFetchURI` / `displayURI` |",
    "",
    "## 4. Live results",
    "",
    `Captured: \`${capturedAt}\`. Successful: **${successCount}/${evidences.length}**.`,
    "",
    "| Chain | Agent ID | Status | displayURI | sha256 prefix | Services (claims) | Error |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    rows,
    "",
    "Raw JSON: `docs/evidence/registration-metadata.json`.",
    "",
    "## 5. Stop / next",
    "",
    "Out of scope: arbitrary URLs, service endpoint verification, x402, wallets,",
    "ProviderRecord@1.0 (D3.6), push.",
    "",
  ].join("\n");
}

export async function runReadMetadata(options?: {
  readonly writeEvidencePath?: string | null;
  readonly writeMarkdownPath?: string | null;
  readonly now?: () => Date;
}): Promise<{
  readonly evidences: RegistrationMetadataEvidence[];
  readonly successCount: number;
  readonly ok: boolean;
  readonly report: string;
  readonly markdown: string;
}> {
  const now = options?.now ?? (() => new Date());
  const observedAt = now().toISOString();

  const evidences = await resolveRegistrationMetadataBatch({ observedAt });
  const successCount = countSuccessfulMetadataReads(evidences);
  const ok = successCount > 0;

  const header = [
    "# AgentHire registration metadata (D3.5)",
    "Mode: READ_ONLY / NO_SIGNING",
    `schemaVersion: 1.0`,
    `targets: ${D35_METADATA_TARGETS.length}`,
    `successfulMetadataReads: ${successCount}`,
    `overall: ${ok ? "PASS" : "FAIL"}`,
    "",
  ].join("\n");

  const body = evidences.map(formatHuman).join("\n\n");
  const jsonBlock = evidences.map((e) => evidenceToJson(e)).join("\n\n");
  const report = `${header}${body}\n\n--- JSON evidence ---\n${jsonBlock}\n`;
  const markdown = formatMarkdownReport(evidences, observedAt, successCount);

  if (options?.writeEvidencePath) {
    mkdirSync(dirname(options.writeEvidencePath), { recursive: true });
    writeFileSync(
      options.writeEvidencePath,
      `${JSON.stringify(
        {
          schemaVersion: "1.0",
          mode: "READ_ONLY / NO_SIGNING",
          capturedAt: observedAt,
          source: "live-https-allowlisted",
          successfulMetadataReads: successCount,
          approvedUrls: D35_METADATA_TARGETS.map((t) => t.approvedFetchURI),
          evidences,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  if (options?.writeMarkdownPath) {
    mkdirSync(dirname(options.writeMarkdownPath), { recursive: true });
    writeFileSync(options.writeMarkdownPath, `${markdown}\n`, "utf8");
  }

  return { evidences, successCount, ok, report, markdown };
}

async function main(): Promise<void> {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const evidencePath = join(
    repoRoot,
    "docs/evidence/registration-metadata.json",
  );
  const markdownPath = join(repoRoot, "docs/registration-metadata.md");
  const { ok, report } = await runReadMetadata({
    writeEvidencePath: evidencePath,
    writeMarkdownPath: markdownPath,
  });
  process.stdout.write(report);
  process.exitCode = ok ? 0 : 1;
}

const isDirectRun =
  process.argv[1] != null &&
  (process.argv[1].endsWith("read-metadata.ts") ||
    process.argv[1].endsWith("read-metadata.js"));

if (isDirectRun) {
  main().catch((error) => {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    process.stderr.write(`read-metadata fatal: ${message}\n`);
    process.exitCode = 1;
  });
}

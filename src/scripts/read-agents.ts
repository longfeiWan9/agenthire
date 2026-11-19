/**
 * CLI: live ERC-8004 Identity Registry reads for the D3.4 agent set.
 *
 * Usage: pnpm read:agents
 * Exit: nonzero if zero successful live reads.
 *
 * READ_ONLY / NO_SIGNING — no metadata HTTP fetch, no wallets, no writes.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
} from "../config/chains.ts";
import {
  type SupportedRpcChainId,
  createReadOnlyClient,
  resolveRpcUrl,
} from "../config/rpc.ts";
import {
  type AgentIdentityEvidence,
  type RegistryReadClient,
  D34_AGENT_TARGETS,
  countSuccessfulLiveReads,
  evidenceToJson,
  readAgentIdentities,
  sanitizeTokenUriForEvidence,
} from "../erc8004/registry.ts";
import { identityRegistryAbi } from "../erc8004/abi.ts";

function formatHuman(evidence: AgentIdentityEvidence): string {
  const uri =
    evidence.tokenURI == null
      ? "n/a"
      : sanitizeTokenUriForEvidence(evidence.tokenURI);
  return [
    `## ${evidence.networkName} agent ${evidence.agentId}`,
    `- status: ${evidence.status}`,
    `- caip2: ${evidence.caip2}`,
    `- registry: ${evidence.registryAddress}`,
    `- rpcOrigin: ${evidence.rpcOrigin}`,
    `- blockNumber: ${evidence.blockNumber ?? "n/a"}`,
    `- blockHash: ${evidence.blockHash ?? "n/a"}`,
    `- observedAt: ${evidence.observedAt}`,
    `- owner: ${evidence.owner ?? "n/a"}`,
    `- tokenURI: ${uri}`,
    `- agentWallet: ${evidence.agentWallet ?? "null"}`,
    `- agentWalletRaw: ${evidence.agentWalletRaw ?? "n/a"}`,
    evidence.error ? `- error: ${evidence.error}` : null,
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}

function toRegistryClient(
  chainId: SupportedRpcChainId,
  env: NodeJS.ProcessEnv,
): { client: RegistryReadClient; rpcOrigin: string } {
  const resolved = resolveRpcUrl(chainId, env);
  const publicClient = createReadOnlyClient(chainId, { env });
  // Structural adapter: PublicClient → RegistryReadClient
  const client: RegistryReadClient = {
    getChainId: () => publicClient.getChainId(),
    getBlockNumber: () => publicClient.getBlockNumber(),
    getBlock: (args) => publicClient.getBlock(args),
    readContract: (args) =>
      publicClient.readContract({
        address: args.address,
        abi: identityRegistryAbi,
        functionName: args.functionName,
        args: args.args,
        blockNumber: args.blockNumber,
      }),
  };
  return { client, rpcOrigin: resolved.origin };
}

export async function runReadAgents(options?: {
  readonly env?: NodeJS.ProcessEnv;
  readonly writeEvidencePath?: string | null;
  readonly now?: () => Date;
}): Promise<{
  readonly evidences: AgentIdentityEvidence[];
  readonly successCount: number;
  readonly ok: boolean;
  readonly report: string;
}> {
  const env = options?.env ?? process.env;
  const now = options?.now ?? (() => new Date());
  const observedAt = now().toISOString();

  const main = toRegistryClient(BASE_MAINNET_CHAIN_ID, env);
  const sepolia = toRegistryClient(BASE_SEPOLIA_CHAIN_ID, env);

  const evidences = await readAgentIdentities({
    targets: [...D34_AGENT_TARGETS],
    clientsByChainId: {
      [BASE_MAINNET_CHAIN_ID]: main.client,
      [BASE_SEPOLIA_CHAIN_ID]: sepolia.client,
    },
    rpcOriginsByChainId: {
      [BASE_MAINNET_CHAIN_ID]: main.rpcOrigin,
      [BASE_SEPOLIA_CHAIN_ID]: sepolia.rpcOrigin,
    },
    observedAt,
  });

  const successCount = countSuccessfulLiveReads(evidences);
  const ok = successCount > 0;

  const header = [
    "# AgentHire registry reads (D3.4)",
    "Mode: READ_ONLY / NO_SIGNING",
    `schemaVersion: 1.0`,
    `targets: ${D34_AGENT_TARGETS.length}`,
    `successfulLiveReads: ${successCount}`,
    `overall: ${ok ? "PASS" : "FAIL"}`,
    "",
  ].join("\n");

  const body = evidences.map(formatHuman).join("\n\n");
  const jsonBlock = evidences.map((e) => evidenceToJson(e)).join("\n\n");
  const report = `${header}${body}\n\n--- JSON evidence ---\n${jsonBlock}\n`;

  if (options?.writeEvidencePath) {
    mkdirSync(dirname(options.writeEvidencePath), { recursive: true });
    writeFileSync(
      options.writeEvidencePath,
      `${JSON.stringify(
        {
          schemaVersion: "1.0",
          mode: "READ_ONLY / NO_SIGNING",
          capturedAt: observedAt,
          source: "live-rpc",
          successfulLiveReads: successCount,
          evidences,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  return { evidences, successCount, ok, report };
}

async function main(): Promise<void> {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const evidencePath = join(repoRoot, "docs/evidence/registry-reads.json");
  const { ok, report } = await runReadAgents({
    writeEvidencePath: evidencePath,
  });
  process.stdout.write(report);
  process.exitCode = ok ? 0 : 1;
}

const isDirectRun =
  process.argv[1] != null &&
  (process.argv[1].endsWith("read-agents.ts") ||
    process.argv[1].endsWith("read-agents.js"));

if (isDirectRun) {
  main().catch((error) => {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    process.stderr.write(`read-agents fatal: ${message}\n`);
    process.exitCode = 1;
  });
}

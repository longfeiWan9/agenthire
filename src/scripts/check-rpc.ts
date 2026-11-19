/**
 * CLI: read-only Base Mainnet + Base Sepolia RPC connectivity checks (D3.3).
 *
 * Usage: pnpm check:rpc
 * Exit: nonzero if any required check is failed or inconclusive.
 *
 * READ_ONLY / NO_SIGNING — PublicClient only; no wallet / tx / deploy.
 */

import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  agentHireNetworks,
} from "../config/chains.ts";
import {
  type RpcConnectivityEvidence,
  type SupportedRpcChainId,
  asReadOnlyRpcReader,
  checkRpcConnectivity,
  createReadOnlyClient,
  evidenceToJson,
  requiredChecksPassed,
  resolveRpcUrl,
  sanitizeRpcOrigin,
} from "../config/rpc.ts";

function formatHumanReport(evidence: RpcConnectivityEvidence): string {
  const lines: string[] = [];
  lines.push(`## ${evidence.networkName} (${evidence.caip2})`);
  lines.push(`- status: ${evidence.status}`);
  lines.push(`- rpcOrigin: ${evidence.rpcOrigin}`);
  lines.push(`- observedAt: ${evidence.observedAt}`);
  lines.push(
    `- chainId: expected=${evidence.checks.chainId.expected} actual=${evidence.checks.chainId.actual ?? "n/a"} ok=${evidence.checks.chainId.ok}`,
  );
  lines.push(
    `- latestBlock: number=${evidence.checks.latestBlock.number ?? "n/a"} hash=${evidence.checks.latestBlock.hash ?? "n/a"} timestamp=${evidence.checks.latestBlock.timestamp ?? "n/a"} ok=${evidence.checks.latestBlock.ok}`,
  );
  lines.push(
    `- registryBytecode: address=${evidence.checks.registryBytecode.address} hasCode=${evidence.checks.registryBytecode.hasCode} byteLength=${evidence.checks.registryBytecode.bytecodeByteLength ?? "n/a"} prefix=${evidence.checks.registryBytecode.bytecodePrefix ?? "n/a"} ok=${evidence.checks.registryBytecode.ok}`,
  );
  if (evidence.error) {
    lines.push(`- error: ${evidence.error}`);
  }
  return lines.join("\n");
}

export async function runRpcConnectivityChecks(options?: {
  readonly chainIds?: readonly SupportedRpcChainId[];
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
}): Promise<{
  readonly evidences: RpcConnectivityEvidence[];
  readonly ok: boolean;
  readonly report: string;
}> {
  const chainIds =
    options?.chainIds ??
    ([BASE_MAINNET_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID] as const);
  const env = options?.env ?? process.env;
  const now = options?.now ?? (() => new Date());

  const evidences: RpcConnectivityEvidence[] = [];

  for (const chainId of chainIds) {
    const network = agentHireNetworks.find((n) => n.chainId === chainId);
    if (!network) {
      throw new Error(`No AgentHire network configured for chain ${chainId}`);
    }

    let rpcOrigin: string;
    try {
      const resolved = resolveRpcUrl(chainId, env);
      rpcOrigin = resolved.origin;
      const client = createReadOnlyClient(chainId, { env });
      const evidence = await checkRpcConnectivity({
        chainId,
        reader: asReadOnlyRpcReader(client),
        rpcOrigin,
        observedAt: now().toISOString(),
        network,
      });
      evidences.push(evidence);
    } catch (error) {
      rpcOrigin = sanitizeRpcOrigin(
        typeof env[
          chainId === BASE_MAINNET_CHAIN_ID
            ? "BASE_MAINNET_RPC_URL"
            : "BASE_SEPOLIA_RPC_URL"
        ] === "string"
          ? (env[
              chainId === BASE_MAINNET_CHAIN_ID
                ? "BASE_MAINNET_RPC_URL"
                : "BASE_SEPOLIA_RPC_URL"
            ] as string)
          : "https://invalid.invalid",
      );
      const message =
        error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      evidences.push({
        schemaVersion: "1.0",
        chainId,
        caip2: network.caip2,
        networkName: network.name,
        rpcOrigin,
        status: "failed",
        observedAt: now().toISOString(),
        checks: {
          chainId: {
            expected: chainId,
            actual: null,
            ok: false,
            error: message,
          },
          latestBlock: {
            number: null,
            hash: null,
            timestamp: null,
            ok: false,
            error: message,
          },
          registryBytecode: {
            address: network.identityRegistry,
            hasCode: false,
            bytecodePrefix: null,
            bytecodeByteLength: null,
            ok: false,
            error: message,
          },
        },
        error: message,
      });
    }
  }

  const ok = evidences.every(requiredChecksPassed);
  const header = [
    "# AgentHire RPC connectivity (D3.3)",
    `Mode: READ_ONLY / NO_SIGNING`,
    `schemaVersion: 1.0`,
    `overall: ${ok ? "PASS" : "FAIL"}`,
    "",
  ].join("\n");

  const body = evidences.map(formatHumanReport).join("\n\n");
  const jsonBlock = evidences
    .map((e) => evidenceToJson(e))
    .join("\n\n");

  const report = `${header}${body}\n\n--- JSON evidence ---\n${jsonBlock}\n`;
  return { evidences, ok, report };
}

async function main(): Promise<void> {
  const { ok, report } = await runRpcConnectivityChecks();
  process.stdout.write(report);
  process.exitCode = ok ? 0 : 1;
}

const isDirectRun =
  process.argv[1] != null &&
  (process.argv[1].endsWith("check-rpc.ts") ||
    process.argv[1].endsWith("check-rpc.js"));

if (isDirectRun) {
  main().catch((error) => {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    process.stderr.write(`check-rpc fatal: ${message}\n`);
    process.exitCode = 1;
  });
}

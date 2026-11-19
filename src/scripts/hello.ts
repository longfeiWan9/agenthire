/**
 * D3.1 bootstrap smoke script.
 * READ_ONLY / NO_SIGNING — no network, keys, wallets, or chain writes.
 */

export const PROJECT_NAME = "AgentHire";
export const MODE = "READ_ONLY" as const;

export type HelloInfo = {
  project: string;
  nodeVersion: string;
  mode: typeof MODE;
};

/** Pure hello payload for tests and CLI. */
export function getHelloInfo(nodeVersion: string = process.version): HelloInfo {
  return {
    project: PROJECT_NAME,
    nodeVersion,
    mode: MODE,
  };
}

export function formatHello(info: HelloInfo = getHelloInfo()): string {
  return [
    `${info.project}`,
    `Node ${info.nodeVersion}`,
    `mode=${info.mode}`,
    "NO_SIGNING default — bootstrap only; no network or keys.",
  ].join("\n");
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === new URL(entry, "file://").href;
  } catch {
    return entry.replace(/\\/g, "/").endsWith("/src/scripts/hello.ts");
  }
}

if (isMainModule()) {
  console.log(formatHello());
}

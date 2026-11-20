/**
 * Immutable exact-URL allowlist for D4.3c unsigned x402 discovery inspection.
 *
 * Only XDISC-001 and XDISC-002 may be contacted. Separate from D4.2/D4.3b
 * manifests — those stay unapproved / historical. Do not expand to siblings
 * (agent-card, OpenAPI, /v1/intel, facilitators, MCP).
 */

export const X402_DISCOVERY_ALLOWLIST_VERSION = "1.0" as const;

export type X402DiscoveryTargetId = "XDISC-001" | "XDISC-002";

export type X402DiscoveryAllowlistEntry = {
  readonly id: X402DiscoveryTargetId;
  readonly provider: string;
  readonly url: string;
  readonly method: "GET";
  /** Corresponding D4.3b proposal id (authorization history only). */
  readonly priorProposalId: "PSI-001" | "PSI-002";
};

/**
 * Exactly two approved GET destinations for D4.3c.
 * One attempt each; no retries / redirects / alternate paths.
 */
export const APPROVED_X402_DISCOVERY_TARGETS = [
  {
    id: "XDISC-001",
    provider: "Agent402",
    url: "https://agent402.tools/.well-known/x402",
    method: "GET",
    priorProposalId: "PSI-001",
  },
  {
    id: "XDISC-002",
    provider: "QuantJourney",
    url: "https://agents.quantjourney.cloud/.well-known/x402",
    method: "GET",
    priorProposalId: "PSI-002",
  },
] as const satisfies readonly X402DiscoveryAllowlistEntry[];

export type ApprovedX402DiscoveryUrl =
  (typeof APPROVED_X402_DISCOVERY_TARGETS)[number]["url"];

const APPROVED_URL_SET: ReadonlySet<string> = new Set(
  APPROVED_X402_DISCOVERY_TARGETS.map((t) => t.url),
);

const BY_ID: ReadonlyMap<
  X402DiscoveryTargetId,
  X402DiscoveryAllowlistEntry
> = new Map(APPROVED_X402_DISCOVERY_TARGETS.map((t) => [t.id, t]));

const BY_URL: ReadonlyMap<string, X402DiscoveryAllowlistEntry> = new Map(
  APPROVED_X402_DISCOVERY_TARGETS.map((t) => [t.url, t]),
);

/** Exact string match only — trailing slash / query / host-only rejected. */
export function isApprovedX402DiscoveryUrl(url: string): boolean {
  return APPROVED_URL_SET.has(url);
}

export function getX402DiscoveryTargetById(
  id: string,
): X402DiscoveryAllowlistEntry | undefined {
  return BY_ID.get(id as X402DiscoveryTargetId);
}

export function getX402DiscoveryTargetByUrl(
  url: string,
): X402DiscoveryAllowlistEntry | undefined {
  return BY_URL.get(url);
}

/**
 * Structural gate for allowlisted URLs: https, exact host+path, no credentials,
 * no query, no fragment, default port only (or absent).
 */
export function assertExactX402DiscoveryDestination(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid x402 discovery URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(
      `x402 discovery URL must be https: (got ${parsed.protocol})`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error("x402 discovery URL must not embed credentials");
  }
  if (parsed.search !== "" && parsed.search !== "?") {
    throw new Error("x402 discovery URL must not include a query string");
  }
  if (parsed.hash !== "" && parsed.hash !== "#") {
    throw new Error("x402 discovery URL must not include a fragment");
  }
  if (parsed.port !== "" && parsed.port !== "443") {
    throw new Error(`x402 discovery URL unexpected port: ${parsed.port}`);
  }
  if (!isApprovedX402DiscoveryUrl(url)) {
    throw new Error(`URL not on x402 discovery allowlist: ${url}`);
  }
  const canonical = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  if (canonical !== url) {
    throw new Error(
      `x402 discovery URL is not canonical allowlist form: ${url}`,
    );
  }
  return parsed;
}

export function assertApprovedX402DiscoveryTarget(
  entry: X402DiscoveryAllowlistEntry,
): void {
  assertExactX402DiscoveryDestination(entry.url);
  const known = getX402DiscoveryTargetById(entry.id);
  if (!known || known.url !== entry.url) {
    throw new Error(`Unknown or mismatched x402 discovery target: ${entry.id}`);
  }
}

export function listApprovedX402DiscoveryTargets(): readonly X402DiscoveryAllowlistEntry[] {
  return APPROVED_X402_DISCOVERY_TARGETS;
}

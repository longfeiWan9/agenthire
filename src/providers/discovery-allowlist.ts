/**
 * Immutable exact-URL allowlist for D4.3a discovery inspection.
 *
 * Only DISC-001..004 may be contacted. Separate from D4.2 inspection-manifest
 * `approvedForNetworkExecution` flags — those stay false for historical entries.
 */

export const DISCOVERY_ALLOWLIST_VERSION = "1.0" as const;

export type DiscoveryTargetId =
  | "DISC-001"
  | "DISC-002"
  | "DISC-003"
  | "DISC-004";

export type DiscoveryDocumentKind = "agent-card" | "openapi";

export type DiscoveryAllowlistEntry = {
  readonly id: DiscoveryTargetId;
  readonly provider: string;
  readonly url: string;
  readonly documentKind: DiscoveryDocumentKind;
  readonly method: "GET";
};

/**
 * Exact four approved GET destinations only.
 * Never expand to siblings (e.g. `.well-known/x402`, `/v1/intel`).
 */
export const APPROVED_DISCOVERY_TARGETS = [
  {
    id: "DISC-001",
    provider: "Agent Zero",
    url: "https://onchainagentintel.io/.well-known/agent-card.json",
    documentKind: "agent-card",
    method: "GET",
  },
  {
    id: "DISC-002",
    provider: "Agent402",
    url: "https://agent402.tools/.well-known/agent-card.json",
    documentKind: "agent-card",
    method: "GET",
  },
  {
    id: "DISC-003",
    provider: "Agent402",
    url: "https://agent402.tools/openapi.json",
    documentKind: "openapi",
    method: "GET",
  },
  {
    id: "DISC-004",
    provider: "QuantJourney",
    url: "https://agents.quantjourney.cloud/.well-known/agent-card.json",
    documentKind: "agent-card",
    method: "GET",
  },
] as const satisfies readonly DiscoveryAllowlistEntry[];

export type ApprovedDiscoveryUrl =
  (typeof APPROVED_DISCOVERY_TARGETS)[number]["url"];

const APPROVED_URL_SET: ReadonlySet<string> = new Set(
  APPROVED_DISCOVERY_TARGETS.map((t) => t.url),
);

const BY_ID: ReadonlyMap<DiscoveryTargetId, DiscoveryAllowlistEntry> = new Map(
  APPROVED_DISCOVERY_TARGETS.map((t) => [t.id, t]),
);

const BY_URL: ReadonlyMap<string, DiscoveryAllowlistEntry> = new Map(
  APPROVED_DISCOVERY_TARGETS.map((t) => [t.url, t]),
);

/** Exact string match only — trailing slash / query / host-only rejected. */
export function isApprovedDiscoveryUrl(url: string): boolean {
  return APPROVED_URL_SET.has(url);
}

export function getDiscoveryTargetById(
  id: string,
): DiscoveryAllowlistEntry | undefined {
  return BY_ID.get(id as DiscoveryTargetId);
}

export function getDiscoveryTargetByUrl(
  url: string,
): DiscoveryAllowlistEntry | undefined {
  return BY_URL.get(url);
}

/**
 * Structural gate for allowlisted URLs: https, exact host+path, no credentials,
 * no query, no fragment, default port only (or absent).
 */
export function assertExactDiscoveryDestination(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid discovery URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Discovery URL must be https: (got ${parsed.protocol})`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("Discovery URL must not embed credentials");
  }
  if (parsed.search !== "" && parsed.search !== "?") {
    throw new Error("Discovery URL must not include a query string");
  }
  if (parsed.hash !== "" && parsed.hash !== "#") {
    throw new Error("Discovery URL must not include a fragment");
  }
  if (parsed.port !== "" && parsed.port !== "443") {
    throw new Error(`Discovery URL unexpected port: ${parsed.port}`);
  }
  if (!isApprovedDiscoveryUrl(url)) {
    throw new Error(`URL not on discovery allowlist: ${url}`);
  }
  // Re-check exact serialization equals allowlist entry (reject odd encodings).
  const canonical = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  if (canonical !== url) {
    throw new Error(`Discovery URL is not canonical allowlist form: ${url}`);
  }
  return parsed;
}

export function assertApprovedDiscoveryTarget(
  entry: DiscoveryAllowlistEntry,
): void {
  assertExactDiscoveryDestination(entry.url);
  const known = getDiscoveryTargetById(entry.id);
  if (!known || known.url !== entry.url) {
    throw new Error(`Unknown or mismatched discovery target: ${entry.id}`);
  }
}

export function listApprovedDiscoveryTargets(): readonly DiscoveryAllowlistEntry[] {
  return APPROVED_DISCOVERY_TARGETS;
}

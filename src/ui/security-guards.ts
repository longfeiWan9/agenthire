/**
 * D5.6 UI security guards — fail closed on SSRF / file / secrets / markers.
 */

import { isSafeCapabilityId } from "./catalog-store.ts";

const FORBIDDEN_PATH_FRAGMENTS = [
  "openapi-001-live-attempt.marker",
  "CATALOG-001",
  ".env",
  "private_key",
  "PRIVATE_KEY",
  "mnemonic",
] as const;

/** Reject user-supplied absolute/relative file paths for server reads. */
export function isForbiddenUserPath(value: string): boolean {
  if (!value) return true;
  if (value.includes("\0")) return true;
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return true;
  if (value.includes("..")) return true;
  for (const frag of FORBIDDEN_PATH_FRAGMENTS) {
    if (value.includes(frag)) return true;
  }
  return false;
}

/** Reject user-supplied provider URLs — UI must not fetch them. */
export function isUserSuppliedProviderUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    v.startsWith("http://") ||
    v.startsWith("https://") ||
    v.startsWith("ws://") ||
    v.startsWith("wss://") ||
    v.startsWith("//")
  );
}

export function assertSafeCapabilityRouteParam(
  capabilityId: string,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (!isSafeCapabilityId(capabilityId)) {
    return {
      ok: false,
      reason: "Unsafe capability id — path separators and traversal rejected",
    };
  }
  if (isUserSuppliedProviderUrl(capabilityId)) {
    return { ok: false, reason: "Capability id must not be a URL" };
  }
  return { ok: true };
}

/**
 * Static audit helpers for tests — UI modules must not open arbitrary
 * network or file surfaces from user input.
 */
export const UI_SECURITY_POLICY = {
  mode: "STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_SERVICE_EXECUTION",
  allowLocalBrowserToLocalNext: true,
  allowProviderHttp: false,
  allowDns: false,
  allowRpc: false,
  allowWebSocket: false,
  allowUserFileReads: false,
  allowUserProviderUrls: false,
  allowMarkerReuse: false,
  allowB4Mutation: false,
  allowSyntheticToVerifiedPromotion: false,
  allowExternalFontsCdn: false,
  allowAnalyticsScripts: false,
} as const;

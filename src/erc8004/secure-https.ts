/**
 * Connection-time pinned HTTPS fetch for AgentHire (D3.5).
 *
 * Security posture:
 * - TLS verify ON (rejectUnauthorized: true)
 * - No redirects
 * - DNS resolve → reject private / loopback / link-local / special-use IPs
 * - Pin validated IP at connection time (custom lookup; not naive fetch)
 * - 10s timeout, 256 KiB streaming body limit
 * - No cookies / credentials
 * - One transient retry (caller-controlled)
 */

import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import type { IncomingMessage } from "node:http";

export const SECURE_FETCH_TIMEOUT_MS = 10_000;
export const SECURE_FETCH_MAX_BYTES = 256 * 1024;
export const SECURE_FETCH_MAX_CONCURRENCY = 2;
export const SECURE_FETCH_TRANSIENT_RETRIES = 1;

export type SecureFetchErrorClass =
  | "invalidUrl"
  | "dns"
  | "blockedIp"
  | "redirect"
  | "tls"
  | "timeout"
  | "oversized"
  | "httpError"
  | "connection"
  | "transient"
  | "unknown";

export class SecureFetchError extends Error {
  readonly errorClass: SecureFetchErrorClass;
  readonly retryable: boolean;

  constructor(
    errorClass: SecureFetchErrorClass,
    message: string,
    options?: { readonly retryable?: boolean; readonly cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "SecureFetchError";
    this.errorClass = errorClass;
    this.retryable = options?.retryable ?? false;
  }
}

export type ResolvedAddress = {
  readonly address: string;
  readonly family: 4 | 6;
};

export type SecureHttpsSuccess = {
  readonly ok: true;
  readonly url: string;
  readonly finalUrl: string;
  readonly statusCode: number;
  readonly contentType: string | null;
  readonly body: Buffer;
  readonly sha256: string;
  readonly byteLength: number;
  readonly resolvedAddresses: readonly ResolvedAddress[];
  readonly pinnedAddress: ResolvedAddress;
  readonly elapsedMs: number;
};

export type DnsLookupFn = (hostname: string) => Promise<readonly ResolvedAddress[]>;

export type HttpsRequestFn = typeof https.request;

export type SecureHttpsDeps = {
  readonly lookup?: DnsLookupFn;
  readonly request?: HttpsRequestFn;
  readonly now?: () => number;
};

/** Parse dotted IPv4 into 32-bit unsigned int; null if invalid. */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    // Reject leading zeros that change meaning (e.g. octal-looking) except "0".
    if (part.length > 1 && part.startsWith("0")) return null;
    value = (value << 8) + n;
  }
  return value >>> 0;
}

function inCidrV4(ipInt: number, base: string, prefix: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt == null) return false;
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffff_ffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** Expand a single IPv6 address to eight 16-bit groups (no dotted IPv4 form). */
export function expandIpv6(ip: string): number[] | null {
  let input = ip.toLowerCase();
  if (input.startsWith("[") && input.endsWith("]")) {
    input = input.slice(1, -1);
  }
  // Strip zone id (fe80::1%eth0)
  const zone = input.indexOf("%");
  if (zone !== -1) input = input.slice(0, zone);

  // Convert trailing dotted IPv4 (e.g. ::ffff:127.0.0.1) into two hextets.
  if (input.includes(".")) {
    const lastColon = input.lastIndexOf(":");
    if (lastColon === -1) return null;
    const v4 = ipv4ToInt(input.slice(lastColon + 1));
    if (v4 == null) return null;
    const head = input.slice(0, lastColon);
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    return expandIpv6(`${head}:${hi}:${lo}`);
  }

  const sides = input.split("::");
  if (sides.length > 2) return null;

  const parseSide = (side: string): number[] => {
    if (side === "") return [];
    return side.split(":").map((h) => {
      if (!/^[0-9a-f]{1,4}$/i.test(h)) return Number.NaN;
      return Number.parseInt(h, 16);
    });
  };

  if (sides.length === 1) {
    const groups = parseSide(sides[0]!);
    if (groups.length !== 8 || groups.some((g) => Number.isNaN(g))) return null;
    return groups;
  }

  const left = parseSide(sides[0]!);
  const right = parseSide(sides[1]!);
  if (left.some((g) => Number.isNaN(g)) || right.some((g) => Number.isNaN(g))) {
    return null;
  }
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function extractIpv4Mapped(ip: string): string | null {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const m = lower.match(/:ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (m) return m[1]!;
  const hex = lower.match(/:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = Number.parseInt(hex[1]!, 16);
    const lo = Number.parseInt(hex[2]!, 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

/**
 * Returns true when the address must not be contacted (SSRF surface).
 * Covers loopback, RFC1918, link-local, CGNAT, multicast, unspecified,
 * documentation ranges, IPv6 ULA / link-local / multicast / mapped privates.
 */
export function isBlockedIpAddress(address: string): boolean {
  const trimmed = address.trim().toLowerCase();
  if (!trimmed) return true;

  if (net.isIPv4(trimmed)) {
    const ipInt = ipv4ToInt(trimmed);
    if (ipInt == null) return true;
    if (inCidrV4(ipInt, "0.0.0.0", 8)) return true; // "this" network
    if (inCidrV4(ipInt, "10.0.0.0", 8)) return true;
    if (inCidrV4(ipInt, "127.0.0.0", 8)) return true;
    if (inCidrV4(ipInt, "169.254.0.0", 16)) return true;
    if (inCidrV4(ipInt, "172.16.0.0", 12)) return true;
    if (inCidrV4(ipInt, "192.168.0.0", 16)) return true;
    if (inCidrV4(ipInt, "100.64.0.0", 10)) return true; // CGNAT
    if (inCidrV4(ipInt, "192.0.0.0", 24)) return true; // IETF protocol assignments
    if (inCidrV4(ipInt, "192.0.2.0", 24)) return true; // TEST-NET-1
    if (inCidrV4(ipInt, "198.51.100.0", 24)) return true; // TEST-NET-2
    if (inCidrV4(ipInt, "203.0.113.0", 24)) return true; // TEST-NET-3
    if (inCidrV4(ipInt, "198.18.0.0", 15)) return true; // benchmarking
    if (inCidrV4(ipInt, "224.0.0.0", 4)) return true; // multicast
    if (inCidrV4(ipInt, "240.0.0.0", 4)) return true; // reserved
    if (trimmed === "255.255.255.255") return true;
    return false;
  }

  if (net.isIPv6(trimmed)) {
    const mapped = extractIpv4Mapped(trimmed);
    if (mapped) return isBlockedIpAddress(mapped);

    const groups = expandIpv6(trimmed);
    if (!groups) return true;

    // :: and ::1
    if (groups.every((g) => g === 0)) return true;
    if (
      groups[0] === 0 &&
      groups[1] === 0 &&
      groups[2] === 0 &&
      groups[3] === 0 &&
      groups[4] === 0 &&
      groups[5] === 0 &&
      groups[6] === 0 &&
      groups[7] === 1
    ) {
      return true;
    }

    // fe80::/10 link-local
    if ((groups[0]! & 0xffc0) === 0xfe80) return true;
    // fc00::/7 unique local
    if ((groups[0]! & 0xfe00) === 0xfc00) return true;
    // ff00::/8 multicast
    if ((groups[0]! & 0xff00) === 0xff00) return true;
    // 2001:db8::/32 documentation
    if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;

    return false;
  }

  return true;
}

export async function defaultDnsLookup(
  hostname: string,
): Promise<readonly ResolvedAddress[]> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => ({
    address: r.address,
    family: (r.family === 6 ? 6 : 4) as 4 | 6,
  }));
}

export function assertHttpsUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (cause) {
    throw new SecureFetchError("invalidUrl", `Invalid URL: ${raw}`, { cause });
  }
  if (parsed.protocol !== "https:") {
    throw new SecureFetchError(
      "invalidUrl",
      `Only https: URLs are allowed (got ${parsed.protocol})`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new SecureFetchError(
      "invalidUrl",
      "URLs must not embed credentials",
    );
  }
  if (!parsed.hostname) {
    throw new SecureFetchError("invalidUrl", "URL missing hostname");
  }
  // Literal IP hostnames are rejected at allowlist time for our use-case;
  // still block if someone bypasses allowlist with a raw IP host.
  if (net.isIP(parsed.hostname)) {
    if (isBlockedIpAddress(parsed.hostname)) {
      throw new SecureFetchError(
        "blockedIp",
        `Blocked literal IP host: ${parsed.hostname}`,
      );
    }
  }
  return parsed;
}

export function selectPinnedAddress(
  addresses: readonly ResolvedAddress[],
): ResolvedAddress {
  if (addresses.length === 0) {
    throw new SecureFetchError("dns", "DNS returned no addresses");
  }
  const allowed = addresses.filter((a) => !isBlockedIpAddress(a.address));
  if (allowed.length === 0) {
    throw new SecureFetchError(
      "blockedIp",
      `All resolved addresses are blocked: ${addresses
        .map((a) => a.address)
        .join(", ")}`,
    );
  }
  // Prefer IPv4 for simpler pinning; fall back to first allowed.
  return allowed.find((a) => a.family === 4) ?? allowed[0]!;
}

function classifyNodeError(error: unknown): SecureFetchError {
  if (error instanceof SecureFetchError) return error;

  const err = error as NodeJS.ErrnoException & {
    code?: string;
    reason?: string;
  };
  const code = err?.code ?? "";
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  const lower = `${code} ${message}`.toLowerCase();

  if (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "EPIPE" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    lower.includes("socket hang up")
  ) {
    const retryable =
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      code === "EAI_AGAIN" ||
      lower.includes("socket hang up");
    return new SecureFetchError(
      code === "ENOTFOUND" || code === "EAI_AGAIN" ? "dns" : "connection",
      message,
      { retryable, cause: error },
    );
  }

  if (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    lower.includes("timeout")
  ) {
    return new SecureFetchError("timeout", message, {
      retryable: true,
      cause: error,
    });
  }

  if (
    code === "CERT_HAS_EXPIRED" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    code === "CERT_UNTRUSTED" ||
    lower.includes("certificate") ||
    lower.includes("ssl") ||
    lower.includes("tls")
  ) {
    return new SecureFetchError("tls", message, { cause: error });
  }

  return new SecureFetchError("unknown", message, { cause: error });
}

function readBodyWithLimit(
  res: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const fail = (error: SecureFetchError) => {
      if (settled) return;
      settled = true;
      res.destroy();
      reject(error);
    };

    res.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      total += buf.length;
      if (total > maxBytes) {
        fail(
          new SecureFetchError(
            "oversized",
            `Response exceeded ${maxBytes} byte limit`,
          ),
        );
        return;
      }
      chunks.push(buf);
    });

    res.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks, total));
    });

    res.on("error", (error) => {
      fail(classifyNodeError(error));
    });
  });
}

/**
 * Perform one HTTPS GET with DNS validation + connection-time IP pinning.
 * Does not follow redirects. Does not send cookies or credentials.
 */
export async function secureHttpsGet(
  rawUrl: string,
  deps: SecureHttpsDeps = {},
): Promise<SecureHttpsSuccess> {
  const url = assertHttpsUrl(rawUrl);
  const lookup = deps.lookup ?? defaultDnsLookup;
  const request = deps.request ?? https.request;
  const now = deps.now ?? (() => Date.now());
  const started = now();

  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await lookup(url.hostname);
  } catch (error) {
    throw classifyNodeError(error);
  }

  const pinned = selectPinnedAddress(addresses);
  // Dial the validated IP directly. TLS SNI + Host header keep the logical
  // hostname for certificate verification — this is connection-time pinning,
  // not a post-connect DNS re-check on a naive global fetch.
  const hostHeader = url.port ? `${url.hostname}:${url.port}` : url.hostname;

  return new Promise<SecureHttpsSuccess>((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof SecureFetchError ? error : classifyNodeError(error));
    };

    const req = request(
      {
        protocol: "https:",
        host: pinned.address,
        servername: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        family: pinned.family,
        rejectUnauthorized: true,
        timeout: SECURE_FETCH_TIMEOUT_MS,
        headers: {
          Host: hostHeader,
          Accept: "application/json, text/plain;q=0.9, */*;q=0.1",
          "User-Agent": "AgentHire-registration-metadata/0.1 (READ_ONLY)",
          Connection: "close",
          // Explicitly omit Cookie / Authorization.
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          finish(
            new SecureFetchError(
              "redirect",
              `Refusing redirect (${status}) to ${res.headers.location ?? "(none)"}`,
            ),
          );
          return;
        }

        void readBodyWithLimit(res, SECURE_FETCH_MAX_BYTES)
          .then((body) => {
            if (settled) return;
            if (status < 200 || status >= 300) {
              finish(
                new SecureFetchError(
                  "httpError",
                  `HTTP ${status} for ${url.toString()}`,
                ),
              );
              return;
            }
            const contentTypeHeader = res.headers["content-type"];
            const contentType =
              typeof contentTypeHeader === "string"
                ? contentTypeHeader
                : Array.isArray(contentTypeHeader)
                  ? (contentTypeHeader[0] ?? null)
                  : null;
            const sha256 = createHash("sha256").update(body).digest("hex");
            settled = true;
            resolve({
              ok: true,
              url: rawUrl,
              finalUrl: url.toString(),
              statusCode: status,
              contentType,
              body,
              sha256,
              byteLength: body.length,
              resolvedAddresses: addresses,
              pinnedAddress: pinned,
              elapsedMs: now() - started,
            });
          })
          .catch(finish);
      },
    );

    req.setTimeout(SECURE_FETCH_TIMEOUT_MS, () => {
      req.destroy(
        new SecureFetchError("timeout", `Request timed out after ${SECURE_FETCH_TIMEOUT_MS}ms`, {
          retryable: true,
        }),
      );
    });

    req.on("error", finish);
    req.end();
  });
}

/**
 * Secure GET with a single retry on transient failures.
 */
export async function secureHttpsGetWithRetry(
  rawUrl: string,
  deps: SecureHttpsDeps = {},
  retries: number = SECURE_FETCH_TRANSIENT_RETRIES,
): Promise<SecureHttpsSuccess> {
  let attempt = 0;
  for (;;) {
    try {
      return await secureHttpsGet(rawUrl, deps);
    } catch (error) {
      const classified =
        error instanceof SecureFetchError ? error : classifyNodeError(error);
      if (classified.retryable && attempt < retries) {
        attempt += 1;
        continue;
      }
      if (classified.retryable) {
        throw new SecureFetchError(
          "transient",
          classified.message,
          { cause: classified },
        );
      }
      throw classified;
    }
  }
}

/** Simple concurrency limiter (max parallel workers). */
export function createConcurrencyLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const pump = () => {
    while (active < max && queue.length > 0) {
      active += 1;
      const next = queue.shift()!;
      next();
    }
  };

  return async function runLimited<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      pump();
    });
    try {
      return await fn();
    } finally {
      active -= 1;
      pump();
    }
  };
}

/**
 * Offline x402 v2 unsigned challenge parser (D4.3b).
 *
 * Pure functions over captured/synthetic HTTP 402 fixtures.
 * Zero DNS / HTTP / signing / settlement.
 */

import { isAddress, getAddress } from "viem";
import type {
  AcceptEntryDiagnostic,
  ChallengeParseFailureReason,
  ChallengeParseResult,
  ParsedPaymentRequired,
  ParsedPaymentRequirement,
} from "./challenge-types.ts";
import { APPROVED_X402_VERSION } from "./challenge-types.ts";

const PAYMENT_REQUIRED_HEADER_NAMES = [
  "payment-required",
  "PAYMENT-REQUIRED",
  "Payment-Required",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function headerValue(
  headers: Record<string, string | string[] | undefined> | null | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  for (const [key, raw] of Object.entries(headers)) {
    if (key.toLowerCase() !== lower) continue;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string" && item.trim().length > 0) {
          return item.trim();
        }
      }
    }
  }
  return null;
}

function findPaymentRequiredHeader(
  headers: Record<string, string | string[] | undefined> | null | undefined,
): string | null {
  for (const name of PAYMENT_REQUIRED_HEADER_NAMES) {
    const value = headerValue(headers, name);
    if (value) return value;
  }
  // Case-insensitive sweep for any payment-required variant.
  if (!headers) return null;
  for (const [key, raw] of Object.entries(headers)) {
    if (key.toLowerCase() !== "payment-required") continue;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string" && item.trim()) return item.trim();
      }
    }
  }
  return null;
}

/**
 * Decode base64 or base64url PAYMENT-REQUIRED payloads.
 * Fail closed on empty / non-alphabet input.
 */
export function decodePaymentRequiredPayload(
  encoded: string,
): { readonly ok: true; readonly bytes: Buffer } | { readonly ok: false } {
  const compact = encoded.trim().replace(/\s+/g, "");
  if (!compact) return { ok: false };

  // Reject characters outside base64 / base64url alphabet.
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(compact)) return { ok: false };

  const asStandard = compact.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (asStandard.length % 4)) % 4;
  const padded = asStandard + "=".repeat(padLen);

  try {
    const bytes = Buffer.from(padded, "base64");
    if (bytes.length === 0) return { ok: false };
    return { ok: true, bytes };
  } catch {
    return { ok: false };
  }
}

function fail(
  fixtureKind: "synthetic" | "captured",
  httpStatus: number | null,
  reason: ChallengeParseFailureReason,
  message: string,
  entryDiagnostics?: readonly AcceptEntryDiagnostic[],
): ChallengeParseResult {
  return {
    ok: false,
    fixtureKind,
    httpStatus,
    reason,
    message,
    ...(entryDiagnostics ? { entryDiagnostics } : {}),
  };
}

/** Coarse family hint for diagnostics only — never a payment decision. */
export function inferAcceptAssetFamily(input: {
  readonly network?: unknown;
  readonly asset?: unknown;
}): AcceptEntryDiagnostic["assetFamily"] {
  const network =
    typeof input.network === "string" ? input.network.trim().toLowerCase() : "";
  if (network.startsWith("eip155:")) return "evm";
  if (network.startsWith("solana:")) return "solana";
  if (network.startsWith("stellar:")) return "stellar";
  if (network.startsWith("algorand:")) return "algorand";
  const asset = typeof input.asset === "string" ? input.asset.trim() : "";
  if (/^0x[0-9a-fA-F]{40}$/.test(asset)) return "evm";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(asset) && !asset.startsWith("0x")) {
    return "solana";
  }
  if (/^[0-9]+$/.test(asset)) return "algorand";
  if (asset.length >= 56 && /^[A-Z0-9]+$/.test(asset)) return "stellar";
  return network || asset ? "unknown" : null;
}

function parseAmount(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
      return null;
    }
    return String(value);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  // Reject empty / leading zeros issues only for empty; "0" is valid.
  if (trimmed.length === 0) return null;
  return trimmed;
}

function parseAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!isAddress(trimmed, { strict: false })) return null;
  try {
    return getAddress(trimmed);
  } catch {
    return null;
  }
}

function parseNetwork(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Accept CAIP-2 style and known aliases without inventing mappings in parse.
  return trimmed;
}

function parseScheme(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseMaxTimeout(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
      return undefined; // signal malformed
    }
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    const n = Number(value.trim());
    if (!Number.isSafeInteger(n)) return undefined;
    return n;
  }
  return undefined;
}

function parseRequirement(
  entry: unknown,
  index: number,
):
  | { readonly ok: true; readonly requirement: ParsedPaymentRequirement }
  | { readonly ok: false; readonly reason: ChallengeParseFailureReason; readonly message: string } {
  if (!isPlainObject(entry)) {
    return {
      ok: false,
      reason: "malformedAcceptsEntry",
      message: `accepts[${index}] is not an object`,
    };
  }

  const rawKeys = Object.keys(entry).sort();
  const scheme = parseScheme(entry.scheme);
  if (!scheme) {
    return {
      ok: false,
      reason: "invalidScheme",
      message: `accepts[${index}].scheme missing or invalid`,
    };
  }

  const network = parseNetwork(entry.network);
  if (!network) {
    return {
      ok: false,
      reason: "invalidNetwork",
      message: `accepts[${index}].network missing or invalid`,
    };
  }

  const asset = parseAddress(entry.asset);
  if (!asset) {
    return {
      ok: false,
      reason: "invalidAsset",
      message: `accepts[${index}].asset missing or not an EVM address`,
    };
  }

  const amountRaw =
    entry.maxAmountRequired !== undefined
      ? entry.maxAmountRequired
      : entry.amount;
  const amount = parseAmount(amountRaw);
  if (!amount) {
    return {
      ok: false,
      reason: "invalidAmount",
      message: `accepts[${index}] amount/maxAmountRequired missing or invalid`,
    };
  }

  const payTo = parseAddress(entry.payTo);
  if (!payTo) {
    return {
      ok: false,
      reason: "invalidPayTo",
      message: `accepts[${index}].payTo missing or not an EVM address`,
    };
  }

  const maxTimeout = parseMaxTimeout(entry.maxTimeoutSeconds);
  if (maxTimeout === undefined) {
    return {
      ok: false,
      reason: "malformedAcceptsEntry",
      message: `accepts[${index}].maxTimeoutSeconds malformed`,
    };
  }

  const extra = entry.extra;
  const extraKeys =
    isPlainObject(extra) ? Object.keys(extra).sort() : ([] as string[]);
  const assetTransferMethod =
    isPlainObject(extra) &&
    typeof extra.assetTransferMethod === "string" &&
    extra.assetTransferMethod.trim()
      ? extra.assetTransferMethod.trim()
      : null;

  const resource =
    typeof entry.resource === "string" && entry.resource.trim()
      ? entry.resource.trim()
      : null;
  const description =
    typeof entry.description === "string" ? entry.description : null;
  const mimeType =
    typeof entry.mimeType === "string" && entry.mimeType.trim()
      ? entry.mimeType.trim()
      : null;

  return {
    ok: true,
    requirement: {
      scheme,
      network,
      asset,
      amount,
      payTo,
      resource,
      description,
      mimeType,
      maxTimeoutSeconds: maxTimeout,
      outputSchemaPresent: entry.outputSchema !== undefined && entry.outputSchema !== null,
      assetTransferMethod,
      extraKeys,
      rawKeys,
    },
  };
}

/**
 * Parse an already-decoded Payment Required object (protocol parse only).
 */
export function parsePaymentRequiredObject(
  value: unknown,
  options?: {
    readonly fixtureKind?: "synthetic" | "captured";
    readonly httpStatus?: number | null;
    readonly source?: ParsedPaymentRequired["source"];
  },
): ChallengeParseResult {
  const fixtureKind = options?.fixtureKind ?? "synthetic";
  const httpStatus = options?.httpStatus ?? null;
  const source = options?.source ?? "object";

  if (!isPlainObject(value)) {
    return fail(fixtureKind, httpStatus, "notObject", "Payment Required payload is not an object");
  }

  const rawTopLevelKeys = Object.keys(value).sort();

  if (!("x402Version" in value)) {
    return fail(
      fixtureKind,
      httpStatus,
      "missingX402Version",
      "x402Version field is missing",
    );
  }

  const versionRaw = value.x402Version;
  if (typeof versionRaw !== "number" || !Number.isInteger(versionRaw)) {
    return fail(
      fixtureKind,
      httpStatus,
      "missingX402Version",
      "x402Version must be an integer",
    );
  }

  if (versionRaw !== APPROVED_X402_VERSION) {
    return fail(
      fixtureKind,
      httpStatus,
      "unsupportedX402Version",
      `x402Version ${versionRaw} is unsupported (expected ${APPROVED_X402_VERSION})`,
    );
  }

  if (!("accepts" in value)) {
    return fail(
      fixtureKind,
      httpStatus,
      "missingAccepts",
      "accepts array is missing",
    );
  }

  if (!Array.isArray(value.accepts)) {
    return fail(
      fixtureKind,
      httpStatus,
      "missingAccepts",
      "accepts must be an array",
    );
  }

  if (value.accepts.length === 0) {
    return fail(
      fixtureKind,
      httpStatus,
      "emptyAccepts",
      "accepts array is empty",
    );
  }

  // Selective fail-closed: keep EVM-parseable accepts; retain diagnostics for
  // siblings that fail (e.g. Solana/Stellar/Algorand asset shapes). Never
  // invent payment compatibility from a skipped entry. Envelope still fails
  // closed when zero accepts parse as EVM payment requirements.
  const accepts: ParsedPaymentRequirement[] = [];
  const entryDiagnostics: AcceptEntryDiagnostic[] = [];
  const warnings: string[] = [];
  let firstEntryFailure:
    | {
        readonly reason: ChallengeParseFailureReason;
        readonly message: string;
      }
    | null = null;

  for (let i = 0; i < value.accepts.length; i += 1) {
    const rawEntry = value.accepts[i];
    const schemeHint =
      isPlainObject(rawEntry) && typeof rawEntry.scheme === "string"
        ? rawEntry.scheme.trim()
        : null;
    const networkHint =
      isPlainObject(rawEntry) && typeof rawEntry.network === "string"
        ? rawEntry.network.trim()
        : null;
    const assetHint = isPlainObject(rawEntry) ? rawEntry.asset : undefined;
    const family = inferAcceptAssetFamily({
      network: networkHint,
      asset: assetHint,
    });

    const parsed = parseRequirement(rawEntry, i);
    if (!parsed.ok) {
      entryDiagnostics.push({
        index: i,
        ok: false,
        reason: parsed.reason,
        message: parsed.message,
        scheme: schemeHint,
        network: networkHint,
        assetFamily: family,
      });
      warnings.push(
        `accepts[${i}] skipped (${parsed.reason}): ${parsed.message}`,
      );
      if (!firstEntryFailure) {
        firstEntryFailure = {
          reason: parsed.reason,
          message: parsed.message,
        };
      }
      continue;
    }

    entryDiagnostics.push({
      index: i,
      ok: true,
      reason: null,
      message: null,
      scheme: parsed.requirement.scheme,
      network: parsed.requirement.network,
      assetFamily: "evm",
    });
    accepts.push(parsed.requirement);
  }

  if (accepts.length === 0) {
    return fail(
      fixtureKind,
      httpStatus,
      firstEntryFailure?.reason ?? "noEvmAcceptsParsed",
      firstEntryFailure
        ? `${firstEntryFailure.message} (no EVM-parseable accepts retained; ${entryDiagnostics.length} entr${entryDiagnostics.length === 1 ? "y" : "ies"} examined)`
        : "No EVM-parseable accepts retained",
      entryDiagnostics,
    );
  }

  const error =
    typeof value.error === "string"
      ? value.error
      : value.error === undefined || value.error === null
        ? null
        : String(value.error);

  if (source === "header" && httpStatus !== null && httpStatus !== 402) {
    warnings.push(
      `PAYMENT-REQUIRED header present but HTTP status is ${httpStatus}, not 402`,
    );
  }

  return {
    ok: true,
    fixtureKind,
    httpStatus,
    challenge: {
      x402Version: versionRaw,
      error,
      accepts,
      rawTopLevelKeys,
      source,
    },
    warnings,
    entryDiagnostics,
  };
}

export type Http402Fixture = {
  readonly fixtureKind?: "synthetic" | "captured";
  readonly httpStatus: number;
  readonly headers?: Record<string, string | string[] | undefined>;
  /** Raw response body bytes or UTF-8 string / already-parsed object. */
  readonly body?: Buffer | string | unknown;
};

/**
 * Parse an HTTP 402-style fixture: requires status 402 and a Payment Required
 * envelope from the PAYMENT-REQUIRED header and/or JSON body.
 */
export function parseHttp402Challenge(fixture: Http402Fixture): ChallengeParseResult {
  const fixtureKind = fixture.fixtureKind ?? "synthetic";
  const httpStatus = fixture.httpStatus;

  if (httpStatus !== 402) {
    return fail(
      fixtureKind,
      httpStatus,
      "notHttp402",
      `HTTP status ${httpStatus} is not 402`,
    );
  }

  const headerEncoded = findPaymentRequiredHeader(fixture.headers);
  if (headerEncoded) {
    const decoded = decodePaymentRequiredPayload(headerEncoded);
    if (!decoded.ok) {
      return fail(
        fixtureKind,
        httpStatus,
        "invalidBase64",
        "PAYMENT-REQUIRED header is not valid base64/base64url",
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(decoded.bytes.toString("utf8"));
    } catch (err) {
      return fail(
        fixtureKind,
        httpStatus,
        "invalidJson",
        `PAYMENT-REQUIRED JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return parsePaymentRequiredObject(json, {
      fixtureKind,
      httpStatus,
      source: "header",
    });
  }

  // Fall back to JSON body.
  if (fixture.body === undefined || fixture.body === null) {
    return fail(
      fixtureKind,
      httpStatus,
      "missingPaymentRequired",
      "No PAYMENT-REQUIRED header and no body",
    );
  }

  let json: unknown;
  if (Buffer.isBuffer(fixture.body) || typeof fixture.body === "string") {
    const text = Buffer.isBuffer(fixture.body)
      ? fixture.body.toString("utf8")
      : fixture.body;
    if (!text.trim()) {
      return fail(
        fixtureKind,
        httpStatus,
        "missingPaymentRequired",
        "No PAYMENT-REQUIRED header and empty body",
      );
    }
    // Body may itself be base64 of the envelope.
    const maybeB64 = decodePaymentRequiredPayload(text.trim());
    if (maybeB64.ok) {
      try {
        const asJson = JSON.parse(maybeB64.bytes.toString("utf8"));
        if (isPlainObject(asJson) && "x402Version" in asJson) {
          return parsePaymentRequiredObject(asJson, {
            fixtureKind,
            httpStatus,
            source: "body",
          });
        }
      } catch {
        // fall through to raw JSON parse
      }
    }
    try {
      json = JSON.parse(text);
    } catch (err) {
      return fail(
        fixtureKind,
        httpStatus,
        "invalidJson",
        `Body JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    json = fixture.body;
  }

  return parsePaymentRequiredObject(json, {
    fixtureKind,
    httpStatus,
    source: "body",
  });
}

/** Encode a Payment Required object as base64 for synthetic fixtures. */
export function encodePaymentRequiredBase64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

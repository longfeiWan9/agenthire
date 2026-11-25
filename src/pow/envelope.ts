/**
 * JSON validate response envelope checks for PoW submit (D7.3).
 * Expected success: { valid: true, errors: [] }.
 */

import {
  POW_EXPECTED_ENVELOPE,
  type PowExpectedEnvelope,
  type PowValidateEnvelope,
} from "./types.ts";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ParseEnvelopeResult =
  | { readonly ok: true; readonly envelope: PowValidateEnvelope }
  | { readonly ok: false; readonly message: string };

export function parseValidateEnvelope(value: unknown): ParseEnvelopeResult {
  if (!isPlainObject(value)) {
    return { ok: false, message: "Response must be a JSON object" };
  }
  if (typeof value.valid !== "boolean") {
    return { ok: false, message: 'Response must include boolean "valid"' };
  }
  if (!("errors" in value)) {
    return { ok: false, message: 'Response must include "errors" array' };
  }
  if (!Array.isArray(value.errors)) {
    return { ok: false, message: '"errors" must be an array' };
  }
  const known = new Set(["valid", "errors"]);
  const extraKeys = Object.keys(value)
    .filter((k) => !known.has(k))
    .sort();
  return {
    ok: true,
    envelope: {
      valid: value.valid,
      errors: value.errors,
      extraKeys,
    },
  };
}

export function matchesExpectedPowEnvelope(
  envelope: PowValidateEnvelope,
  expected: PowExpectedEnvelope = POW_EXPECTED_ENVELOPE,
): boolean {
  return (
    envelope.valid === expected.valid &&
    Array.isArray(envelope.errors) &&
    envelope.errors.length === expected.errors.length
  );
}

export function parseValidateEnvelopeBytes(body: Buffer): ParseEnvelopeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return { ok: false, message: "Response body is not valid JSON" };
  }
  return parseValidateEnvelope(parsed);
}

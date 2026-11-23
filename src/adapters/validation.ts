/**
 * Shared offline input validation helpers (D5.2).
 * STRICTLY_OFFLINE — no network.
 */

import type { ValidationErr, ValidationResult } from "./types.ts";

export const DRAFT_QUERY_MIN_LEN = 1 as const;
export const DRAFT_QUERY_MAX_LEN = 128 as const;

const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;
const URL_RE = /^(https?:\/\/|\/\/)/i;
const FILE_PATH_RE = /^([a-zA-Z]:[\\/]|\/|\.\.\/|\.\\)/;
const SQL_META_RE = /('|--|;|\/\*|\*\/|\b(OR|AND|UNION|SELECT|DROP|INSERT|UPDATE|DELETE)\b)/i;
const CREDENTIAL_HINT_RE =
  /\b(api[_-]?key|password|secret|bearer|private[_-]?key|0x[a-fA-F0-9]{64})\b/;

export function err(
  code: string,
  message: string,
  details?: readonly string[],
): ValidationErr {
  return details ? { ok: false, code, message, details } : { ok: false, code, message };
}

export function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

/**
 * Validate a draft public-company query string before any adapter work.
 * Rejects empty, oversized, URL-shaped, path-shaped, control, SQL, credential payloads.
 */
export function validateDraftQueryString(
  raw: unknown,
  fieldName: string,
): ValidationResult<string> {
  if (typeof raw !== "string") {
    return err("invalidType", `${fieldName} must be a string`);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return err("empty", `${fieldName} must be non-empty after trim`);
  }
  if ([...trimmed].length < DRAFT_QUERY_MIN_LEN) {
    return err("tooShort", `${fieldName} must be at least ${DRAFT_QUERY_MIN_LEN} character`);
  }
  if ([...trimmed].length > DRAFT_QUERY_MAX_LEN) {
    return err(
      "tooLong",
      `${fieldName} must be at most ${DRAFT_QUERY_MAX_LEN} Unicode characters`,
    );
  }
  if (CONTROL_CHAR_RE.test(trimmed)) {
    return err("controlCharacters", `${fieldName} must not contain control characters`);
  }
  if (URL_RE.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
    return err("urlRejected", `${fieldName} must not be a URL`);
  }
  if (FILE_PATH_RE.test(trimmed)) {
    return err("pathRejected", `${fieldName} must not be a file path`);
  }
  if (SQL_META_RE.test(trimmed)) {
    return err("sqlRejected", `${fieldName} looks like a SQL metacharacter payload`);
  }
  if (CREDENTIAL_HINT_RE.test(trimmed)) {
    return err("credentialRejected", `${fieldName} must not contain credential material`);
  }
  // Multi-issuer batch lists are disallowed until provider schema allows.
  if (trimmed.includes(",") || trimmed.includes("|") || trimmed.includes("\n")) {
    return err(
      "batchRejected",
      `${fieldName} must be a single issuer query (no batch lists)`,
    );
  }
  return ok(trimmed);
}

/** Ticker symbols: 1–10 chars, letters/digits/.- only (draft heuristic). */
export function validateTickerSymbol(raw: unknown): ValidationResult<string> {
  const base = validateDraftQueryString(raw, "ticker");
  if (!base.ok) return base;
  const value = base.value.toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.\-]{0,9}$/.test(value)) {
    return err(
      "invalidTicker",
      "ticker must be 1–10 characters of letters, digits, '.', or '-'",
    );
  }
  return ok(value);
}

/** Company name: draft query rules + at least one letter. */
export function validateCompanyName(raw: unknown): ValidationResult<string> {
  const base = validateDraftQueryString(raw, "companyName");
  if (!base.ok) return base;
  if (!/[A-Za-z]/.test(base.value)) {
    return err("invalidCompanyName", "companyName must contain at least one letter");
  }
  return ok(base.value);
}

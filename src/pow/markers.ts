/**
 * One-time PoW attempt markers (D7.3).
 *
 * Identities: POW-L3-GET-002 (before first authorized network op) and
 * POW-L3-POST-002 (only after challenge/solver/expiry gates, immediately
 * before POST). Never reset consumed Stage A / JSONVALIDATE / prior live
 * markers or historical evidence.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  POW_CHALLENGE_GET_MARKER_REL,
  POW_CHALLENGE_GET_REQUEST_ID,
  POW_CHALLENGE_URL,
  POW_SUBMIT_POST_MARKER_REL,
  POW_SUBMIT_POST_REQUEST_ID,
  POW_SUBMIT_URL,
} from "./types.ts";

export type PowMarkerKind = "challenge-get" | "submit-post";

export type PowMarkerRecord = {
  readonly schemaVersion: "1.0";
  readonly requestId:
    | typeof POW_CHALLENGE_GET_REQUEST_ID
    | typeof POW_SUBMIT_POST_REQUEST_ID;
  readonly kind: PowMarkerKind;
  readonly approvedUrl: typeof POW_CHALLENGE_URL | typeof POW_SUBMIT_URL;
  readonly method: "GET" | "POST";
  readonly writtenAt: string;
  readonly purpose: "single-use-live-attempt-guard";
  readonly note: string;
};

/** Historical markers that must never be reused or reset by PoW prep. */
export const POW_FORBIDDEN_PRIOR_MARKERS: readonly string[] = [
  "docs/day6/evidence/agent402-jsonvalidate-001-live-attempt.marker",
  "docs/day6/evidence/agent402-jsonvalidate-002-live-attempt.marker",
  "docs/day5/evidence/openapi-001-live-attempt.marker",
  "docs/day4/evidence/catalog-001-live-attempt.marker",
  "docs/day7/evidence/agent402-pow-challenge-get-001.marker",
  "docs/day7/evidence/agent402-pow-challenge-get-001-live-attempt.marker",
  "docs/day7/evidence/agent402-pow-submit-post-001-live-attempt.marker",
];

export function powMarkerRelFor(kind: PowMarkerKind): string {
  return kind === "challenge-get"
    ? POW_CHALLENGE_GET_MARKER_REL
    : POW_SUBMIT_POST_MARKER_REL;
}

export function powRequestIdFor(kind: PowMarkerKind): PowMarkerRecord["requestId"] {
  return kind === "challenge-get"
    ? POW_CHALLENGE_GET_REQUEST_ID
    : POW_SUBMIT_POST_REQUEST_ID;
}

export function absPowMarkerPath(
  repoRoot: string,
  kind: PowMarkerKind,
): string {
  return join(repoRoot, powMarkerRelFor(kind));
}

export function powMarkerExists(markerPath: string): boolean {
  return existsSync(markerPath);
}

export class PowAttemptMarkerConflictError extends Error {
  readonly code = "powAttemptMarkerConflict" as const;
  constructor(markerPath: string, kind: PowMarkerKind) {
    super(
      `${powRequestIdFor(kind)} single-use attempt marker already exists at ${markerPath}. ` +
        `Do not reset. Human renewed authorization required for a fresh marker path.`,
    );
    this.name = "PowAttemptMarkerConflictError";
  }
}

export function isForbiddenPriorMarkerPath(markerPath: string): boolean {
  const normalized = markerPath.replace(/\\/g, "/");
  return POW_FORBIDDEN_PRIOR_MARKERS.some((rel) =>
    normalized.endsWith(rel),
  );
}

/**
 * Exclusive wx create for a PoW marker. Never overwrites. Never touches
 * Stage A / JSONVALIDATE / OpenAPI / catalog / prior dual-live markers.
 */
export function writePowAttemptMarker(input: {
  readonly markerPath: string;
  readonly kind: PowMarkerKind;
  readonly writtenAt?: string;
}): PowMarkerRecord {
  const expectedRel = powMarkerRelFor(input.kind);
  const normalized = input.markerPath.replace(/\\/g, "/");
  if (!normalized.endsWith(expectedRel)) {
    throw new Error(
      `PoW marker path must end with ${expectedRel} (got ${input.markerPath})`,
    );
  }
  if (isForbiddenPriorMarkerPath(input.markerPath)) {
    throw new Error(
      "PoW must not write or reuse Stage A / JSONVALIDATE / OpenAPI / catalog / prior dual-live markers",
    );
  }

  const lifecycleNote =
    input.kind === "challenge-get"
      ? "Written immediately before the first authorized network op (GET) via exclusive wx create."
      : "Written only after challenge parse, solver success, and expiry gates pass — immediately before POST.";

  const record: PowMarkerRecord = {
    schemaVersion: "1.0",
    requestId: powRequestIdFor(input.kind),
    kind: input.kind,
    approvedUrl:
      input.kind === "challenge-get" ? POW_CHALLENGE_URL : POW_SUBMIT_URL,
    method: input.kind === "challenge-get" ? "GET" : "POST",
    writtenAt: input.writtenAt ?? new Date(0).toISOString(),
    purpose: "single-use-live-attempt-guard",
    note:
      `${lifecycleNote} Presence blocks reuse. ` +
      `${POW_CHALLENGE_GET_REQUEST_ID} is distinct from ${POW_SUBMIT_POST_REQUEST_ID}. ` +
      "Never reset historical markers or evidence.",
  };

  mkdirSync(dirname(input.markerPath), { recursive: true });
  try {
    writeFileSync(input.markerPath, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code === "EEXIST" || existsSync(input.markerPath)) {
      throw new PowAttemptMarkerConflictError(input.markerPath, input.kind);
    }
    throw error;
  }
  return record;
}

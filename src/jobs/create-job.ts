/**
 * Create HireJob drafts (D5.2) — no network, payment, or execution.
 */

import { createHash, randomUUID } from "node:crypto";
import type { HireJob, HireJobCreateRequest } from "./types.ts";
import { HIREJOB_MODE, HIREJOB_SCHEMA_VERSION } from "./types.ts";

function deterministicId(seed: string): string {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return `hirejob:${digest}`;
}

export function createHireJob(request: HireJobCreateRequest): HireJob {
  const createdAt = request.createdAt ?? new Date(0).toISOString();
  const hireJobId =
    request.hireJobId ??
    deterministicId(
      `${request.capabilityId}|${request.adapterId}|${request.taskType}@${request.taskVersion}|${JSON.stringify(request.rawInput)}|${createdAt}`,
    );

  return {
    hireJobId,
    schemaVersion: HIREJOB_SCHEMA_VERSION,
    mode: HIREJOB_MODE,
    capabilityId: request.capabilityId,
    adapterId: request.adapterId,
    taskType: request.taskType,
    taskVersion: request.taskVersion,
    status: "draft",
    createdAt,
    updatedAt: createdAt,
    rawInput: request.rawInput,
    validatedInput: null,
    blockReason: null,
    quoteReason: null,
    payment: {
      status: "notApplicable",
      parseOk: null,
      policyCompatible: null,
      paymentApprovalGranted: false,
      note: "No payment evaluation yet",
    },
    result: {
      outcomeKind: "notAttempted",
      fixtureId: null,
      providerExecutionVerified: false,
      payload: null,
      warning: "No result — live provider execution is not authorized",
    },
    history: [],
    flags: {
      approvedForNetworkExecution: false,
      executionMode: "offlineFixtureOnly",
      paidVerified: false,
    },
  };
}

/** Explicit random id helper for demos that want uniqueness without clocks. */
export function createHireJobWithRandomId(
  request: Omit<HireJobCreateRequest, "hireJobId">,
): HireJob {
  return createHireJob({ ...request, hireJobId: `hirejob:${randomUUID()}` });
}

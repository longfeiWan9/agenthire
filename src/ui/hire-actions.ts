/**
 * Server actions for the offline hire console (D5.6).
 * Local process state only — no provider network.
 */

"use server";

import type { HireJobFixtureKind } from "../jobs/types.ts";
import { assertSafeCapabilityRouteParam } from "./security-guards.ts";
import {
  attemptModifiedBindingApprove,
  configureHireInput,
  createValidatedHireJob,
  getOrCreateHireSession,
  type HireKind,
  type HireSessionSnapshot,
  listOfflineFixtureKinds,
  revealSyntheticQuote,
  revokeHireApproval,
  runNamedOfflineFixture,
  simulateApproveHire,
  simulateRejectHire,
} from "./hire-session.ts";

function guard(capabilityId: string): HireSessionSnapshot | null {
  const safe = assertSafeCapabilityRouteParam(capabilityId);
  if (!safe.ok) return null;
  return getOrCreateHireSession(capabilityId);
}

export async function actionGetHireSession(
  capabilityId: string,
): Promise<HireSessionSnapshot | null> {
  return guard(capabilityId);
}

export async function actionConfigureHire(
  capabilityId: string,
  kind: HireKind,
  value: string,
): Promise<HireSessionSnapshot | null> {
  if (!assertSafeCapabilityRouteParam(capabilityId).ok) return null;
  return configureHireInput(capabilityId, kind, value);
}

export async function actionCreateHireJob(
  capabilityId: string,
): Promise<HireSessionSnapshot | null> {
  if (!assertSafeCapabilityRouteParam(capabilityId).ok) return null;
  return createValidatedHireJob(capabilityId);
}

export async function actionRevealSyntheticQuote(
  capabilityId: string,
): Promise<HireSessionSnapshot | null> {
  if (!assertSafeCapabilityRouteParam(capabilityId).ok) return null;
  return revealSyntheticQuote(capabilityId);
}

export async function actionSimulateApprove(
  capabilityId: string,
): Promise<HireSessionSnapshot | null> {
  if (!assertSafeCapabilityRouteParam(capabilityId).ok) return null;
  return simulateApproveHire(capabilityId);
}

export async function actionSimulateReject(
  capabilityId: string,
): Promise<HireSessionSnapshot | null> {
  if (!assertSafeCapabilityRouteParam(capabilityId).ok) return null;
  return simulateRejectHire(capabilityId);
}

export async function actionModifiedBinding(
  capabilityId: string,
): Promise<HireSessionSnapshot | null> {
  if (!assertSafeCapabilityRouteParam(capabilityId).ok) return null;
  return attemptModifiedBindingApprove(capabilityId);
}

export async function actionRevokeApproval(
  capabilityId: string,
): Promise<HireSessionSnapshot | null> {
  if (!assertSafeCapabilityRouteParam(capabilityId).ok) return null;
  return revokeHireApproval(capabilityId);
}

export async function actionRunFixture(
  capabilityId: string,
  kind: HireJobFixtureKind,
): Promise<HireSessionSnapshot | null> {
  if (!assertSafeCapabilityRouteParam(capabilityId).ok) return null;
  const allowed = listOfflineFixtureKinds();
  if (!allowed.includes(kind)) return getOrCreateHireSession(capabilityId);
  return runNamedOfflineFixture(capabilityId, kind);
}

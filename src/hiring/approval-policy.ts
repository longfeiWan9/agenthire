/**
 * Manual approval policy and binding fingerprint (D5.3).
 *
 * Human approval ≠ execution authorization.
 * Real executionAuthorization and paymentExecutionAuthorization always false.
 * Demo approvals are simulationOnly.
 * Fingerprint = sha256(canonicalSerialize(binding)).
 *
 * STRICTLY_OFFLINE / NO_SIGNING / NO_PAYMENT / NO_SERVICE_EXECUTION
 */

import { createHash } from "node:crypto";
import type { QuoteProvenance } from "./quote-types.ts";
import type { NormalizedQuotePreview } from "./quote-types.ts";

export const APPROVAL_POLICY_VERSION = "1.0" as const;

/**
 * Approval session states. simulationApproved ≠ live permission.
 */
export type ApprovalState =
  | "notRequested"
  | "simulationApproved"
  | "simulationRejected"
  | "revoked"
  | "expired"
  | "blocked";

/**
 * Fields bound into a manual approval decision.
 * Any substitution of these fields invalidates the fingerprint.
 */
export type ApprovalBinding = {
  readonly hireJobId: string;
  readonly capabilityId: string;
  readonly providerKey: string;
  /** sha256 hex of canonical input. */
  readonly inputDigest: string;
  readonly method: string | null;
  readonly endpointUrl: string | null;
  readonly quoteId: string;
  readonly quoteProvenance: QuoteProvenance;
  readonly offerFingerprint: string;
  readonly amountAtomic: string | null;
  readonly asset: string | null;
  readonly network: string | null;
  readonly recipient: string | null;
  readonly transferKind: "exact" | "unknown";
  readonly freshnessExpiresAt: string | null;
  readonly policyVersion: string;
};

export type ApprovalAuthorizationFlags = {
  /** Always false in D5.3 — simulationApproved ≠ live execution. */
  readonly executionAuthorization: false;
  /** Always false in D5.3 — no payment construction/settlement. */
  readonly paymentExecutionAuthorization: false;
  readonly simulationOnly: true;
};

export const ALWAYS_UNAUTHORIZED: ApprovalAuthorizationFlags = {
  executionAuthorization: false,
  paymentExecutionAuthorization: false,
  simulationOnly: true,
};

/**
 * Deterministic canonical JSON for fingerprinting.
 * Sorts object keys recursively; arrays preserve order.
 */
export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeysDeep(obj[key]);
  }
  return out;
}

export function fingerprintBinding(binding: ApprovalBinding): string {
  return createHash("sha256")
    .update(canonicalSerialize(binding), "utf8")
    .digest("hex");
}

export function digestInput(input: unknown): string {
  return createHash("sha256")
    .update(canonicalSerialize(input), "utf8")
    .digest("hex");
}

/**
 * Offer fingerprint from a normalized quote — binds amount/asset/network/
 * recipient/scheme/provenance/quoteId for substitution detection.
 */
export function fingerprintOffer(quote: NormalizedQuotePreview): string {
  return createHash("sha256")
    .update(
      canonicalSerialize({
        quoteId: quote.quoteId,
        provenance: quote.provenance,
        amountAtomic: quote.amount.atomicAmount,
        asset: quote.asset,
        network: quote.network,
        recipient: quote.recipient,
        scheme: quote.scheme,
        transferKind: quote.transferKind,
        x402Version: quote.x402Version,
        policyVersion: quote.policyVersion,
      }),
      "utf8",
    )
    .digest("hex");
}

export function buildApprovalBinding(args: {
  readonly hireJobId: string;
  readonly capabilityId: string;
  readonly providerKey: string;
  readonly rawInput: unknown;
  readonly quote: NormalizedQuotePreview;
}): ApprovalBinding {
  return {
    hireJobId: args.hireJobId,
    capabilityId: args.capabilityId,
    providerKey: args.providerKey,
    inputDigest: digestInput(args.rawInput),
    method: args.quote.method,
    endpointUrl: args.quote.endpointUrl,
    quoteId: args.quote.quoteId,
    quoteProvenance: args.quote.provenance,
    offerFingerprint: fingerprintOffer(args.quote),
    amountAtomic: args.quote.amount.atomicAmount,
    asset: args.quote.asset,
    network: args.quote.network,
    recipient: args.quote.recipient,
    transferKind: args.quote.transferKind,
    freshnessExpiresAt: args.quote.freshness.expiresAt,
    policyVersion: args.quote.policyVersion,
  };
}

export type ApprovalPolicyCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Fail-closed checks before granting simulationApproved.
 * Never upgrades to real execution/payment authorization.
 */
export function evaluateApprovalEligibility(args: {
  readonly binding: ApprovalBinding;
  readonly expectedFingerprint: string;
  readonly state: ApprovalState;
  readonly nowIso: string;
  readonly simulationOnly: boolean;
}): ApprovalPolicyCheck {
  if (!args.simulationOnly) {
    return {
      ok: false,
      code: "liveApprovalForbidden",
      message:
        "D5.3 only permits simulationOnly approvals — live approval not authorized",
    };
  }

  const actual = fingerprintBinding(args.binding);
  if (actual !== args.expectedFingerprint) {
    return {
      ok: false,
      code: "substitutionDetected",
      message:
        "Approval binding fingerprint mismatch — substitution fail-closed",
    };
  }

  if (
    args.state === "revoked" ||
    args.state === "expired" ||
    args.state === "blocked" ||
    args.state === "simulationRejected"
  ) {
    return {
      ok: false,
      code: "stateNotApprovable",
      message: `cannot approve from state ${args.state}`,
    };
  }

  if (args.state === "simulationApproved") {
    return {
      ok: false,
      code: "replayDetected",
      message: "Approval already simulationApproved — replay fail-closed",
    };
  }

  if (args.binding.freshnessExpiresAt) {
    const exp = Date.parse(args.binding.freshnessExpiresAt);
    const now = Date.parse(args.nowIso);
    if (Number.isFinite(exp) && Number.isFinite(now) && now > exp) {
      return {
        ok: false,
        code: "expired",
        message: "Quote freshness window expired — approval blocked",
      };
    }
  }

  return { ok: true };
}

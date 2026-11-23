/**
 * HireJob workflow types (D5.2) — offline state machine only.
 *
 * States intentionally exclude paidVerified / settled / liveSucceeded.
 * STRICTLY_OFFLINE / NO_SIGNING / NO_PAYMENT / NO_EXECUTION
 */

import type {
  ExecutionOutcomeKind,
  PaymentVerificationStatus,
} from "../adapters/types.ts";
import type { SecCompanyIdentityDraftInput } from "../adapters/quantjourney-sec-identity.ts";

export const HIREJOB_SCHEMA_VERSION = "1.0" as const;
export const HIREJOB_MODE =
  "STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_EXECUTION" as const;

/**
 * HireJob lifecycle states for D5.2.
 * No paidVerified — payment settlement is not authorized.
 */
export type HireJobStatus =
  | "draft"
  | "inputValidated"
  | "quoteUnavailable"
  | "awaitingApproval"
  | "blocked"
  | "simulatedSucceeded"
  | "simulatedFailed";

export type HireJobTransition =
  | { readonly type: "validateInput" }
  | { readonly type: "markQuoteUnavailable"; readonly reason: string }
  | { readonly type: "requestApproval" }
  | { readonly type: "block"; readonly reason: string }
  | {
      readonly type: "simulateSuccess";
      readonly fixtureId: string;
      readonly result: unknown;
    }
  | {
      readonly type: "simulateFailure";
      readonly fixtureId: string;
      readonly reason: string;
    };

export type HireJobEvent = {
  readonly at: string;
  readonly from: HireJobStatus;
  readonly to: HireJobStatus;
  readonly transition: HireJobTransition["type"];
  readonly note: string;
};

export type HireJobPaymentView = {
  readonly status: PaymentVerificationStatus;
  readonly parseOk: boolean | null;
  readonly policyCompatible: boolean | null;
  readonly paymentApprovalGranted: false;
  readonly note: string;
};

export type HireJobResultView = {
  readonly outcomeKind: ExecutionOutcomeKind;
  readonly fixtureId: string | null;
  readonly providerExecutionVerified: false;
  readonly payload: unknown | null;
  readonly warning: string;
};

export type HireJob = {
  readonly hireJobId: string;
  readonly schemaVersion: typeof HIREJOB_SCHEMA_VERSION;
  readonly mode: typeof HIREJOB_MODE;
  readonly capabilityId: string;
  readonly adapterId: string;
  readonly taskType: string;
  readonly taskVersion: string;
  readonly status: HireJobStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rawInput: unknown;
  readonly validatedInput: SecCompanyIdentityDraftInput | null;
  readonly blockReason: string | null;
  readonly quoteReason: string | null;
  readonly payment: HireJobPaymentView;
  readonly result: HireJobResultView;
  readonly history: readonly HireJobEvent[];
  readonly flags: {
    readonly approvedForNetworkExecution: false;
    readonly executionMode: "offlineFixtureOnly";
    readonly paidVerified: false;
  };
};

export type HireJobCreateRequest = {
  readonly hireJobId?: string;
  readonly capabilityId: string;
  readonly adapterId: string;
  readonly taskType: string;
  readonly taskVersion: string;
  readonly rawInput: unknown;
  readonly createdAt?: string;
};

/** Offline fixture case kinds from first-adapter-spec. */
export type HireJobFixtureKind =
  | "success-aapl"
  | "invalid-input-empty"
  | "invalid-input-url"
  | "provider-error-4xx"
  | "provider-error-5xx"
  | "incompatible-payment-402"
  | "compatible-payment-unapproved-402";

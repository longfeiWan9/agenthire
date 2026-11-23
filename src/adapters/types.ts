/**
 * Typed external capability adapter foundation (D5.2).
 *
 * STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_EXECUTION
 *
 * These concepts are deliberately separate — never collapse into one
 * `isSupported` / `verified` flag:
 *
 * 1. Advertisement — capability advertised on a discovery surface
 * 2. Adapter definition — typed AgentHire adapter registered locally
 * 3. Interface documentation — method / URL / schemas known from provider docs
 * 4. Execution authorization — human approval for live network invocation
 * 5. Execution outcome — simulated fixture vs provider-verified result
 * 6. Payment verification — parse / policy / settlement are distinct statuses
 */

export const ADAPTER_SCHEMA_VERSION = "1.0" as const;
export const ADAPTER_MODE =
  "STRICTLY_OFFLINE / NO_PROVIDER_NETWORK / NO_SIGNING / NO_PAYMENT / NO_EXECUTION" as const;

/** Only execution mode authorized in D5.2. */
export type AdapterExecutionMode = "offlineFixtureOnly";

export type ValidationOk<T> = {
  readonly ok: true;
  readonly value: T;
};

export type ValidationErr = {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
  readonly details?: readonly string[];
};

export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

/**
 * Invocation description — fail closed with null method/URL when unknown.
 * Agent-card URL is discovery-only and must not be treated as a skill endpoint.
 */
export type InvocationDescription = {
  readonly taskType: string;
  readonly taskVersion: string;
  readonly capabilityId: string;
  readonly method: string | null;
  readonly url: string | null;
  readonly interfaceDocumented: false | true;
  readonly notes: readonly string[];
};

export type CapabilityAdvertisementRef = {
  readonly capabilityId: string;
  readonly providerKey: string;
  readonly serviceKey: string;
  readonly advertised: true;
  readonly discoveryEvidenceId: string | null;
};

export type AdapterDefinitionMeta = {
  readonly adapterId: string;
  readonly capabilityId: string;
  readonly taskType: string;
  readonly taskVersion: string;
  readonly executionMode: AdapterExecutionMode;
};

export type InterfaceDocumentationStatus = {
  readonly interfaceDocumented: boolean;
  readonly method: string | null;
  readonly url: string | null;
  readonly requestSchema: string | null;
  readonly responseSchema: string | null;
  readonly note: string;
};

export type ExecutionAuthorizationStatus = {
  readonly approvedForNetworkExecution: false;
  readonly reason: string;
};

export type ExecutionOutcomeKind =
  | "notAttempted"
  | "simulatedFixture"
  | "providerVerified";

export type PaymentVerificationStatus =
  | "notApplicable"
  | "challengeAbsent"
  | "parseFailed"
  | "policyIncompatible"
  | "policyCompatibleUnapproved"
  | "paymentUnauthorized";

/**
 * CapabilityAdapter — typed offline adapter contract.
 * No live HTTP client. No executePaidTask / runLiveAgent.
 */
export type CapabilityAdapter<TInput, TOutput> = {
  readonly meta: AdapterDefinitionMeta;
  readonly advertisement: CapabilityAdvertisementRef;
  readonly interfaceDocumentation: InterfaceDocumentationStatus;
  readonly executionAuthorization: ExecutionAuthorizationStatus;
  validateInput(input: unknown): ValidationResult<TInput>;
  describeInvocation(input: TInput): InvocationDescription;
  validateOutput(output: unknown): ValidationResult<TOutput>;
};

export type AdapterRegistryKey = {
  readonly taskType: string;
  readonly taskVersion: string;
};

export type AdapterResolveQuery =
  | { readonly by: "task"; readonly taskType: string; readonly taskVersion: string }
  | { readonly by: "capabilityId"; readonly capabilityId: string }
  | {
      readonly by: "taskAndCapability";
      readonly taskType: string;
      readonly taskVersion: string;
      readonly capabilityId: string;
    };

/**
 * QuantJourney SEC Company Identity adapter (D5.2).
 *
 * Capability: cap:79da211975c2 · skill qj-sec-company-identity
 * Task: sec-company-identity@draft (AgentHire-local draft — not a provider claim)
 *
 * executionMode: offlineFixtureOnly
 * method / URL: null (unknown — do not invent; agent-card URL ≠ skill endpoint)
 * A2A generic delegation: disabled per QuantJourney card
 * STRICTLY_OFFLINE — no live HTTP client.
 */

import {
  err,
  ok,
  validateCompanyName,
  validateTickerSymbol,
} from "./validation.ts";
import type {
  CapabilityAdapter,
  InvocationDescription,
  ValidationResult,
} from "./types.ts";

export const SEC_IDENTITY_CAPABILITY_ID = "cap:79da211975c2" as const;
export const SEC_IDENTITY_ADAPTER_ID =
  "adapter:quantjourney-sec-company-identity@draft" as const;
export const SEC_IDENTITY_TASK_TYPE = "sec-company-identity" as const;
export const SEC_IDENTITY_TASK_VERSION = "draft" as const;
export const SEC_IDENTITY_TASK_ID = "sec-company-identity@draft" as const;
export const SEC_IDENTITY_PROVIDER_KEY = "skill-provider:QuantJourney" as const;
export const SEC_IDENTITY_SERVICE_KEY = "skill:qj-sec-company-identity" as const;

/** Tagged union — caller must declare ticker vs companyName. */
export type SecCompanyIdentityDraftInput =
  | { readonly kind: "ticker"; readonly ticker: string }
  | { readonly kind: "companyName"; readonly companyName: string };

export type SecCompanyIdentityDraftResult = {
  readonly taskId: typeof SEC_IDENTITY_TASK_ID;
  readonly matchedKind: "ticker" | "companyName";
  readonly matchedQuery: string;
  readonly cik: string | null;
  readonly ticker: string | null;
  readonly companyName: string | null;
  readonly exchange: string | null;
  readonly provenance: {
    readonly sourceKind: "syntheticFixture";
    readonly fixtureId: string;
    readonly fixtureKind: "synthetic";
    readonly providerExecutionVerified: false;
    readonly note: string;
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateSecCompanyIdentityInput(
  input: unknown,
): ValidationResult<SecCompanyIdentityDraftInput> {
  if (!isPlainObject(input)) {
    return err("invalidType", "input must be an object");
  }
  const kind = input.kind;
  if (kind !== "ticker" && kind !== "companyName") {
    return err(
      "invalidKind",
      'input.kind must be "ticker" or "companyName" (tagged union)',
    );
  }
  if (kind === "ticker") {
    if ("companyName" in input && input.companyName !== undefined) {
      return err("conflictingFields", "ticker input must not include companyName");
    }
    const ticker = validateTickerSymbol(input.ticker);
    if (!ticker.ok) return ticker;
    return ok({ kind: "ticker", ticker: ticker.value });
  }
  if ("ticker" in input && input.ticker !== undefined) {
    return err("conflictingFields", "companyName input must not include ticker");
  }
  const companyName = validateCompanyName(input.companyName);
  if (!companyName.ok) return companyName;
  return ok({ kind: "companyName", companyName: companyName.value });
}

/** Structural draft output checks — not semantic proof of SEC identity. */
export function validateSecCompanyIdentityOutput(
  output: unknown,
): ValidationResult<SecCompanyIdentityDraftResult> {
  if (!isPlainObject(output)) {
    return err("invalidType", "output must be an object");
  }
  if (output.taskId !== SEC_IDENTITY_TASK_ID) {
    return err("taskMismatch", `output.taskId must be ${SEC_IDENTITY_TASK_ID}`);
  }
  if (output.matchedKind !== "ticker" && output.matchedKind !== "companyName") {
    return err("invalidMatchedKind", "matchedKind must be ticker|companyName");
  }
  if (typeof output.matchedQuery !== "string" || !output.matchedQuery.trim()) {
    return err("invalidMatchedQuery", "matchedQuery must be a non-empty string");
  }
  for (const field of ["cik", "ticker", "companyName", "exchange"] as const) {
    const v = output[field];
    if (v !== null && typeof v !== "string") {
      return err("invalidField", `${field} must be string|null`);
    }
  }
  if (typeof output.cik === "string" && !/^\d{1,10}$/.test(output.cik)) {
    return err("invalidCik", "cik must match /^\\d{1,10}$/ when present");
  }
  const provenance = output.provenance;
  if (!isPlainObject(provenance)) {
    return err("missingProvenance", "provenance object required");
  }
  if (provenance.sourceKind !== "syntheticFixture") {
    return err(
      "invalidProvenance",
      'provenance.sourceKind must be "syntheticFixture" in D5.2',
    );
  }
  if (provenance.fixtureKind !== "synthetic") {
    return err("invalidProvenance", 'provenance.fixtureKind must be "synthetic"');
  }
  if (provenance.providerExecutionVerified !== false) {
    return err(
      "providerVerifiedForbidden",
      "providerExecutionVerified must remain false — simulated fixtures are not provider returns",
    );
  }
  if (typeof provenance.fixtureId !== "string" || !provenance.fixtureId) {
    return err("missingFixtureId", "provenance.fixtureId required");
  }
  if (typeof provenance.note !== "string") {
    return err("missingNote", "provenance.note required");
  }
  return ok({
    taskId: SEC_IDENTITY_TASK_ID,
    matchedKind: output.matchedKind,
    matchedQuery: output.matchedQuery,
    cik: (output.cik as string | null) ?? null,
    ticker: (output.ticker as string | null) ?? null,
    companyName: (output.companyName as string | null) ?? null,
    exchange: (output.exchange as string | null) ?? null,
    provenance: {
      sourceKind: "syntheticFixture",
      fixtureId: provenance.fixtureId,
      fixtureKind: "synthetic",
      providerExecutionVerified: false,
      note: provenance.note,
    },
  });
}

export function describeSecCompanyIdentityInvocation(
  input: SecCompanyIdentityDraftInput,
): InvocationDescription {
  const query =
    input.kind === "ticker" ? input.ticker : input.companyName;
  return {
    taskType: SEC_IDENTITY_TASK_TYPE,
    taskVersion: SEC_IDENTITY_TASK_VERSION,
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    method: null,
    url: null,
    interfaceDocumented: false,
    notes: [
      `draft query kind=${input.kind} value=${query}`,
      "Exact QuantJourney method/URL unknown — not invented.",
      "Agent-card URL https://agents.quantjourney.cloud/.well-known/agent-card.json is discovery-only, not a skill endpoint.",
      "QuantJourney generic A2A task delegation is disabled; OpenAPI query routes required and not retrieved.",
      "executionMode=offlineFixtureOnly — no live HTTP client.",
    ],
  };
}

/** Build a clearly synthetic success envelope — never labeled as provider return. */
export function buildSyntheticSecIdentitySuccess(args: {
  readonly input: SecCompanyIdentityDraftInput;
  readonly fixtureId: string;
  readonly cik: string;
  readonly ticker: string;
  readonly companyName: string;
  readonly exchange: string;
}): SecCompanyIdentityDraftResult {
  return {
    taskId: SEC_IDENTITY_TASK_ID,
    matchedKind: args.input.kind,
    matchedQuery:
      args.input.kind === "ticker" ? args.input.ticker : args.input.companyName,
    cik: args.cik,
    ticker: args.ticker,
    companyName: args.companyName,
    exchange: args.exchange,
    provenance: {
      sourceKind: "syntheticFixture",
      fixtureId: args.fixtureId,
      fixtureKind: "synthetic",
      providerExecutionVerified: false,
      note: "SIMULATED RESULT — NOT RETURNED BY AN EXTERNAL PROVIDER",
    },
  };
}

export const quantJourneySecIdentityAdapter: CapabilityAdapter<
  SecCompanyIdentityDraftInput,
  SecCompanyIdentityDraftResult
> = {
  meta: {
    adapterId: SEC_IDENTITY_ADAPTER_ID,
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    taskType: SEC_IDENTITY_TASK_TYPE,
    taskVersion: SEC_IDENTITY_TASK_VERSION,
    executionMode: "offlineFixtureOnly",
  },
  advertisement: {
    capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    providerKey: SEC_IDENTITY_PROVIDER_KEY,
    serviceKey: SEC_IDENTITY_SERVICE_KEY,
    advertised: true,
    discoveryEvidenceId: "DISC-004",
  },
  interfaceDocumentation: {
    interfaceDocumented: false,
    method: null,
    url: null,
    requestSchema: null,
    responseSchema: null,
    note: "Method, URL, and schemas remain unknown. Do not invent QuantJourney endpoints. Agent-card URL ≠ skill endpoint.",
  },
  executionAuthorization: {
    approvedForNetworkExecution: false,
    reason: "D5.2 offlineFixtureOnly — live invocation not authorized",
  },
  validateInput: validateSecCompanyIdentityInput,
  describeInvocation: describeSecCompanyIdentityInvocation,
  validateOutput: validateSecCompanyIdentityOutput,
};

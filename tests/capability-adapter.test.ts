/**
 * D5.2 capability adapter + registry tests.
 * STRICTLY_OFFLINE — synthetic fixtures only.
 */

import { describe, expect, it } from "vitest";
import {
  buildSyntheticSecIdentitySuccess,
  createCapabilityAdapterRegistry,
  createDefaultAdapterRegistry,
  describeSecCompanyIdentityInvocation,
  quantJourneySecIdentityAdapter,
  SEC_IDENTITY_CAPABILITY_ID,
  SEC_IDENTITY_TASK_ID,
  SEC_IDENTITY_TASK_TYPE,
  SEC_IDENTITY_TASK_VERSION,
  validateSecCompanyIdentityInput,
  validateSecCompanyIdentityOutput,
} from "../src/adapters/index.ts";

describe("capability adapter concepts remain distinct", () => {
  it("does not collapse advertisement / docs / auth / outcome / payment into one flag", () => {
    const a = quantJourneySecIdentityAdapter;
    expect(a.advertisement.advertised).toBe(true);
    expect(a.interfaceDocumentation.interfaceDocumented).toBe(false);
    expect(a.executionAuthorization.approvedForNetworkExecution).toBe(false);
    expect(a.meta.executionMode).toBe("offlineFixtureOnly");
    expect(a.interfaceDocumentation.method).toBeNull();
    expect(a.interfaceDocumentation.url).toBeNull();
  });

  it("describeInvocation keeps method/url null and notes agent-card ≠ skill endpoint", () => {
    const desc = describeSecCompanyIdentityInvocation({
      kind: "ticker",
      ticker: "AAPL",
    });
    expect(desc.method).toBeNull();
    expect(desc.url).toBeNull();
    expect(desc.interfaceDocumented).toBe(false);
    expect(desc.notes.some((n) => /agent-card/i.test(n))).toBe(true);
    expect(desc.notes.some((n) => /A2A/i.test(n))).toBe(true);
  });
});

describe("SEC company identity input validation", () => {
  it("accepts ticker and companyName tagged union", () => {
    expect(
      validateSecCompanyIdentityInput({ kind: "ticker", ticker: "aapl" }),
    ).toEqual({ ok: true, value: { kind: "ticker", ticker: "AAPL" } });
    expect(
      validateSecCompanyIdentityInput({
        kind: "companyName",
        companyName: "Apple Inc.",
      }).ok,
    ).toBe(true);
  });

  it("rejects empty, URL, SQL, batch, and conflicting fields", () => {
    expect(
      validateSecCompanyIdentityInput({ kind: "ticker", ticker: "  " }).ok,
    ).toBe(false);
    expect(
      validateSecCompanyIdentityInput({
        kind: "companyName",
        companyName: "https://evil.example",
      }).ok,
    ).toBe(false);
    expect(
      validateSecCompanyIdentityInput({
        kind: "ticker",
        ticker: "AAPL'; DROP TABLE",
      }).ok,
    ).toBe(false);
    expect(
      validateSecCompanyIdentityInput({
        kind: "ticker",
        ticker: "AAPL,MSFT",
      }).ok,
    ).toBe(false);
    expect(
      validateSecCompanyIdentityInput({
        kind: "ticker",
        ticker: "AAPL",
        companyName: "Apple",
      }).ok,
    ).toBe(false);
    expect(validateSecCompanyIdentityInput({ kind: "other" }).ok).toBe(false);
  });
});

describe("SEC company identity output validation", () => {
  it("accepts synthetic fixture result with providerExecutionVerified false", () => {
    const result = buildSyntheticSecIdentitySuccess({
      input: { kind: "ticker", ticker: "AAPL" },
      fixtureId: "success-aapl",
      cik: "320193",
      ticker: "AAPL",
      companyName: "Apple Inc.",
      exchange: "NASDAQ",
    });
    const validated = validateSecCompanyIdentityOutput(result);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.value.taskId).toBe(SEC_IDENTITY_TASK_ID);
    expect(validated.value.provenance.sourceKind).toBe("syntheticFixture");
    expect(validated.value.provenance.providerExecutionVerified).toBe(false);
  });

  it("rejects providerExecutionVerified true and invented non-synthetic provenance", () => {
    const bad = buildSyntheticSecIdentitySuccess({
      input: { kind: "ticker", ticker: "AAPL" },
      fixtureId: "success-aapl",
      cik: "320193",
      ticker: "AAPL",
      companyName: "Apple Inc.",
      exchange: "NASDAQ",
    });
    const forged = {
      ...bad,
      provenance: {
        ...bad.provenance,
        providerExecutionVerified: true,
      },
    };
    expect(validateSecCompanyIdentityOutput(forged).ok).toBe(false);

    const wrongSource = {
      ...bad,
      provenance: {
        ...bad.provenance,
        sourceKind: "providerLive",
      },
    };
    expect(validateSecCompanyIdentityOutput(wrongSource).ok).toBe(false);
  });
});

describe("adapter registry", () => {
  it("registers and resolves by task and capabilityId", () => {
    const registry = createDefaultAdapterRegistry(quantJourneySecIdentityAdapter);
    const byCap = registry.resolve({
      by: "capabilityId",
      capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    });
    expect(byCap.ok).toBe(true);
    const byTask = registry.resolve({
      by: "task",
      taskType: SEC_IDENTITY_TASK_TYPE,
      taskVersion: SEC_IDENTITY_TASK_VERSION,
    });
    expect(byTask.ok).toBe(true);
    const both = registry.resolve({
      by: "taskAndCapability",
      taskType: SEC_IDENTITY_TASK_TYPE,
      taskVersion: SEC_IDENTITY_TASK_VERSION,
      capabilityId: SEC_IDENTITY_CAPABILITY_ID,
    });
    expect(both.ok).toBe(true);
  });

  it("handles missing, duplicate, and conflict", () => {
    const registry = createCapabilityAdapterRegistry();
    expect(
      registry.resolve({ by: "capabilityId", capabilityId: "cap:missing" }).ok,
    ).toBe(false);

    const first = registry.register(
      quantJourneySecIdentityAdapter as never,
    );
    expect(first.ok).toBe(true);
    const dup = registry.register(quantJourneySecIdentityAdapter as never);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe("duplicateAdapterId");

    const conflict = registry.register({
      ...quantJourneySecIdentityAdapter,
      meta: {
        ...quantJourneySecIdentityAdapter.meta,
        adapterId: "adapter:other",
      },
    } as never);
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(["taskConflict", "capabilityConflict"]).toContain(conflict.code);
    }
  });

  it("registration does not imply callable live execution", () => {
    const registry = createDefaultAdapterRegistry(quantJourneySecIdentityAdapter);
    const entry = registry.list()[0];
    expect(entry?.meta.executionMode).toBe("offlineFixtureOnly");
    expect(
      entry?.adapter.executionAuthorization.approvedForNetworkExecution,
    ).toBe(false);
    expect("execute" in (entry?.adapter ?? {})).toBe(false);
    expect("executePaidTask" in (entry?.adapter ?? {})).toBe(false);
    expect("runLiveAgent" in (entry?.adapter ?? {})).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  applyPowTransition,
  createPowSession,
} from "../src/pow/state-machine.ts";
import type { PowChallenge, PowSolution } from "../src/pow/types.ts";

const AT = "2026-11-25T00:00:00.000Z";

const challenge: PowChallenge = {
  token: "tok",
  challenge: "chal",
  difficultyBits: 4,
  expiresAtUnixSeconds: null,
  algorithm: null,
  submitHeader: null,
  submitFormat: null,
  ttlSeconds: null,
  slug: "json-validate",
  rawKeys: ["challenge", "difficultyBits", "token"],
  fixtureKind: "synthetic",
  parseMode: "compat",
};

const solution: PowSolution = {
  token: "tok",
  nonce: "7",
  preimage: "chal:7",
  digestHex: "00".repeat(32),
  difficultyBits: 4,
  attempts: 8,
  elapsedMs: 3,
  headerValue: "tok:7",
};

describe("PoW state machine", () => {
  it("walks planned → verified success path", () => {
    let s = createPowSession({
      sessionId: "sess-1",
      runMode: "offline-simulation",
      createdAt: AT,
    });
    expect(s.status).toBe("planned");
    expect(s.ladder.simulationOnly).toBe(true);

    let r = applyPowTransition(s, { type: "beginChallengeRequest" }, AT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.session;

    r = applyPowTransition(
      s,
      {
        type: "receiveChallenge",
        challenge,
        httpStatus: 200,
        networkPerformed: false,
      },
      AT,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.session;

    r = applyPowTransition(s, { type: "beginSolve" }, AT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.session;

    r = applyPowTransition(s, { type: "recordSolution", solution }, AT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.session;

    r = applyPowTransition(s, { type: "beginSubmit" }, AT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.session;

    r = applyPowTransition(
      s,
      {
        type: "verifySubmit",
        httpStatus: 200,
        envelope: { valid: true, errors: [], extraKeys: [] },
        networkPerformed: false,
        providerExecutionVerified: false,
        simulationOnly: true,
      },
      AT,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.session.status).toBe("verified");
    expect(r.session.ladder.observedLevel).toBe("L2");
    expect(r.session.ladder.simulationOnly).toBe(true);
    expect(r.session.ladder.providerExecutionVerified).toBe(false);
  });

  it("rejects simulation claiming providerExecutionVerified", () => {
    let s = createPowSession({
      sessionId: "sess-2",
      runMode: "offline-simulation",
      createdAt: AT,
    });
    for (const t of [
      { type: "beginChallengeRequest" as const },
      {
        type: "receiveChallenge" as const,
        challenge,
        httpStatus: 200,
        networkPerformed: false,
      },
      { type: "beginSolve" as const },
      { type: "recordSolution" as const, solution },
      { type: "beginSubmit" as const },
    ]) {
      const r = applyPowTransition(s, t, AT);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.session;
    }
    const bad = applyPowTransition(
      s,
      {
        type: "verifySubmit",
        httpStatus: 200,
        envelope: { valid: true, errors: [], extraKeys: [] },
        networkPerformed: false,
        providerExecutionVerified: true,
        simulationOnly: true,
      },
      AT,
    );
    expect(bad.ok).toBe(false);
  });

  it("supports failure terminals from mid-states", () => {
    const s = createPowSession({
      sessionId: "sess-3",
      runMode: "offline-simulation",
      createdAt: AT,
    });
    const blocked = applyPowTransition(
      s,
      {
        type: "block",
        terminal: "unauthorized",
        reason: "no live auth",
      },
      AT,
    );
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(blocked.session.status).toBe("unauthorized");

    const again = applyPowTransition(
      blocked.session,
      { type: "beginChallengeRequest" },
      AT,
    );
    expect(again.ok).toBe(false);
  });

  it("records budgetExhausted from solving", () => {
    let s = createPowSession({
      sessionId: "sess-4",
      runMode: "offline-simulation",
      createdAt: AT,
    });
    for (const t of [
      { type: "beginChallengeRequest" as const },
      {
        type: "receiveChallenge" as const,
        challenge,
        httpStatus: 200,
        networkPerformed: false,
      },
      { type: "beginSolve" as const },
    ]) {
      const r = applyPowTransition(s, t, AT);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.session;
    }
    const fail = applyPowTransition(
      s,
      {
        type: "failSolve",
        terminal: "budgetExhausted",
        reason: "maxAttempts",
      },
      AT,
    );
    expect(fail.ok).toBe(true);
    if (!fail.ok) return;
    expect(fail.session.status).toBe("budgetExhausted");
  });
});

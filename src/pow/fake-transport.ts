/**
 * Fake HTTPS transport for offline PoW E2E (D7.3).
 * Never contacts Agent402. Simulation ≠ L3.
 */

import { createHash } from "node:crypto";
import type {
  SecureHttpsDeps,
  SecureHttpsExchange,
} from "../erc8004/secure-https.ts";
import { validatePowSolutionHeaderValue } from "../erc8004/secure-https.ts";
import { verifyPowSolution } from "./solver.ts";
import {
  POW_CHALLENGE_URL,
  POW_SUBMIT_URL,
  type PowChallenge,
} from "./types.ts";

export type FakePowTransportOptions = {
  readonly challenge: PowChallenge;
  readonly expectedBodySha256?: string;
  readonly challengeHttpStatus?: number;
  readonly submitHttpStatus?: number;
  readonly submitBody?: unknown;
  readonly failChallenge?: boolean;
  readonly rejectBadSolution?: boolean;
  readonly now?: () => number;
};

export type FakePowTransport = {
  readonly exchange: (
    url: string,
    deps?: SecureHttpsDeps,
  ) => Promise<SecureHttpsExchange>;
  readonly calls: readonly FakePowCall[];
};

export type FakePowCall = {
  readonly url: string;
  readonly method: string;
  readonly powSolution: string | undefined;
  readonly bodySha256: string | null;
};

function exchangeOf(
  url: string,
  statusCode: number,
  body: Buffer,
  headers: Record<string, string | string[] | undefined>,
  now: () => number,
  started: number,
): SecureHttpsExchange {
  return {
    url,
    finalUrl: url,
    statusCode,
    headers,
    contentType: "application/json; charset=utf-8",
    body,
    sha256: createHash("sha256").update(body).digest("hex"),
    byteLength: body.length,
    resolvedAddresses: [{ address: "104.21.37.50", family: 4 }],
    pinnedAddress: { address: "104.21.37.50", family: 4 },
    elapsedMs: Math.max(0, now() - started),
  };
}

/**
 * Build an injectable transport that serves a synthetic PoW challenge and
 * accepts a correct X-Pow-Solution on the fixed submit URL.
 */
export function createFakePowTransport(
  options: FakePowTransportOptions,
): FakePowTransport {
  const calls: FakePowCall[] = [];
  const now = options.now ?? (() => Date.now());
  const challengeStatus = options.challengeHttpStatus ?? 200;
  const submitStatus = options.submitHttpStatus ?? 200;
  const submitBody = options.submitBody ?? { valid: true, errors: [] };

  const exchange = async (
    url: string,
    deps: SecureHttpsDeps = {},
  ): Promise<SecureHttpsExchange> => {
    const started = now();
    const method = deps.method ?? "GET";
    const bodyBuf =
      deps.body === undefined || deps.body === null
        ? null
        : typeof deps.body === "string"
          ? Buffer.from(deps.body, "utf8")
          : deps.body;
    const bodySha256 = bodyBuf
      ? createHash("sha256").update(bodyBuf).digest("hex")
      : null;

    calls.push({
      url,
      method,
      powSolution: deps.powSolution,
      bodySha256,
    });

    if (url === POW_CHALLENGE_URL) {
      if (method !== "GET") {
        return exchangeOf(
          url,
          405,
          Buffer.from(JSON.stringify({ error: "method not allowed" }), "utf8"),
          {},
          now,
          started,
        );
      }
      if (options.failChallenge) {
        return exchangeOf(
          url,
          500,
          Buffer.from(JSON.stringify({ error: "synthetic failure" }), "utf8"),
          {},
          now,
          started,
        );
      }
      const body = Buffer.from(
        JSON.stringify({
          token: options.challenge.token,
          challenge: options.challenge.challenge,
          difficultyBits: options.challenge.difficultyBits,
          slug: options.challenge.slug,
          expiresAt: options.challenge.expiresAt,
        }),
        "utf8",
      );
      return exchangeOf(url, challengeStatus, body, {}, now, started);
    }

    if (url === POW_SUBMIT_URL) {
      if (method !== "POST") {
        return exchangeOf(
          url,
          405,
          Buffer.from(JSON.stringify({ error: "method not allowed" }), "utf8"),
          {},
          now,
          started,
        );
      }
      if (options.expectedBodySha256 && bodySha256 !== options.expectedBodySha256) {
        return exchangeOf(
          url,
          400,
          Buffer.from(JSON.stringify({ error: "body mismatch" }), "utf8"),
          {},
          now,
          started,
        );
      }
      const pow = deps.powSolution;
      if (pow == null) {
        return exchangeOf(
          url,
          402,
          Buffer.from(JSON.stringify({ error: "Payment required" }), "utf8"),
          { "x-pow-challenge": POW_CHALLENGE_URL },
          now,
          started,
        );
      }
      const validated = validatePowSolutionHeaderValue(pow);
      if (!validated.ok) {
        return exchangeOf(
          url,
          400,
          Buffer.from(JSON.stringify({ error: validated.message }), "utf8"),
          {},
          now,
          started,
        );
      }
      const colon = validated.value.indexOf(":");
      const token = validated.value.slice(0, colon);
      const nonce = validated.value.slice(colon + 1);
      const verified = verifyPowSolution({
        challenge: options.challenge.challenge,
        token: options.challenge.token,
        nonce,
        difficultyBits: options.challenge.difficultyBits,
      });
      if (
        options.rejectBadSolution !== false &&
        (!verified.ok || token !== options.challenge.token)
      ) {
        return exchangeOf(
          url,
          403,
          Buffer.from(JSON.stringify({ error: "invalid pow solution" }), "utf8"),
          {},
          now,
          started,
        );
      }
      const body = Buffer.from(JSON.stringify(submitBody), "utf8");
      return exchangeOf(url, submitStatus, body, {}, now, started);
    }

    return exchangeOf(
      url,
      403,
      Buffer.from(JSON.stringify({ error: "url not on fake allowlist" }), "utf8"),
      {},
      now,
      started,
    );
  };

  return {
    exchange,
    get calls() {
      return calls;
    },
  };
}

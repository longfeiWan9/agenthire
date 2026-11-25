import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
  secureHttpsExchange,
  type SecureHttpsDeps,
} from "../src/erc8004/secure-https.ts";

describe("secureHttpsExchange PoW header (offline mock)", () => {
  type MockRequestFn = NonNullable<SecureHttpsDeps["request"]>;

  function createMockRequest(
    onOptions: (opts: unknown) => void,
  ): MockRequestFn {
    const fn = ((
      opts: unknown,
      callback?: (res: IncomingMessage) => void,
    ) => {
      onOptions(opts);
      const req = new EventEmitter() as EventEmitter & {
        end: (body?: Buffer) => void;
        destroy: (err?: Error) => void;
        setTimeout: (ms: number, cb?: () => void) => void;
      };
      req.end = () => {
        const resEmitter = new EventEmitter();
        const res = Object.assign(resEmitter, {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          resume() {
            return res as unknown as IncomingMessage;
          },
          destroy() {
            resEmitter.emit("close");
            return res as unknown as IncomingMessage;
          },
        }) as unknown as IncomingMessage;
        queueMicrotask(() => {
          callback?.(res);
          resEmitter.emit("data", Buffer.from('{"valid":true,"errors":[]}'));
          resEmitter.emit("end");
        });
      };
      req.destroy = (err?: Error) => {
        if (err) req.emit("error", err);
      };
      req.setTimeout = () => undefined;
      return req as unknown as ReturnType<MockRequestFn>;
    }) as MockRequestFn;
    return fn;
  }

  it("attaches X-Pow-Solution only when powSolution is provided", async () => {
    let seen: Record<string, string | number> = {};
    await secureHttpsExchange("https://agent402.tools/api/json-validate", {
      method: "POST",
      body: "{}",
      powSolution: "tok:42",
      lookup: async () => [{ address: "104.21.37.50", family: 4 }],
      request: createMockRequest((opts) => {
        const o = opts as { headers?: Record<string, string | number> };
        seen = { ...(o.headers ?? {}) };
      }),
    });
    expect(seen["X-Pow-Solution"]).toBe("tok:42");
    expect(seen.Authorization).toBeUndefined();
    expect(seen.Cookie).toBeUndefined();
  });

  it("omits X-Pow-Solution by default", async () => {
    let seen: Record<string, string | number> = {};
    await secureHttpsExchange("https://agent402.tools/api/json-validate", {
      method: "POST",
      body: "{}",
      lookup: async () => [{ address: "104.21.37.50", family: 4 }],
      request: createMockRequest((opts) => {
        const o = opts as { headers?: Record<string, string | number> };
        seen = { ...(o.headers ?? {}) };
      }),
    });
    expect(seen["X-Pow-Solution"]).toBeUndefined();
  });

  it("rejects malformed powSolution before connect", async () => {
    await expect(
      secureHttpsExchange("https://agent402.tools/api/json-validate", {
        method: "POST",
        body: "{}",
        powSolution: "no-colon",
        lookup: async () => [{ address: "104.21.37.50", family: 4 }],
        request: createMockRequest(() => {
          throw new Error("request must not be called");
        }),
      }),
    ).rejects.toThrow(/token:nonce/);
  });
});

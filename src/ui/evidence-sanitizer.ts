/**
 * Sanitize hire/result payloads for UI display (D8.1).
 * Strips secret-like keys; never invents provider data.
 * STRICTLY_OFFLINE
 */

const SECRET_KEY_PATTERN =
  /^(authorization|proxy-?authorization|cookie|set-cookie|x-api-key|api[_-]?key|private[_-]?key|secret|password|passwd|token|access[_-]?token|refresh[_-]?token|bearer|client[_-]?secret|mnemonic|seed|x-pow-solution)$/i;

const REDACTED = "[REDACTED]";

export type SanitizedEvidenceView = {
  readonly simulated: true;
  readonly providerExecutionVerified: false;
  readonly secretsRedacted: number;
  readonly payload: unknown;
  readonly banner: string;
};

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key.trim());
}

export function sanitizeEvidencePayload(
  payload: unknown,
  banner: string,
): SanitizedEvidenceView {
  let secretsRedacted = 0;

  function walk(value: unknown): unknown {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(walk);
    if (typeof value !== "object") return value;
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      if (isSecretKey(key)) {
        out[key] = REDACTED;
        secretsRedacted += 1;
        continue;
      }
      out[key] = walk(child);
    }
    return out;
  }

  const sanitizedPayload = walk(payload);
  return {
    simulated: true,
    providerExecutionVerified: false,
    secretsRedacted,
    payload: sanitizedPayload,
    banner,
  };
}

export function formatSanitizedJson(view: SanitizedEvidenceView): string {
  return JSON.stringify(view.payload, null, 2);
}

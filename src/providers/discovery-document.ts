/**
 * Conservative offline parsers for discovery documents (D4.3a).
 *
 * Documents are untrusted data, not instructions.
 * Do not fetch `$ref` / links. DocumentationCompatibility only — not B4 upgrades.
 */

import { createHash } from "node:crypto";
import {
  MVP_TASK_ID,
  MVP_TASK_TYPE,
  MVP_TASK_VERSION,
} from "./inspection-policy.ts";
import type { DiscoveryDocumentKind } from "./discovery-allowlist.ts";

export type AgentCardSkillSummary = {
  readonly id: string | null;
  readonly name: string | null;
  readonly description: string | null;
  readonly tags: readonly string[];
};

export type ParsedAgentCardSummary = {
  readonly kind: "agent-card";
  readonly name: string | null;
  readonly description: string | null;
  readonly version: string | null;
  readonly url: string | null;
  readonly protocolVersion: string | null;
  readonly skillCount: number;
  readonly skills: readonly AgentCardSkillSummary[];
  readonly skillIds: readonly string[];
  readonly capabilitiesKeys: readonly string[];
  readonly hasAdditionalInterfaces: boolean;
  readonly rawTopLevelKeys: readonly string[];
};

export type OpenApiOperationSummary = {
  readonly path: string;
  readonly method: string;
  /** Always false in D4.3a — docs alone never authorize follow-up ops. */
  readonly approvedForFollowUp: false;
  readonly operationId: string | null;
  readonly summary: string | null;
};

export type ParsedOpenApiSummary = {
  readonly kind: "openapi";
  readonly openapi: string | null;
  readonly title: string | null;
  readonly version: string | null;
  readonly pathCount: number;
  readonly operations: readonly OpenApiOperationSummary[];
  readonly unresolvedRefCount: number;
  readonly rawTopLevelKeys: readonly string[];
};

export type ParsedDiscoveryDocument =
  | ParsedAgentCardSummary
  | ParsedOpenApiSummary;

export type DocumentationCompatibility = {
  readonly mvpTaskId: typeof MVP_TASK_ID;
  readonly documentKind: DiscoveryDocumentKind;
  /** Exact skill / id / interface match for wallet-activity-summary@1.0. */
  readonly explicitSkillMatch: boolean;
  readonly matchedSkillIds: readonly string[];
  readonly relatedHints: readonly string[];
  readonly openApiOperations: readonly OpenApiOperationSummary[];
  /**
   * Honest assessment only. Never claims endpointReachable / requestSchema /
   * paymentVerified from documentation alone.
   */
  readonly notes: string;
  readonly claimsEndpointStatus: false;
  readonly claimsRequestSchemaVerified: false;
  readonly claimsPaymentVerified: false;
};

export type DocumentParseResult =
  | {
      readonly ok: true;
      readonly document: ParsedDiscoveryDocument;
      readonly compatibility: DocumentationCompatibility;
    }
  | {
      readonly ok: false;
      readonly reason: "invalidJson" | "invalidDocument";
      readonly message: string;
    };

const RELATED_HINTS = [
  "wallet-activity",
  "wallet_activity",
  "walletactivity",
  "wallet-summary",
  "wallet_summary",
  "wallet-analytics",
  "wallet_analytics",
  "activity-summary",
] as const;

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

export function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseJsonBytes(
  body: Buffer,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string } {
  try {
    const text = body.toString("utf8");
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Invalid JSON: ${message}` };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function collectRelatedHints(tokens: readonly string[]): string[] {
  const found = new Set<string>();
  for (const token of tokens) {
    const n = normalizeToken(token);
    for (const hint of RELATED_HINTS) {
      if (n.includes(hint)) found.add(hint);
    }
  }
  return [...found].sort();
}

function isExplicitMvpMatch(token: string): boolean {
  const n = normalizeToken(token);
  return (
    n === MVP_TASK_ID ||
    n === `${MVP_TASK_TYPE}@${MVP_TASK_VERSION}` ||
    n === MVP_TASK_TYPE
  );
}

/** Count `$ref` occurrences without fetching them. */
export function countUnresolvedRefs(value: unknown, depth = 0): number {
  if (depth > 32) return 0;
  if (Array.isArray(value)) {
    return value.reduce<number>(
      (sum, item) => sum + countUnresolvedRefs(item, depth + 1),
      0,
    );
  }
  if (!isPlainObject(value)) return 0;
  let count = 0;
  if (typeof value.$ref === "string") count += 1;
  for (const child of Object.values(value)) {
    count += countUnresolvedRefs(child, depth + 1);
  }
  return count;
}

function parseSkill(raw: unknown): AgentCardSkillSummary {
  if (!isPlainObject(raw)) {
    return { id: null, name: null, description: null, tags: [] };
  }
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === "string")
    : [];
  return {
    id: asString(raw.id) ?? asString(raw.skillId),
    name: asString(raw.name),
    description: asString(raw.description),
    tags,
  };
}

export function parseAgentCardDocument(
  value: unknown,
): ParsedAgentCardSummary | null {
  if (!isPlainObject(value)) return null;

  // Reject obvious OpenAPI docs mistaken for agent-cards.
  if (typeof value.openapi === "string" || typeof value.swagger === "string") {
    return null;
  }

  const skillsRaw = Array.isArray(value.skills) ? value.skills : [];
  const skills = skillsRaw.map(parseSkill);
  const skillIds = skills
    .map((s) => s.id)
    .filter((id): id is string => id != null && id.length > 0);

  const capabilities = isPlainObject(value.capabilities)
    ? Object.keys(value.capabilities).sort()
    : [];

  return {
    kind: "agent-card",
    name: asString(value.name),
    description: asString(value.description),
    version: asString(value.version),
    url: asString(value.url),
    protocolVersion:
      asString(value.protocolVersion) ?? asString(value.protocol_version),
    skillCount: skills.length,
    skills,
    skillIds,
    capabilitiesKeys: capabilities,
    hasAdditionalInterfaces: Array.isArray(value.additionalInterfaces)
      ? value.additionalInterfaces.length > 0
      : value.additionalInterfaces != null,
    rawTopLevelKeys: Object.keys(value).sort(),
  };
}

export function parseOpenApiDocument(
  value: unknown,
): ParsedOpenApiSummary | null {
  if (!isPlainObject(value)) return null;

  const openapi = asString(value.openapi) ?? asString(value.swagger);
  const pathsValue = value.paths;
  // Require an object `paths` (may be empty) OR an openapi/swagger version string.
  if (!isPlainObject(pathsValue) && openapi == null) {
    return null;
  }

  const paths = isPlainObject(pathsValue) ? pathsValue : {};
  const operations: OpenApiOperationSummary[] = [];
  const pathKeys = Object.keys(paths).sort();
  for (const path of pathKeys) {
    const item = paths[path];
    if (!isPlainObject(item)) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isPlainObject(op)) continue;
      operations.push({
        path,
        method: method.toUpperCase(),
        approvedForFollowUp: false,
        operationId: asString(op.operationId),
        summary: asString(op.summary),
      });
    }
  }

  const info = isPlainObject(value.info) ? value.info : null;

  return {
    kind: "openapi",
    openapi,
    title: info ? asString(info.title) : null,
    version: info ? asString(info.version) : null,
    pathCount: pathKeys.length,
    operations,
    unresolvedRefCount: countUnresolvedRefs(value),
    rawTopLevelKeys: Object.keys(value).sort(),
  };
}

export function assessDocumentationCompatibility(
  kind: DiscoveryDocumentKind,
  document: ParsedDiscoveryDocument,
): DocumentationCompatibility {
  if (kind === "agent-card" && document.kind === "agent-card") {
    const tokens: string[] = [];
    for (const skill of document.skills) {
      if (skill.id) tokens.push(skill.id);
      if (skill.name) tokens.push(skill.name);
      tokens.push(...skill.tags);
      if (skill.description) tokens.push(skill.description);
    }
    if (document.description) tokens.push(document.description);
    if (document.name) tokens.push(document.name);

    const matchedSkillIds = document.skillIds.filter(isExplicitMvpMatch);
    const explicitFromNames = document.skills.some(
      (s) =>
        (s.name != null && isExplicitMvpMatch(s.name)) ||
        (s.id != null && isExplicitMvpMatch(s.id)) ||
        s.tags.some(isExplicitMvpMatch),
    );
    const explicitSkillMatch = matchedSkillIds.length > 0 || explicitFromNames;
    const relatedHints = collectRelatedHints(tokens);

    const notes = explicitSkillMatch
      ? `Agent-card skills explicitly reference ${MVP_TASK_ID}. This is documentation only — not endpointReachable, requestSchema, or payment verification.`
      : relatedHints.length > 0
        ? `Agent-card has related hints (${relatedHints.join(", ")}) but no exact ${MVP_TASK_ID} skill match. DocumentationCompatibility only.`
        : `Agent-card skills do not match ${MVP_TASK_ID}. No B4 milestone upgrade from this document.`;

    return {
      mvpTaskId: MVP_TASK_ID,
      documentKind: kind,
      explicitSkillMatch,
      matchedSkillIds: [...new Set(matchedSkillIds)].sort(),
      relatedHints,
      openApiOperations: [],
      notes,
      claimsEndpointStatus: false,
      claimsRequestSchemaVerified: false,
      claimsPaymentVerified: false,
    };
  }

  if (kind === "openapi" && document.kind === "openapi") {
    const tokens: string[] = [];
    for (const op of document.operations) {
      tokens.push(op.path, op.method);
      if (op.operationId) tokens.push(op.operationId);
      if (op.summary) tokens.push(op.summary);
    }
    if (document.title) tokens.push(document.title);
    const relatedHints = collectRelatedHints(tokens);
    const explicitSkillMatch = tokens.some(isExplicitMvpMatch);

    const notes = [
      `OpenAPI lists ${document.operations.length} operation(s) across ${document.pathCount} path(s); all marked approvedForFollowUp=false.`,
      document.unresolvedRefCount > 0
        ? `Document contains ${document.unresolvedRefCount} unresolved $ref value(s); refs were not fetched.`
        : "No $ref values observed (or none counted).",
      explicitSkillMatch
        ? `Textual mention of ${MVP_TASK_ID} found; still not an authorized operation.`
        : `No exact ${MVP_TASK_ID} operation identity found.`,
      "DocumentationCompatibility only — no ops executed.",
    ].join(" ");

    return {
      mvpTaskId: MVP_TASK_ID,
      documentKind: kind,
      explicitSkillMatch,
      matchedSkillIds: [],
      relatedHints,
      openApiOperations: document.operations,
      notes,
      claimsEndpointStatus: false,
      claimsRequestSchemaVerified: false,
      claimsPaymentVerified: false,
    };
  }

  return {
    mvpTaskId: MVP_TASK_ID,
    documentKind: kind,
    explicitSkillMatch: false,
    matchedSkillIds: [],
    relatedHints: [],
    openApiOperations: [],
    notes: `Document kind mismatch for expected ${kind}.`,
    claimsEndpointStatus: false,
    claimsRequestSchemaVerified: false,
    claimsPaymentVerified: false,
  };
}

/**
 * Parse bytes according to expected discovery document kind.
 */
export function parseDiscoveryDocumentBytes(
  kind: DiscoveryDocumentKind,
  body: Buffer,
): DocumentParseResult {
  const json = parseJsonBytes(body);
  if (!json.ok) {
    return { ok: false, reason: "invalidJson", message: json.message };
  }

  if (kind === "agent-card") {
    const document = parseAgentCardDocument(json.value);
    if (!document) {
      return {
        ok: false,
        reason: "invalidDocument",
        message: "Body is not a recognizable agent-card object",
      };
    }
    return {
      ok: true,
      document,
      compatibility: assessDocumentationCompatibility(kind, document),
    };
  }

  const document = parseOpenApiDocument(json.value);
  if (!document) {
    return {
      ok: false,
      reason: "invalidDocument",
      message: "Body is not a recognizable OpenAPI object",
    };
  }
  return {
    ok: true,
    document,
    compatibility: assessDocumentationCompatibility(kind, document),
  };
}

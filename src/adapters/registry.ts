/**
 * Offline capability-adapter registry (D5.2).
 *
 * Register / resolve by task type+version and capability ID.
 * Missing / duplicate / conflict handling — fail closed.
 * No network, wallets, or callable live execution.
 * Adapter registration ≠ callable authorization.
 */

import type {
  AdapterDefinitionMeta,
  AdapterResolveQuery,
  CapabilityAdapter,
} from "./types.ts";

export type RegisteredAdapter = {
  readonly meta: AdapterDefinitionMeta;
  readonly adapter: CapabilityAdapter<unknown, unknown>;
};

export type RegistryRegisterResult =
  | { readonly ok: true; readonly meta: AdapterDefinitionMeta }
  | {
      readonly ok: false;
      readonly code: "duplicateAdapterId" | "taskConflict" | "capabilityConflict";
      readonly message: string;
    };

export type RegistryResolveResult =
  | { readonly ok: true; readonly entry: RegisteredAdapter }
  | {
      readonly ok: false;
      readonly code: "notFound" | "ambiguous" | "taskCapabilityMismatch";
      readonly message: string;
    };

export type CapabilityAdapterRegistry = {
  register(
    adapter: CapabilityAdapter<unknown, unknown>,
  ): RegistryRegisterResult;
  resolve(query: AdapterResolveQuery): RegistryResolveResult;
  list(): readonly RegisteredAdapter[];
  clear(): void;
};

function taskKey(taskType: string, taskVersion: string): string {
  return `${taskType}@${taskVersion}`;
}

export function createCapabilityAdapterRegistry(): CapabilityAdapterRegistry {
  const byAdapterId = new Map<string, RegisteredAdapter>();
  const byTask = new Map<string, string>();
  const byCapability = new Map<string, string>();

  return {
    register(adapter) {
      const meta = adapter.meta;
      if (byAdapterId.has(meta.adapterId)) {
        return {
          ok: false,
          code: "duplicateAdapterId",
          message: `adapterId already registered: ${meta.adapterId}`,
        };
      }
      const tk = taskKey(meta.taskType, meta.taskVersion);
      const existingTask = byTask.get(tk);
      if (existingTask && existingTask !== meta.adapterId) {
        return {
          ok: false,
          code: "taskConflict",
          message: `task ${tk} already bound to ${existingTask}`,
        };
      }
      const existingCap = byCapability.get(meta.capabilityId);
      if (existingCap && existingCap !== meta.adapterId) {
        return {
          ok: false,
          code: "capabilityConflict",
          message: `capabilityId ${meta.capabilityId} already bound to ${existingCap}`,
        };
      }

      const entry: RegisteredAdapter = { meta, adapter };
      byAdapterId.set(meta.adapterId, entry);
      byTask.set(tk, meta.adapterId);
      byCapability.set(meta.capabilityId, meta.adapterId);
      return { ok: true, meta };
    },

    resolve(query) {
      if (query.by === "task") {
        const id = byTask.get(taskKey(query.taskType, query.taskVersion));
        if (!id) {
          return {
            ok: false,
            code: "notFound",
            message: `no adapter for task ${query.taskType}@${query.taskVersion}`,
          };
        }
        const entry = byAdapterId.get(id);
        if (!entry) {
          return { ok: false, code: "notFound", message: "registry inconsistency" };
        }
        return { ok: true, entry };
      }

      if (query.by === "capabilityId") {
        const id = byCapability.get(query.capabilityId);
        if (!id) {
          return {
            ok: false,
            code: "notFound",
            message: `no adapter for capabilityId ${query.capabilityId}`,
          };
        }
        const entry = byAdapterId.get(id);
        if (!entry) {
          return { ok: false, code: "notFound", message: "registry inconsistency" };
        }
        return { ok: true, entry };
      }

      // taskAndCapability — both must resolve to the same adapter
      const taskId = byTask.get(taskKey(query.taskType, query.taskVersion));
      const capId = byCapability.get(query.capabilityId);
      if (!taskId && !capId) {
        return {
          ok: false,
          code: "notFound",
          message: "no adapter for task or capabilityId",
        };
      }
      if (taskId && capId && taskId !== capId) {
        return {
          ok: false,
          code: "taskCapabilityMismatch",
          message: `task resolves to ${taskId} but capabilityId resolves to ${capId}`,
        };
      }
      const id = taskId ?? capId;
      if (!id) {
        return { ok: false, code: "notFound", message: "partial resolve failed" };
      }
      // If only one side found, still require the other matches meta
      const entry = byAdapterId.get(id);
      if (!entry) {
        return { ok: false, code: "notFound", message: "registry inconsistency" };
      }
      if (
        entry.meta.taskType !== query.taskType ||
        entry.meta.taskVersion !== query.taskVersion ||
        entry.meta.capabilityId !== query.capabilityId
      ) {
        return {
          ok: false,
          code: "taskCapabilityMismatch",
          message: "resolved adapter does not match both task and capabilityId",
        };
      }
      return { ok: true, entry };
    },

    list() {
      return [...byAdapterId.values()].sort((a, b) =>
        a.meta.adapterId.localeCompare(b.meta.adapterId),
      );
    },

    clear() {
      byAdapterId.clear();
      byTask.clear();
      byCapability.clear();
    },
  };
}

/** Default registry with the QuantJourney SEC identity draft adapter. */
export function createDefaultAdapterRegistry<TInput, TOutput>(
  secAdapter: CapabilityAdapter<TInput, TOutput>,
): CapabilityAdapterRegistry {
  const registry = createCapabilityAdapterRegistry();
  const result = registry.register(
    secAdapter as CapabilityAdapter<unknown, unknown>,
  );
  if (!result.ok) {
    throw new Error(`failed to seed default registry: ${result.message}`);
  }
  return registry;
}

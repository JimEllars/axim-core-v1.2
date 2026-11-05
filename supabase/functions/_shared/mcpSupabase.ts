/**
 * Adapts a Supabase/PostgREST client to the narrow `McpDataAccess` surface the
 * MCP tools are allowed to use.
 *
 * Kept separate from the tools for one reason: `mcpTools.ts` must stay free of
 * Supabase imports so it can be unit tested under Node, but the *translation*
 * from a `SelectSpec` to a PostgREST chain is exactly where a column-name or
 * operator mistake would hide. With the client injected as a structural
 * interface, `tests/mcp-supabase.test.js` can drive this with a recording fake
 * and assert the chain that actually gets built.
 *
 * The client is intentionally typed structurally rather than importing
 * `@supabase/supabase-js`: the Edge Functions load it from `esm.sh`, and a
 * module-level import here would make this file unloadable in Vitest.
 */

import type {
  Filter,
  McpDataAccess,
  ProbeOutcome,
  QueryOutcome,
  SelectSpec,
} from "./mcpTools.ts";

type Thenable<T> = { then: PromiseLike<T>["then"] };

export interface SelectBuilderLike extends Thenable<QueryOutcome> {
  eq(column: string, value: unknown): SelectBuilderLike;
  gte(column: string, value: unknown): SelectBuilderLike;
  order(column: string, options?: { ascending?: boolean }): SelectBuilderLike;
  limit(count: number): SelectBuilderLike;
}

export interface InsertBuilderLike extends Thenable<{ data: unknown; error: { message: string } | null }> {}

export interface SupabaseLike {
  from(table: string): {
    select(columns: string): SelectBuilderLike;
    insert(row: Record<string, unknown>): InsertBuilderLike;
  };
}

export interface DataAccessOptions {
  /** Table touched by `probe()`. Defaults to telemetry_events. */
  probeTable?: string;
  /** Injected clock; lets a test assert the latency number. */
  now?: () => number;
}

function applyFilters(builder: SelectBuilderLike, filters: Filter[] | undefined): SelectBuilderLike {
  let query = builder;
  for (const [column, op, value] of filters ?? []) {
    query = op === "gte" ? query.gte(column, value) : query.eq(column, value);
  }
  return query;
}

/** Build the ordered PostgREST chain for a `SelectSpec`. Exported for testing. */
export function buildSelect(
  client: SupabaseLike,
  table: string,
  spec: SelectSpec,
): SelectBuilderLike {
  let query = applyFilters(client.from(table).select(spec.columns), spec.filters);
  if (spec.order) {
    query = query.order(spec.order.column, { ascending: spec.order.ascending });
  }
  if (typeof spec.limit === "number") {
    query = query.limit(spec.limit);
  }
  return query;
}

export function createDataAccess(
  client: SupabaseLike,
  options: DataAccessOptions = {},
): McpDataAccess {
  const probeTable = options.probeTable ?? "telemetry_events";
  const now = options.now ?? Date.now;

  return {
    async select(table: string, spec: SelectSpec): Promise<QueryOutcome> {
      const outcome = await buildSelect(client, table, spec);
      return {
        data: (outcome?.data as Record<string, unknown>[] | null) ?? null,
        error: outcome?.error ?? null,
      };
    },

    async insert(table: string, row: Record<string, unknown>) {
      const outcome = await client.from(table).insert(row);
      return { error: outcome?.error ?? null };
    },

    async probe(): Promise<ProbeOutcome> {
      const startedAt = now();
      try {
        const outcome = await client.from(probeTable).select("id").limit(1);
        const latencyMs = now() - startedAt;
        if (outcome?.error) {
          return { ok: false, latencyMs, detail: outcome.error.message };
        }
        return { ok: true, latencyMs };
      } catch (error) {
        const latencyMs = now() - startedAt;
        return {
          ok: false,
          latencyMs,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

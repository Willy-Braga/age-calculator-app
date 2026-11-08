import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DataClient, ListOptions, InvokeResult } from "./client";
import { translateDbError } from "./client";
import type { TableName } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export class SupabaseDataClient implements DataClient {
  readonly mode = "supabase" as const;
  constructor(private sb: SupabaseClient) {}

  async list<T>(table: TableName, opts: ListOptions = {}): Promise<T[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = this.sb.from(table).select("*");
    for (const f of opts.filters ?? []) q = q[f.op](f.column, f.value);
    if (opts.orderBy) q = q.order(opts.orderBy.column, { ascending: opts.orderBy.ascending ?? true });
    q = q.limit(opts.limit ?? 5000);
    const { data, error } = await q;
    if (error) throw translateDbError(error);
    return data as T[];
  }

  async insert<T>(table: TableName, values: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]> {
    const { data, error } = await this.sb.from(table).insert(values).select("*");
    if (error) throw translateDbError(error);
    return data as T[];
  }

  async update<T>(table: TableName, match: Record<string, unknown>, patch: Record<string, unknown>): Promise<T[]> {
    const { data, error } = await this.sb.from(table).update(patch).match(match).select("*");
    if (error) throw translateDbError(error);
    return data as T[];
  }

  async upsert<T>(table: TableName, values: Record<string, unknown>, onConflict: string): Promise<T[]> {
    const { data, error } = await this.sb.from(table).upsert(values, { onConflict }).select("*");
    if (error) throw translateDbError(error);
    return data as T[];
  }

  async remove(table: TableName, match: Record<string, unknown>): Promise<void> {
    const { error } = await this.sb.from(table).delete().match(match);
    if (error) throw translateDbError(error);
  }

  async invoke(fn: string, body: Record<string, unknown>): Promise<InvokeResult> {
    const { data, error } = await this.sb.functions.invoke(fn, { body });
    if (error) {
      return {
        ok: false,
        result: "funcao_indisponivel",
        message: `A Edge Function "${fn}" não respondeu. Verifique se ela foi publicada (supabase functions deploy ${fn}). Detalhe: ${error.message}`,
      };
    }
    return data as InvokeResult;
  }
}

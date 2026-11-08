import type { TableName } from "./types";

export type FilterOp = "eq" | "neq" | "in" | "is" | "gte" | "lte" | "gt" | "lt";
export interface QueryFilter { column: string; op: FilterOp; value: unknown }
export interface ListOptions {
  filters?: QueryFilter[];
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
}

export interface InvokeResult { ok: boolean; message: string; result?: string; [k: string]: unknown }

/**
 * Contrato único de acesso a dados. Implementado por:
 *  - SupabaseDataClient: banco real (PostgreSQL + RLS)
 *  - DemoDataClient: armazenamento local isolado, SOMENTE para o modo DEMO
 */
export interface DataClient {
  readonly mode: "supabase" | "demo";
  list<T>(table: TableName, opts?: ListOptions): Promise<T[]>;
  insert<T>(table: TableName, values: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]>;
  update<T>(table: TableName, match: Record<string, unknown>, patch: Record<string, unknown>): Promise<T[]>;
  upsert<T>(table: TableName, values: Record<string, unknown>, onConflict: string): Promise<T[]>;
  remove(table: TableName, match: Record<string, unknown>): Promise<void>;
  /** Edge Functions (operações sensíveis no servidor). */
  invoke(fn: string, body: Record<string, unknown>): Promise<InvokeResult>;
}

export class DataError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

/** Traduz erros comuns do PostgREST/Postgres para mensagens em português. */
export function translateDbError(err: { message?: string; code?: string } | null | undefined): DataError {
  const code = err?.code;
  const msg = err?.message ?? "Erro desconhecido";
  if (code === "23505") return new DataError("Registro duplicado: já existe um item com esses dados.", code);
  if (code === "23503") return new DataError("Registro relacionado não encontrado ou em uso.", code);
  if (code === "23514") return new DataError("Valor inválido para as regras do banco de dados.", code);
  if (code === "42501") return new DataError("Você não tem permissão para esta ação.", code);
  if (code === "PGRST301" || /JWT/i.test(msg)) return new DataError("Sessão expirada. Entre novamente.", code);
  if (/Failed to fetch|NetworkError/i.test(msg)) return new DataError("Falha de conexão com o servidor.", code);
  return new DataError(msg, code);
}

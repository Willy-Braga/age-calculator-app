import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Valida o JWT do usuário e confirma que ele pode administrar a organização
 * dona da integração. Retorna o client com service_role (somente servidor).
 */
export async function authorizeIntegration(req: Request, integrationId: string): Promise<
  { ok: true; admin: SupabaseClient; userId: string; integration: Record<string, unknown> } | { ok: false; status: number; error: string }
> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return { ok: false, status: 401, error: "Sessão inválida." };

  // RLS do próprio usuário garante que ele enxerga a integração.
  const { data: integration, error } = await userClient
    .from("integrations").select("*").eq("id", integrationId).maybeSingle();
  if (error || !integration) return { ok: false, status: 404, error: "Integração não encontrada." };

  const { data: isAdmin } = await userClient.rpc("is_org_admin", { org: integration.organization_id });
  if (!isAdmin) return { ok: false, status: 403, error: "Apenas administradores podem gerenciar integrações." };

  const admin = createClient(url, service, { auth: { persistSession: false } });
  return { ok: true, admin, userId: userData.user.id, integration };
}

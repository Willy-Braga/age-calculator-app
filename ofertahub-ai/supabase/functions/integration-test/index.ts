// Executa um teste de conexão REAL com a plataforma usando o adaptador oficial.
// Sem adaptador implementado, o status NÃO é alterado para "conectada_validada".
import { corsHeaders, json } from "../_shared/cors.ts";
import { authorizeIntegration } from "../_shared/auth.ts";
import { adapters } from "../_shared/adapters.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => null) as { integration_id?: string } | null;
  if (!body?.integration_id) return json({ error: "integration_id obrigatório" }, 400);

  const auth = await authorizeIntegration(req, body.integration_id);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { admin, integration } = auth;
  const code = integration.platform_code as string;

  const log = (level: string, action: string, message: string, details?: unknown) =>
    admin.from("integration_logs").insert({
      organization_id: integration.organization_id, integration_id: integration.id, platform_code: code, level, action, message, details,
    });

  const adapter = adapters[code];
  if (!adapter) {
    const message = "Ainda não existe adaptador oficial implementado para esta plataforma. Nenhuma chamada foi feita e o status não foi alterado.";
    await log("aviso", "teste_conexao", message);
    return json({ ok: false, result: "adaptador_indisponivel", message });
  }

  const { data: cred } = await admin.from("integration_credentials").select("payload").eq("integration_id", integration.id).maybeSingle();
  if (!cred) {
    const message = "Credenciais não configuradas.";
    await log("aviso", "teste_conexao", message);
    return json({ ok: false, result: "sem_credenciais", message });
  }

  try {
    const result = await adapter.testConnection(cred.payload as Record<string, string>);
    await admin.from("integrations").update(result.ok
      ? { status: "conectada_validada", last_validated_at: new Date().toISOString(), last_error: null }
      : { status: "erro", last_error: result.message }).eq("id", integration.id);
    await log(result.ok ? "info" : "erro", "teste_conexao", result.message, result.details);
    return json({ ok: result.ok, result: result.ok ? "validada" : "falhou", message: result.message });
  } catch (e) {
    const message = `Falha de rede ao contatar a plataforma: ${(e as Error).message}`;
    await admin.from("integrations").update({ status: "erro", last_error: message }).eq("id", integration.id);
    await log("erro", "teste_conexao", message);
    return json({ ok: false, result: "falhou", message });
  }
});

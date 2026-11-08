// Salva credenciais de integração SOMENTE no servidor (tabela sem acesso pelo navegador).
// Nunca retorna os valores salvos.
import { corsHeaders, json } from "../_shared/cors.ts";
import { authorizeIntegration } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const body = await req.json().catch(() => null) as { integration_id?: string; credentials?: Record<string, unknown>; remove?: boolean } | null;
  if (!body?.integration_id) return json({ error: "integration_id obrigatório" }, 400);

  const auth = await authorizeIntegration(req, body.integration_id);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { admin, integration } = auth;

  if (body.remove) {
    await admin.from("integration_credentials").delete().eq("integration_id", integration.id);
    await admin.from("integrations").update({ has_credentials: false, status: "nao_configurada", last_validated_at: null }).eq("id", integration.id);
    await admin.from("integration_logs").insert({
      organization_id: integration.organization_id, integration_id: integration.id,
      platform_code: integration.platform_code, level: "info", action: "credenciais_removidas", message: "Credenciais removidas.",
    });
    return json({ ok: true });
  }

  const creds = body.credentials ?? {};
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (typeof v !== "string" || !/^[a-z_]{2,40}$/.test(k)) return json({ error: `Campo inválido: ${k}` }, 400);
    if (v.length > 4000) return json({ error: `Valor muito longo: ${k}` }, 400);
    if (v.trim()) clean[k] = v.trim();
  }
  if (Object.keys(clean).length === 0) return json({ error: "Nenhuma credencial informada." }, 400);

  const { error } = await admin.from("integration_credentials").upsert({
    integration_id: integration.id, organization_id: integration.organization_id, payload: clean, updated_at: new Date().toISOString(),
  });
  if (error) return json({ error: "Falha ao salvar credenciais." }, 500);

  // "configurada" != "conectada e validada": a validação só ocorre em integration-test.
  await admin.from("integrations").update({ has_credentials: true, status: "configurada", last_error: null }).eq("id", integration.id);
  await admin.from("integration_logs").insert({
    organization_id: integration.organization_id, integration_id: integration.id, platform_code: integration.platform_code,
    level: "info", action: "credenciais_salvas", message: `Credenciais salvas (${Object.keys(clean).join(", ")}). Aguardando teste de conexão.`,
  });
  return json({ ok: true, fields: Object.keys(clean) });
});

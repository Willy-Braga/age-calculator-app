import * as React from "react";
import { BookOpen, KeyRound, PlugZap, ScrollText, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";
import { useList, useTableMutation } from "@/hooks/useData";
import { useSession } from "@/lib/auth/AppContext";
import type { AffiliatePlatform, Integration, IntegrationLog, IntegrationStatus, PlatformAvailability } from "@/lib/data/types";
import { CREDENTIAL_FIELDS, PLATFORM_COLORS } from "@/lib/data/platformCatalog";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export const INTEGRATION_STATUS: Record<IntegrationStatus, { label: string; variant: "muted" | "warning" | "success" | "danger" | "default" }> = {
  nao_configurada: { label: "Não configurada", variant: "muted" },
  configurada: { label: "Configurada (não validada)", variant: "warning" },
  conectada_validada: { label: "Conectada e validada", variant: "success" },
  erro: { label: "Erro", variant: "danger" },
  indisponivel: { label: "Integração não disponível", variant: "muted" },
};

const AVAILABILITY: Record<PlatformAvailability, { label: string; variant: "success" | "warning" | "danger" | "muted" | "violet" }> = {
  disponivel: { label: "API disponível com credenciais da conta", variant: "success" },
  requer_aprovacao: { label: "API exige aprovação da plataforma", variant: "warning" },
  limitada: { label: "API limitada para afiliados", variant: "warning" },
  indisponivel: { label: "Sem API", variant: "danger" },
  manual: { label: "Somente manual / CSV", variant: "violet" },
};

const FEATURE_LABEL: Record<string, string> = {
  busca_produtos: "Busca de produtos", preco_atual: "Preço atual", link_afiliado: "Geração de links", relatorio_csv: "Relatórios CSV",
  relatorio_conversoes: "Relatório de conversões", dados_item: "Dados de anúncio", reputacao_vendedor: "Reputação do vendedor",
  link_afiliado_manual: "Links manuais", historico_vendas: "Histórico de vendas", comissoes: "Comissões", vendas: "Vendas",
  cadastro_manual: "Cadastro manual", importacao_csv: "Importação CSV",
};

function ConfigureDialog({ platform, integration, onClose }: { platform: AffiliatePlatform | null; integration?: Integration; onClose: () => void }) {
  const { client } = useSession();
  const qc = useQueryClient();
  const update = useTableMutation("integrations", "update", { success: "Configuração salva." });
  const [affiliateId, setAffiliateId] = React.useState("");
  const [method, setMethod] = React.useState("manual");
  const [commission, setCommission] = React.useState("");
  const [creds, setCreds] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    setAffiliateId(integration?.affiliate_identifier ?? "");
    setMethod(integration?.connection_method ?? "manual");
    setCommission(integration?.commission_info ?? "");
    setCreds({});
  }, [integration, platform]);
  if (!platform || !integration) return null;
  const fields = CREDENTIAL_FIELDS[platform.code] ?? [];

  const saveAll = async () => {
    setSaving(true);
    try {
      await update.mutateAsync({ match: { id: integration.id }, patch: { affiliate_identifier: affiliateId || null, connection_method: method, commission_info: commission || null } });
      if (method === "api_oficial" && Object.values(creds).some((v) => v.trim())) {
        const r = await client.invoke("integration-credentials", { integration_id: integration.id, credentials: creds });
        if (r.ok) toast.success("Credenciais salvas no servidor. Execute o teste de conexão para validar.");
        else toast.error(r.message ?? (r as { error?: string }).error ?? "Falha ao salvar credenciais.");
        qc.invalidateQueries({ predicate: (q) => q.queryKey[2] === "integrations" || q.queryKey[2] === "integration_logs" });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar {platform.name}</DialogTitle>
          <DialogDescription>Preencher este formulário NÃO conecta a integração. O status “Conectada e validada” só é definido pelo servidor após um teste real.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Método de conexão" htmlFor="method">
            <NativeSelect id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
              {platform.connection_methods.map((m) => <option key={m} value={m}>{{ api_oficial: "API oficial", manual: "Manual", csv: "Importação CSV" }[m] ?? m}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Identificador de afiliado" htmlFor="affid" hint="Ex.: tag de associado, ID de afiliado. Não é segredo.">
            <Input id="affid" value={affiliateId} onChange={(e) => setAffiliateId(e.target.value)} />
          </Field>
          <Field label="Informações de comissão" htmlFor="comm" hint="Copie da tabela oficial do programa (não estimamos taxas).">
            <Input id="comm" value={commission} onChange={(e) => setCommission(e.target.value)} />
          </Field>
          {method === "api_oficial" && (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4" /> Credenciais (enviadas apenas ao servidor)</p>
              {fields.length === 0 ? <p className="text-xs text-muted-foreground">Esta plataforma não possui API oficial configurável.</p> : fields.map((f) => (
                <Field key={f.key} label={f.label} htmlFor={f.key}>
                  <Input id={f.key} type="password" autoComplete="off" placeholder={integration.has_credentials ? "•••••• (salvo — preencha para substituir)" : ""} value={creds[f.key] ?? ""} onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))} />
                </Field>
              ))}
              <p className="text-[11px] text-muted-foreground">As credenciais são gravadas por uma Edge Function numa tabela inacessível ao navegador e nunca são exibidas novamente.</p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={saveAll} loading={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogsDialog({ integration, platform, onClose }: { integration: Integration | null; platform?: AffiliatePlatform; onClose: () => void }) {
  const logs = useList<IntegrationLog>("integration_logs", { filters: [{ column: "integration_id", op: "eq", value: integration?.id ?? "" }], orderBy: { column: "created_at", ascending: false }, limit: 100 }, !!integration);
  return (
    <Dialog open={!!integration} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader><DialogTitle>Logs — {platform?.name}</DialogTitle></DialogHeader>
        <DialogBody>
          {logs.isLoading ? <LoadingRows rows={3} /> : !logs.data?.length ? <EmptyState icon={ScrollText} title="Nenhum log registrado" description="Logs aparecem ao salvar credenciais e executar testes de conexão." /> : (
            <ul className="space-y-2">
              {logs.data.map((l) => (
                <li key={l.id} className="rounded-lg border p-2.5 text-sm">
                  <div className="flex items-center gap-2 text-xs"><Badge variant={l.level === "erro" ? "danger" : l.level === "aviso" ? "warning" : "muted"}>{l.level}</Badge><span className="font-medium">{l.action}</span><span className="ml-auto text-muted-foreground">{formatDateTime(l.created_at)}</span></div>
                  <p className="mt-1">{l.message}</p>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function IntegrationsPage() {
  const { client, mode } = useSession();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const platforms = useList<AffiliatePlatform>("affiliate_platforms", { orderBy: { column: "sort_order" } });
  const integrations = useList<Integration>("integrations");
  const [configuring, setConfiguring] = React.useState<string | null>(null);
  const [logsFor, setLogsFor] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState<string | null>(null);

  const integ = (code: string) => integrations.data?.find((i) => i.platform_code === code);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => ["integrations", "integration_logs"].includes(q.queryKey[2] as string) });

  const test = async (i: Integration) => {
    setTesting(i.id);
    try {
      const r = await client.invoke("integration-test", { integration_id: i.id });
      if (r.ok) toast.success(r.message);
      else toast.warning(r.message ?? "Teste não concluído.");
      refresh();
    } finally {
      setTesting(null);
    }
  };

  const removeCreds = async (i: Integration) => {
    if (!(await confirm({ title: "Remover credenciais?", description: "A integração voltará para “Não configurada”.", confirmLabel: "Remover", destructive: true }))) return;
    const r = await client.invoke("integration-credentials", { integration_id: i.id, remove: true });
    if (r.ok) toast.success("Credenciais removidas."); else toast.error(r.message);
    refresh();
  };

  const err = platforms.error ?? integrations.error;
  return (
    <div className="animate-fade-in">
      <PageHeader title="Plataformas e Integrações" description="Estado real de cada integração. Um formulário preenchido não é uma integração conectada — somente um teste real no servidor valida a conexão." />
      <Tabs defaultValue="plataformas">
        <TabsList>
          <TabsTrigger value="plataformas"><PlugZap /> Plataformas</TabsTrigger>
          <TabsTrigger value="viabilidade"><BookOpen /> Viabilidade das integrações</TabsTrigger>
        </TabsList>
        <TabsContent value="plataformas">
          {mode === "demo" && <p className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">Modo DEMO: testes de conexão e salvamento de credenciais não são executados.</p>}
          {err ? <ErrorState error={err} /> : platforms.isLoading || integrations.isLoading ? <LoadingRows /> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {platforms.data!.map((p) => {
                const i = integ(p.code);
                const st = INTEGRATION_STATUS[i?.status ?? "nao_configurada"];
                const av = AVAILABILITY[p.availability];
                return (
                  <Card key={p.code} className="flex flex-col">
                    <CardHeader className="flex-row items-center gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: PLATFORM_COLORS[p.code] ?? "#64748b" }} aria-hidden>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{p.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1"><Badge variant={st.variant}>{st.label}</Badge></div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-3 text-xs">
                      <Badge variant={av.variant} className="self-start">{av.label}</Badge>
                      <div className="flex flex-wrap gap-1">{p.supported_features.map((f) => <Badge key={f} variant="outline">{FEATURE_LABEL[f] ?? f}</Badge>)}</div>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                        <dt className="text-muted-foreground">Método</dt><dd>{i?.connection_method ?? "—"}</dd>
                        <dt className="text-muted-foreground">ID de afiliado</dt><dd className="truncate">{i?.affiliate_identifier ?? "—"}</dd>
                        <dt className="text-muted-foreground">Comissões</dt><dd>{i?.commission_info ?? "Não informado"}</dd>
                        <dt className="text-muted-foreground">Credenciais</dt><dd>{i?.has_credentials ? "Salvas no servidor" : "Nenhuma"}</dd>
                        <dt className="text-muted-foreground">Validação</dt><dd>{i?.last_validated_at ? formatRelative(i.last_validated_at) : "Nunca"}</dd>
                        <dt className="text-muted-foreground">Sincronização</dt><dd>{i?.last_sync_at ? formatRelative(i.last_sync_at) : "Nunca"}</dd>
                      </dl>
                      {i?.last_error && <p className="rounded-md bg-danger/10 p-2 text-danger">{i.last_error}</p>}
                      <p className="text-muted-foreground">{p.known_limits}</p>
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                        <Button size="sm" variant="outline" onClick={() => setConfiguring(p.code)} disabled={!i}><Settings2 /> Configurar</Button>
                        <Button size="sm" variant="outline" onClick={() => i && test(i)} loading={testing === i?.id} disabled={!i || p.availability === "manual"} title={p.availability === "manual" ? "Plataforma sem API" : undefined}>
                          <ShieldCheck /> Testar conexão
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setLogsFor(i?.id ?? null)} disabled={!i}><ScrollText /> Logs</Button>
                        {i?.has_credentials && <Button size="sm" variant="ghost" className="text-danger" onClick={() => removeCreds(i)}><Trash2 /> Credenciais</Button>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="viabilidade">
          <Card>
            <CardContent className="space-y-4 p-5 text-sm">
              <p className="text-muted-foreground">Panorama honesto antes de conectar serviços externos. Confirme sempre na documentação oficial — políticas mudam.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground"><tr><th className="py-2 pr-3">Plataforma</th><th className="pr-3">Situação</th><th className="pr-3">Credenciais</th><th className="pr-3">Limitações</th><th>Alternativa</th></tr></thead>
                  <tbody className="divide-y">
                    {platforms.data?.map((p) => (
                      <tr key={p.code} className="align-top">
                        <td className="py-2 pr-3 font-medium">{p.name}{p.official_docs_url && <a className="block text-primary hover:underline" href={p.official_docs_url} target="_blank" rel="noopener noreferrer">documentação</a>}</td>
                        <td className="pr-3"><Badge variant={AVAILABILITY[p.availability].variant}>{AVAILABILITY[p.availability].label}</Badge></td>
                        <td className="pr-3">{p.required_credentials.join(", ") || "—"}</td>
                        <td className="pr-3 text-muted-foreground">{p.known_limits}</td>
                        <td className={cn("text-muted-foreground")}>{p.notes ?? "Inclusão manual e importação de relatórios CSV oficiais."}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                <li>Nenhum scraping não autorizado, bypass de CAPTCHA ou evasão de bloqueios será implementado.</li>
                <li>WhatsApp: publicação manual (copiar e compartilhar). A API oficial do WhatsApp Business não deve ser presumida para grupos/Comunidades.</li>
                <li>Adaptador com teste real já implementado no servidor: <strong>Hotmart</strong> (emissão de token OAuth). Demais: contrato pronto, aguardando credenciais aprovadas.</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <ConfigureDialog platform={platforms.data?.find((p) => p.code === configuring) ?? null} integration={configuring ? integ(configuring) : undefined} onClose={() => setConfiguring(null)} />
      <LogsDialog integration={integrations.data?.find((i) => i.id === logsFor) ?? null} platform={platforms.data?.find((p) => p.code === integrations.data?.find((i) => i.id === logsFor)?.platform_code)} onClose={() => setLogsFor(null)} />
    </div>
  );
}

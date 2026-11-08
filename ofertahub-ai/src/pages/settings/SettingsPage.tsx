import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Save, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { LoadingRows } from "@/components/ui/states";
import { useOrgSettings, useUserPrefs } from "@/hooks/useSettings";
import { useList, useTableMutation } from "@/hooks/useData";
import { useSession } from "@/lib/auth/AppContext";
import { supabase } from "@/lib/data/supabase";
import type { AffiliatePlatform, FilterProfile, Organization, Profile, OfferWithProduct, Product, ProductOffer } from "@/lib/data/types";
import { orgSettingsSchema, SCORE_COMPONENTS, type OrgSettings, type ThemePref } from "@/lib/domain/settings";
import { verifiedDiscount } from "@/lib/domain/offers";

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-medium">{title}</p>{description && <p className="text-xs text-muted-foreground">{description}</p>}</div>
      <div className="sm:w-72 sm:shrink-0 sm:text-right">{children}</div>
    </div>
  );
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function SettingsPage() {
  const [params] = useSearchParams();
  const { client, orgId, user, mode } = useSession();
  const { settings, save, isLoading } = useOrgSettings();
  const { prefs, update: updatePrefs } = useUserPrefs();
  const [draft, setDraft] = React.useState<OrgSettings | null>(null);
  const [catInput, setCatInput] = React.useState("");
  const platforms = useList<AffiliatePlatform>("affiliate_platforms", { orderBy: { column: "sort_order" } }).data ?? [];
  const profiles = useList<FilterProfile>("filter_profiles", { orderBy: { column: "name" } }).data ?? [];
  const profile = useList<Profile>("profiles", { filters: [{ column: "id", op: "eq", value: user.id }] }).data?.[0];
  const org = useList<Organization>("organizations", { filters: [{ column: "id", op: "eq", value: orgId }] }).data?.[0];
  const updateProfile = useTableMutation("profiles", "update", { success: "Perfil atualizado." });
  const updateOrg = useTableMutation("organizations", "update", { success: "Organização atualizada." });
  const [name, setName] = React.useState("");
  const [orgName, setOrgName] = React.useState("");
  const [pw, setPw] = React.useState({ a: "", b: "" });

  React.useEffect(() => { if (settings) setDraft(settings); }, [settings]);
  React.useEffect(() => { setName(profile?.full_name ?? ""); }, [profile]);
  React.useEffect(() => { setOrgName(org?.name ?? ""); }, [org]);

  if (isLoading || !draft) return <LoadingRows rows={6} />;
  const set = <K extends keyof OrgSettings>(k: K, v: OrgSettings[K]) => setDraft((d) => ({ ...d!, [k]: v }));
  const weightSum = Object.values(draft.scoringWeights).reduce((s, v) => s + v, 0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const persist = () => {
    const parsed = orgSettingsSchema.safeParse(draft);
    if (!parsed.success) { toast.error("Revise as configurações", { description: parsed.error.issues.map((i) => i.message).join(" • ") }); return; }
    save.mutate(parsed.data);
  };

  const exportJson = async () => {
    const [products, offers, observations, filters] = await Promise.all([
      client.list<Product>("products", { filters: [{ column: "organization_id", op: "eq", value: orgId }] }),
      client.list<ProductOffer>("product_offers", { filters: [{ column: "organization_id", op: "eq", value: orgId }] }),
      client.list("price_observations", { filters: [{ column: "organization_id", op: "eq", value: orgId }] }),
      client.list("filter_profiles", { filters: [{ column: "organization_id", op: "eq", value: orgId }] }),
    ]);
    download(`ofertahub-export-${new Date().toISOString().slice(0, 10)}${mode === "demo" ? "-DEMO" : ""}.json`,
      JSON.stringify({ exported_at: new Date().toISOString(), mode, settings, products, offers, price_observations: observations, filter_profiles: filters }, null, 2), "application/json");
  };
  const exportCsv = async () => {
    const [products, offers] = await Promise.all([
      client.list<Product>("products", { filters: [{ column: "organization_id", op: "eq", value: orgId }] }),
      client.list<ProductOffer>("product_offers", { filters: [{ column: "organization_id", op: "eq", value: orgId }] }),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const header = ["id", "produto", "marca", "modelo", "categoria", "plataforma", "status", "preco_atual", "preco_referencia", "origem_referencia", "desconto_verificado", "frete", "estoque", "avaliacao", "qtd_avaliacoes", "cupom", "comissao", "pontuacao", "link_original", "link_afiliado", "ultima_verificacao", "demo"];
    const lines = offers.map((o) => {
      const p = byId.get(o.product_id);
      const full = { ...o, product: p } as OfferWithProduct;
      return [o.id, p?.name, p?.brand, p?.model, p?.category, o.platform_code, o.status, o.current_price, o.reference_price, o.reference_price_source, verifiedDiscount(full), o.shipping_cost, o.stock_status, o.rating, o.rating_count, o.coupon_code, o.commission_rate, o.score, o.original_url, o.affiliate_url, o.last_verified_at, o.is_demo ? "sim" : "não"].map(csvEscape).join(";");
    });
    download(`ofertas-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + [header.join(";"), ...lines].join("\n"), "text/csv;charset=utf-8");
  };

  const SaveBar = () => (
    <div className="mt-4 flex items-center justify-end gap-2">
      {dirty && <span className="text-xs text-warning">Alterações não salvas</span>}
      <Button variant="outline" disabled={!dirty} onClick={() => setDraft(settings!)}>Descartar</Button>
      <Button onClick={persist} disabled={!dirty} loading={save.isPending}><Save /> Salvar</Button>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <PageHeader title="Configurações" description="Preferências salvas no banco de dados e aplicadas em todo o aplicativo." />
      <Tabs defaultValue={params.get("aba") ?? "perfil"}>
        <TabsList className="mb-1 flex-wrap">
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="aparencia">Aparência</TabsTrigger>
          <TabsTrigger value="preferencias">Categorias e filtros</TabsTrigger>
          <TabsTrigger value="pontuacao">Pontuação</TabsTrigger>
          <TabsTrigger value="aprovacao">Aprovação</TabsTrigger>
          <TabsTrigger value="plataformas">Plataformas e verificação</TabsTrigger>
          <TabsTrigger value="notificacoes">Notificações</TabsTrigger>
          <TabsTrigger value="ia">IA</TabsTrigger>
          <TabsTrigger value="seguranca">Segurança</TabsTrigger>
          <TabsTrigger value="dados">Dados e exportações</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil">
          <Card><CardContent className="space-y-4 p-5">
            <Row title="Nome"><div className="flex gap-2"><Input aria-label="Nome" value={name} onChange={(e) => setName(e.target.value)} /><Button variant="outline" onClick={() => updateProfile.mutate({ match: { id: user.id }, patch: { full_name: name || null } })}>Salvar</Button></div></Row>
            <Row title="E-mail" description="Usado para login e recuperação de senha"><span className="text-sm">{user.email}</span></Row>
            <Row title="Organização" description="Estrutura preparada para múltiplos usuários e organizações"><div className="flex gap-2"><Input aria-label="Nome da organização" value={orgName} onChange={(e) => setOrgName(e.target.value)} /><Button variant="outline" disabled={orgName.trim().length < 2} onClick={() => updateOrg.mutate({ match: { id: orgId }, patch: { name: orgName.trim() } })}>Salvar</Button></div></Row>
            <Row title="Modo"><Badge variant={mode === "demo" ? "demo" : "success"}>{mode === "demo" ? "DEMO — dados fictícios locais" : "Dados reais (Supabase)"}</Badge></Row>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="aparencia">
          <Card><CardContent className="p-5">
            <Row title="Tema"><NativeSelect aria-label="Tema" value={prefs.theme} onChange={(e) => updatePrefs({ theme: e.target.value as ThemePref })}><option value="dark">Escuro</option><option value="light">Claro</option><option value="system">Seguir o sistema</option></NativeSelect></Row>
            <Row title="Visualização padrão das ofertas"><NativeSelect aria-label="Visualização" value={prefs.offersView} onChange={(e) => updatePrefs({ offersView: e.target.value as "cards" | "tabela" })}><option value="cards">Cards</option><option value="tabela">Tabela</option></NativeSelect></Row>
            <Row title="Menu lateral recolhido"><Switch checked={prefs.sidebarCollapsed} onCheckedChange={(v) => updatePrefs({ sidebarCollapsed: v })} aria-label="Menu recolhido" /></Row>
            <p className="pt-2 text-xs text-muted-foreground">Preferências de aparência são salvas automaticamente para o seu usuário.</p>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="preferencias">
          <Card><CardContent className="p-5">
            <Row title="Categorias favoritas" description="Usadas no componente “Interesse da audiência” da pontuação">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const c = catInput.trim(); if (c && !draft.favoriteCategories.includes(c)) set("favoriteCategories", [...draft.favoriteCategories, c]); setCatInput(""); }}>
                <Input aria-label="Nova categoria favorita" placeholder="Ex.: Tecnologia" value={catInput} onChange={(e) => setCatInput(e.target.value)} /><Button type="submit" variant="outline">Adicionar</Button>
              </form>
            </Row>
            <div className="flex flex-wrap gap-1.5 pb-3">
              {draft.favoriteCategories.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma categoria favorita.</span>}
              {draft.favoriteCategories.map((c) => (
                <Badge key={c} variant="violet" className="gap-1">{c}<button aria-label={`Remover ${c}`} onClick={() => set("favoriteCategories", draft.favoriteCategories.filter((x) => x !== c))}><X /></button></Badge>
              ))}
            </div>
            <Row title="Perfil de filtros padrão" description="Aplicado automaticamente na Central de Ofertas">
              <NativeSelect aria-label="Perfil padrão" value={draft.defaultFilterProfileId ?? ""} onChange={(e) => set("defaultFilterProfileId", e.target.value || null)}>
                <option value="">Nenhum</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </NativeSelect>
            </Row>
            <SaveBar />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="pontuacao">
          <Card>
            <CardHeader><CardTitle>Pesos da pontuação (0–100)</CardTitle><CardDescription>O total deve ser exatamente 100. Bloqueios obrigatórios (preço não confirmado, link inválido) sempre prevalecem sobre a nota.</CardDescription></CardHeader>
            <CardContent>
              {SCORE_COMPONENTS.map((c) => (
                <Row key={c.key} title={c.label} description={c.help}>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={60} step={1} className="flex-1 accent-[var(--primary)]" aria-label={`Peso ${c.label}`} value={draft.scoringWeights[c.key]} onChange={(e) => set("scoringWeights", { ...draft.scoringWeights, [c.key]: Number(e.target.value) })} />
                    <Input type="number" className="w-16 text-right" aria-label={`Peso numérico ${c.label}`} min={0} max={100} value={draft.scoringWeights[c.key]} onChange={(e) => set("scoringWeights", { ...draft.scoringWeights, [c.key]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                  </div>
                </Row>
              ))}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span>Total: <strong className={weightSum === 100 ? "text-success" : "text-danger"}>{weightSum}</strong> / 100</span>
                <Button size="sm" variant="ghost" onClick={() => set("scoringWeights", Object.fromEntries(SCORE_COMPONENTS.map((c) => [c.key, c.default])) as OrgSettings["scoringWeights"])}>Restaurar padrão (30/25/15/15/10/5)</Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Classificação: 85–100 Alta prioridade · 70–84 Revisão recomendada · abaixo de 70 Baixa prioridade.</p>
              <SaveBar />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aprovacao">
          <Card><CardContent className="p-5">
            <Row title="Modo de aprovação" description="A aprovação final é sempre humana nesta versão">
              <NativeSelect aria-label="Modo de aprovação" value={draft.approvalPolicy.mode} onChange={(e) => set("approvalPolicy", { ...draft.approvalPolicy, mode: e.target.value as OrgSettings["approvalPolicy"]["mode"] })}>
                <option value="manual">Manual — toda oferta passa por revisão</option>
                <option value="sugerir_alta_prioridade">Destacar ofertas de alta prioridade para aprovação</option>
              </NativeSelect>
            </Row>
            <Row title="Exigir preço confirmado" description="Bloqueia aprovação sem preço, sem verificação ou com desconto não verificável"><Switch aria-label="Exigir preço confirmado" checked={draft.approvalPolicy.requireVerifiedPrice} onCheckedChange={(v) => set("approvalPolicy", { ...draft.approvalPolicy, requireVerifiedPrice: v })} /></Row>
            <Row title="Exigir link válido" description="Bloqueia aprovação sem link ou com estrutura inválida"><Switch aria-label="Exigir link válido" checked={draft.approvalPolicy.requireLinkCheck} onCheckedChange={(v) => set("approvalPolicy", { ...draft.approvalPolicy, requireLinkCheck: v })} /></Row>
            <Row title="Texto de identificação publicitária" description="Incluído nas publicações (Fase 3)"><Input aria-label="Texto publicitário" value={draft.disclosureText} onChange={(e) => set("disclosureText", e.target.value)} /></Row>
            <SaveBar />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="plataformas">
          <Card><CardContent className="p-5">
            <p className="mb-2 text-sm font-medium">Plataformas autorizadas</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {platforms.map((p) => {
                const on = draft.authorizedPlatforms.includes(p.code);
                return <button key={p.code} aria-pressed={on} onClick={() => set("authorizedPlatforms", on ? draft.authorizedPlatforms.filter((c) => c !== p.code) : [...draft.authorizedPlatforms, p.code])} className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>{p.name}</button>;
              })}
            </div>
            <Row title="Frequência das verificações (horas)" description="Usada pelas automações da Fase 4; nenhuma tarefa externa é agendada sem credenciais"><Input type="number" aria-label="Frequência" min={1} max={720} value={draft.verificationFrequencyHours} onChange={(e) => set("verificationFrequencyHours", Number(e.target.value))} /></Row>
            <Row title="Idade máxima de uma verificação (horas)" description="Após esse prazo a oferta é considerada desatualizada"><Input type="number" aria-label="Idade máxima" min={1} value={draft.maxVerificationAgeHours} onChange={(e) => set("maxVerificationAgeHours", Number(e.target.value))} /></Row>
            <Row title="CEP de referência para frete" description="Opcional; usado para comparar frete"><Input aria-label="CEP" placeholder="00000-000" value={draft.referenceZipCode} onChange={(e) => set("referenceZipCode", e.target.value)} /></Row>
            <SaveBar />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="notificacoes">
          <Card><CardContent className="p-5">
            {([
              ["highScore", "Nova oferta com pontuação alta"], ["targetPrice", "Preço-alvo atingido"], ["outOfStock", "Produto fora de estoque"],
              ["expired", "Oferta expirada"], ["integrationFailure", "Falha de integração"], ["publicationPending", "Publicação aguardando aprovação"],
              ["automationError", "Automação com erro"], ["commissionImported", "Comissão importada ou atualizada"],
            ] as const).map(([k, l]) => (
              <Row key={k} title={l}><Switch aria-label={l} checked={draft.notifications[k]} onCheckedChange={(v) => set("notifications", { ...draft.notifications, [k]: v })} /></Row>
            ))}
            <SaveBar />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="ia">
          <Card><CardContent className="p-5">
            <Row title="Provedor de IA" description="Nenhum provedor é chamado sem credencial autorizada configurada no servidor">
              <NativeSelect aria-label="Provedor de IA" value={draft.ai.provider} onChange={(e) => set("ai", { ...draft.ai, provider: e.target.value as OrgSettings["ai"]["provider"] })}>
                <option value="nenhum">Nenhum (somente templates gratuitos)</option><option value="lovable_ai">Lovable AI</option><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option><option value="google">Google</option>
              </NativeSelect>
            </Row>
            <Row title="Usar templates determinísticos como alternativa" description="Garante funcionamento gratuito se a IA estiver indisponível"><Switch aria-label="Fallback de templates" checked={draft.ai.useTemplatesFallback} onCheckedChange={(v) => set("ai", { ...draft.ai, useTemplatesFallback: v })} /></Row>
            {draft.ai.provider !== "nenhum" && <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">Aguardando configuração: a chave do provedor deve ser cadastrada como <em>secret</em> das Edge Functions (nunca no navegador). O Gerador de Conteúdos é entregue na Fase 3.</p>}
            <SaveBar />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="seguranca">
          <Card><CardContent className="space-y-2 p-5">
            {mode === "demo" ? <p className="text-sm text-muted-foreground">Indisponível no modo DEMO.</p> : (
              <>
                <Row title="Alterar senha" description="Mínimo de 8 caracteres">
                  <div className="space-y-2">
                    <Input type="password" aria-label="Nova senha" placeholder="Nova senha" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
                    <Input type="password" aria-label="Confirmar senha" placeholder="Confirmar" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
                    <Button variant="outline" className="w-full" disabled={pw.a.length < 8 || pw.a !== pw.b} onClick={async () => {
                      const { error } = await supabase!.auth.updateUser({ password: pw.a });
                      if (error) toast.error(error.message); else { toast.success("Senha alterada."); setPw({ a: "", b: "" }); }
                    }}>Alterar senha</Button>
                  </div>
                </Row>
                <Row title="Encerrar outras sessões" description="Desconecta todos os outros dispositivos">
                  <Button variant="outline" onClick={async () => { const { error } = await supabase!.auth.signOut({ scope: "others" }); if (error) toast.error(error.message); else toast.success("Outras sessões encerradas."); }}>Encerrar</Button>
                </Row>
              </>
            )}
            <ul className="list-disc space-y-1 pl-5 pt-2 text-xs text-muted-foreground">
              <li>Row Level Security ativo em todas as tabelas: cada organização só acessa seus próprios dados.</li>
              <li>Credenciais de integrações ficam em tabela inacessível ao navegador, gravadas por Edge Function.</li>
              <li>Todas as alterações em ofertas, filtros, integrações e configurações são auditadas automaticamente.</li>
            </ul>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="dados">
          <Card><CardContent className="p-5">
            <Row title="Exportar dados (JSON)" description="Produtos, ofertas, histórico de preços, filtros e configurações"><Button variant="outline" onClick={exportJson}><Download /> Exportar JSON</Button></Row>
            <Row title="Exportar ofertas (CSV)" description="Planilha compatível com Excel (separador ;)"><Button variant="outline" onClick={exportCsv}><Download /> Exportar CSV</Button></Row>
            <Row title="Importação de dados" description="Produtos via CSV (Fase 2) e relatórios de afiliados (Fase 4)"><Badge variant="muted">Próximas fases</Badge></Row>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

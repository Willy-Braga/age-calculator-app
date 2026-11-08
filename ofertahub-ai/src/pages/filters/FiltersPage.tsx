import * as React from "react";
import { Copy, Pencil, Plus, Star, Trash2, FlaskConical } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";
import { useList, useTableMutation } from "@/hooks/useData";
import { useOrgSettings } from "@/hooks/useSettings";
import type { AffiliatePlatform, FilterProfile } from "@/lib/data/types";
import { EMPTY_RULES, TECH_PRESET, evaluateFilters, filterRulesSchema, type FilterRules } from "@/lib/domain/filters";
import { FILTER_DECISION } from "@/lib/domain/offers";
import { parseBRNumber, formatBRL } from "@/lib/format";
import { useOffers } from "../offers/useOffers";
import { DecisionBadge } from "../offers/badges";
import type { FilterDecision } from "@/lib/data/types";

// Formulário trabalha com strings para números (aceita vírgula decimal)
const numStr = z.string().trim().refine((v) => v === "" || parseBRNumber(v) != null, "Número inválido");
const formSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome").max(80),
  description: z.string().max(300),
  category: z.string().max(80),
  is_active: z.boolean(),
  minDiscount: numStr, minRating: numStr, minRatingCount: numStr, minPrice: numStr, maxPrice: numStr,
  minSellerReputation: numStr, minCommission: numStr, maxCommission: numStr, minDataQuality: numStr, maxVerificationAgeHours: numStr,
  minHistoryConfidence: z.string(),
  allowedPlatforms: z.array(z.string()),
  allowedCategories: z.string(),
  blockedTerms: z.string(),
  requireCoupon: z.boolean(), requireInStock: z.boolean(), requireHumanReview: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

const NUM_KEYS = ["minDiscount", "minRating", "minRatingCount", "minPrice", "maxPrice", "minSellerReputation", "minCommission", "maxCommission", "minDataQuality", "maxVerificationAgeHours"] as const;
const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

function toForm(p?: Partial<FilterProfile>): FormValues {
  const r = { ...EMPTY_RULES, ...(p?.rules ?? {}) };
  return {
    name: p?.name ?? "", description: p?.description ?? "", category: p?.category ?? "", is_active: p?.is_active ?? true,
    ...Object.fromEntries(NUM_KEYS.map((k) => [k, r[k] == null ? "" : String(r[k]).replace(".", ",")])) as Record<(typeof NUM_KEYS)[number], string>,
    minHistoryConfidence: r.minHistoryConfidence ?? "", allowedPlatforms: r.allowedPlatforms,
    allowedCategories: r.allowedCategories.join(", "), blockedTerms: r.blockedTerms.join(", "),
    requireCoupon: r.requireCoupon, requireInStock: r.requireInStock, requireHumanReview: r.requireHumanReview,
  };
}

export function toRules(v: FormValues): FilterRules {
  const n = (s: string) => (s.trim() === "" ? null : parseBRNumber(s));
  return {
    ...Object.fromEntries(NUM_KEYS.map((k) => [k, n(v[k])])) as Pick<FilterRules, (typeof NUM_KEYS)[number]>,
    minRatingCount: n(v.minRatingCount) == null ? null : Math.round(n(v.minRatingCount)!),
    maxVerificationAgeHours: n(v.maxVerificationAgeHours) == null ? null : Math.round(n(v.maxVerificationAgeHours)!),
    minHistoryConfidence: (v.minHistoryConfidence || null) as FilterRules["minHistoryConfidence"],
    allowedPlatforms: v.allowedPlatforms, allowedCategories: list(v.allowedCategories), blockedTerms: list(v.blockedTerms),
    requireCoupon: v.requireCoupon, requireInStock: v.requireInStock, requireHumanReview: v.requireHumanReview,
  };
}

function ProfileDialog({ open, onOpenChange, profile, platforms }: { open: boolean; onOpenChange: (o: boolean) => void; profile?: Partial<FilterProfile>; platforms: AffiliatePlatform[] }) {
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: toForm(profile) });
  const [rulesError, setRulesError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { form.reset(toForm(profile)); setRulesError(null); } }, [open, profile, form]);
  const insert = useTableMutation("filter_profiles", "insert", { success: "Perfil criado." });
  const update = useTableMutation("filter_profiles", "update", { success: "Perfil atualizado." });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    const rules = toRules(v);
    const parsed = filterRulesSchema.safeParse(rules);
    if (!parsed.success) { setRulesError(parsed.error.issues.map((i) => i.message).join(" ")); return; }
    const row = { name: v.name.trim(), description: v.description || null, category: v.category || null, is_active: v.is_active, rules: parsed.data };
    if (profile?.id) await update.mutateAsync({ match: { id: profile.id }, patch: row });
    else await insert.mutateAsync({ values: row });
    onOpenChange(false);
  });

  const num = (k: (typeof NUM_KEYS)[number], label: string, hint?: string) => (
    <Field label={label} htmlFor={k} error={e[k]?.message} hint={hint}><Input id={k} inputMode="decimal" placeholder="Sem limite" {...form.register(k)} /></Field>
  );
  const sw = (k: "requireCoupon" | "requireInStock" | "requireHumanReview" | "is_active", label: string, hint: string) => (
    <Controller control={form.control} name={k} render={({ field }) => (
      <label className="flex items-start justify-between gap-3 rounded-lg border p-3">
        <span><span className="block text-sm font-medium">{label}</span><span className="text-xs text-muted-foreground">{hint}</span></span>
        <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={label} />
      </label>
    )} />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{profile?.id ? "Editar perfil de filtros" : "Novo perfil de filtros"}</DialogTitle>
          <DialogDescription>Deixe em branco para não aplicar a regra. Regras aplicadas sem dados disponíveis resultam em “Aguardando dados”.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nome *" htmlFor="pname" error={e.name?.message}><Input id="pname" {...form.register("name")} /></Field>
              <Field label="Categoria do perfil" htmlFor="pcat"><Input id="pcat" placeholder="Ex.: Tecnologia" {...form.register("category")} /></Field>
              <Field label="Descrição" htmlFor="pdesc"><Input id="pdesc" {...form.register("description")} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {num("minDiscount", "Desconto mínimo (%)", "Apenas desconto verificado")}
              {num("minRating", "Avaliação mínima")}
              {num("minRatingCount", "Mín. de avaliações")}
              {num("minPrice", "Preço mínimo (R$)")}
              {num("maxPrice", "Preço máximo (R$)")}
              {num("minSellerReputation", "Reputação mín. vendedor", "0–100, se disponível")}
              {num("minCommission", "Comissão mínima (%)")}
              {num("maxCommission", "Comissão máxima (%)")}
              {num("minDataQuality", "Qualidade mín. dos dados (%)")}
              {num("maxVerificationAgeHours", "Verificação máx. (horas)")}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Confiança mínima do histórico" htmlFor="hconf">
                <NativeSelect id="hconf" {...form.register("minHistoryConfidence")}>
                  <option value="">Não exigir</option><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option>
                </NativeSelect>
              </Field>
              <Field label="Categorias permitidas" htmlFor="cats" hint="Separe por vírgula; vazio = todas"><Input id="cats" {...form.register("allowedCategories")} /></Field>
              <Field label="Produtos/termos proibidos" htmlFor="blocked" hint="Separe por vírgula"><Input id="blocked" placeholder="réplica, usado…" {...form.register("blockedTerms")} /></Field>
            </div>
            <Controller control={form.control} name="allowedPlatforms" render={({ field }) => (
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium">Plataformas permitidas <span className="text-muted-foreground">(nenhuma marcada = todas)</span></legend>
                <div className="flex flex-wrap gap-2">
                  {platforms.map((p) => {
                    const on = field.value.includes(p.code);
                    return (
                      <button type="button" key={p.code} aria-pressed={on} onClick={() => field.onChange(on ? field.value.filter((c) => c !== p.code) : [...field.value, p.code])}
                        className={`rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>{p.name}</button>
                    );
                  })}
                </div>
              </fieldset>
            )} />
            <div className="grid gap-3 sm:grid-cols-2">
              {sw("requireInStock", "Exigir estoque confirmado", "Estoque desconhecido = aguardando dados")}
              {sw("requireCoupon", "Exigir cupom", "Somente ofertas com cupom associado")}
              {sw("requireHumanReview", "Exigir revisão humana", "Mesmo passando em tudo, vai para revisão")}
              {sw("is_active", "Perfil ativo", "Perfis inativos não aparecem como padrão")}
            </div>
            {rulesError && <p className="text-sm text-danger" role="alert">{rulesError}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="brand" loading={insert.isPending || update.isPending}>Salvar perfil</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function rulesSummary(r: FilterRules): string[] {
  const s: string[] = [];
  if (r.minDiscount != null) s.push(`Desconto ≥ ${r.minDiscount}%`);
  if (r.minRating != null) s.push(`Avaliação ≥ ${r.minRating.toLocaleString("pt-BR")}`);
  if (r.minRatingCount != null) s.push(`≥ ${r.minRatingCount} avaliações`);
  if (r.minPrice != null) s.push(`Preço ≥ ${formatBRL(r.minPrice)}`);
  if (r.maxPrice != null) s.push(`Preço ≤ ${formatBRL(r.maxPrice)}`);
  if (r.allowedPlatforms.length) s.push(`${r.allowedPlatforms.length} plataforma(s)`);
  if (r.allowedCategories.length) s.push(`Categorias: ${r.allowedCategories.join(", ")}`);
  if (r.blockedTerms.length) s.push(`${r.blockedTerms.length} termo(s) proibido(s)`);
  if (r.minSellerReputation != null) s.push(`Reputação ≥ ${r.minSellerReputation}`);
  if (r.minCommission != null || r.maxCommission != null) s.push(`Comissão ${r.minCommission ?? 0}–${r.maxCommission ?? "∞"}%`);
  if (r.requireCoupon) s.push("Com cupom");
  if (r.requireInStock) s.push("Estoque confirmado");
  if (r.minDataQuality != null) s.push(`Dados ≥ ${r.minDataQuality}%`);
  if (r.maxVerificationAgeHours != null) s.push(`Verificada há ≤ ${r.maxVerificationAgeHours} h`);
  if (r.minHistoryConfidence) s.push(`Histórico ≥ ${r.minHistoryConfidence}`);
  if (r.requireHumanReview) s.push("Revisão humana");
  return s;
}

export function FiltersPage() {
  const profiles = useList<FilterProfile>("filter_profiles", { orderBy: { column: "name" } });
  const platforms = useList<AffiliatePlatform>("affiliate_platforms", { orderBy: { column: "sort_order" } }).data ?? [];
  const { settings, save } = useOrgSettings();
  const { data: offers } = useOffers(null);
  const remove = useTableMutation("filter_profiles", "remove", { success: "Perfil excluído." });
  const confirm = useConfirm();
  const [dialog, setDialog] = React.useState<{ open: boolean; profile?: Partial<FilterProfile> }>({ open: false });
  const [simId, setSimId] = React.useState<string | null>(null);

  const sim = profiles.data?.find((p) => p.id === simId);
  const simResults = React.useMemo(() => (sim ? offers.map((o) => ({ o, r: evaluateFilters(o, sim.rules, { historyConfidence: o.history.confidence }) })) : []), [sim, offers]);
  const counts = simResults.reduce<Record<string, number>>((acc, { r }) => ({ ...acc, [r.decision]: (acc[r.decision] ?? 0) + 1 }), {});

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Filtros Inteligentes"
        description="Perfis de filtros independentes por categoria. A ausência de dados nunca é considerada aprovação."
        actions={<>
          <Button variant="outline" onClick={() => setDialog({ open: true, profile: { ...TECH_PRESET, is_active: true } })}><Copy /> Usar modelo “Perfil Tecnologia”</Button>
          <Button variant="brand" onClick={() => setDialog({ open: true })}><Plus /> Novo perfil</Button>
        </>}
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        {(Object.keys(FILTER_DECISION) as FilterDecision[]).map((d) => (
          <div key={d} className="rounded-lg border bg-card p-3 text-xs"><DecisionBadge decision={d} />
            <p className="mt-1.5 text-muted-foreground">{{ aprovado: "Passou em todas as regras com dados disponíveis.", rejeitado: "Falhou em pelo menos uma regra.", aguardando_dados: "Uma regra não pôde ser avaliada por falta de dados.", revisao_humana: "Passou, mas o perfil exige revisão humana." }[d]}</p>
          </div>
        ))}
      </div>

      {profiles.error ? <ErrorState error={profiles.error} onRetry={profiles.refetch} /> : profiles.isLoading ? <LoadingRows /> : !profiles.data?.length ? (
        <EmptyState title="Nenhum perfil de filtros" description="Crie um perfil ou parta do modelo “Perfil Tecnologia” (valores editáveis)." action={<Button onClick={() => setDialog({ open: true, profile: { ...TECH_PRESET, is_active: true } })}>Criar a partir do modelo</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {profiles.data.map((p) => {
            const isDefault = settings?.defaultFilterProfileId === p.id;
            return (
              <Card key={p.id} className={isDefault ? "ring-1 ring-primary/50" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">{p.name} {isDefault && <Badge>Padrão</Badge>} {!p.is_active && <Badge variant="muted">Inativo</Badge>}</CardTitle>
                      <CardDescription>{p.category ?? "Todas as categorias"}{p.description ? ` · ${p.description}` : ""}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1">{rulesSummary({ ...EMPTY_RULES, ...p.rules }).map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setSimId(p.id)}><FlaskConical /> Simular</Button>
                    <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, profile: p })}><Pencil /> Editar</Button>
                    <Button size="sm" variant="outline" disabled={isDefault || !settings} onClick={() => settings && save.mutate({ ...settings, defaultFilterProfileId: p.id })}><Star /> Definir padrão</Button>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={async () => {
                      if (await confirm({ title: "Excluir perfil?", description: `O perfil “${p.name}” será removido.`, confirmLabel: "Excluir", destructive: true })) {
                        await remove.mutateAsync({ match: { id: p.id } });
                        if (isDefault && settings) save.mutate({ ...settings, defaultFilterProfileId: null });
                      }
                    }}><Trash2 /> Excluir</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ProfileDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} profile={dialog.profile} platforms={platforms} />

      <Dialog open={!!sim} onOpenChange={(o) => !o && setSimId(null)}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Simulação: {sim?.name}</DialogTitle>
            <DialogDescription>Aplicação do perfil às {offers.length} oferta(s) cadastradas. Nenhum dado é alterado.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex flex-wrap gap-2">{(Object.keys(FILTER_DECISION) as FilterDecision[]).map((d) => <span key={d} className="flex items-center gap-1 text-xs"><DecisionBadge decision={d} /> {counts[d] ?? 0}</span>)}</div>
            {simResults.length === 0 && <EmptyState title="Nenhuma oferta cadastrada para simular" />}
            {simResults.map(({ o, r }) => (
              <details key={o.id} className="rounded-lg border p-2.5 text-sm">
                <summary className="flex cursor-pointer items-center gap-2"><DecisionBadge decision={r.decision} /><span className="truncate">{o.product.name}</span>{o.is_demo && <Badge variant="demo">DEMO</Badge>}</summary>
                <ul className="mt-2 space-y-1 pl-2 text-xs">
                  {r.checks.map((c) => <li key={c.key} className={c.status === "falha" ? "text-danger" : c.status === "sem_dados" ? "text-warning" : "text-success"}>• {c.message}</li>)}
                  {r.checks.length === 0 && <li className="text-muted-foreground">Nenhuma regra ativa.</li>}
                </ul>
              </details>
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

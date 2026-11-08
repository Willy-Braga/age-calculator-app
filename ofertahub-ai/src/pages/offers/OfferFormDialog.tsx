import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import type { AffiliatePlatform, FilterProfile, OfferWithProduct, ReferencePriceSource, StockStatus } from "@/lib/data/types";
import { REFERENCE_SOURCES, STOCK_STATUS } from "@/lib/domain/offers";
import { checkLink } from "@/lib/domain/links";
import { parseBRNumber, formatPercent } from "@/lib/format";
import type { OrgSettings } from "@/lib/domain/settings";
import { useSaveOffer } from "./offerMutations";
import { cn } from "@/lib/utils";

const optNum = (min: number, max: number, label: string) =>
  z.string().trim().refine((v) => v === "" || (parseBRNumber(v) != null && parseBRNumber(v)! >= min && parseBRNumber(v)! <= max), `${label}: valor entre ${min} e ${max}`);

export const offerFormSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do produto").max(300),
  description: z.string().max(5000),
  brand: z.string().max(120),
  model: z.string().max(120),
  category: z.string().max(80),
  image_url: z.string().trim().refine((v) => v === "" || /^https:\/\//.test(v), "Use uma URL https"),
  platform_code: z.string().min(1, "Selecione a plataforma"),
  store_name: z.string().max(160),
  external_id: z.string().max(120),
  original_url: z.string().trim(),
  affiliate_url: z.string().trim(),
  current_price: optNum(0, 10_000_000, "Preço"),
  reference_price: optNum(0, 10_000_000, "Preço de referência"),
  reference_price_source: z.string(),
  shipping_cost: optNum(0, 100_000, "Frete"),
  rating: optNum(0, 5, "Avaliação"),
  rating_count: z.string().trim().refine((v) => v === "" || /^\d+$/.test(v), "Número inteiro"),
  seller_reputation: z.string().max(200),
  stock_status: z.enum(["em_estoque", "baixo_estoque", "sem_estoque", "desconhecido"]),
  coupon_code: z.string().max(60),
  coupon_details: z.string().max(500),
  commission_rate: optNum(0, 100, "Comissão"),
  commission_source: z.string().max(120),
  verified_now: z.boolean(),
})
  .superRefine((v, ctx) => {
    if (v.reference_price && !v.reference_price_source) ctx.addIssue({ code: "custom", path: ["reference_price_source"], message: "Informe a origem do preço de referência" });
    if (v.original_url) { const c = checkLink(v.original_url, v.platform_code); if (!c.valid) ctx.addIssue({ code: "custom", path: ["original_url"], message: c.messages[0] }); }
    if (v.affiliate_url) { const c = checkLink(v.affiliate_url, v.platform_code, "afiliado"); if (!c.valid) ctx.addIssue({ code: "custom", path: ["affiliate_url"], message: c.messages[0] }); }
  });

export type OfferFormValues = z.infer<typeof offerFormSchema>;

const s = (v: unknown) => (v == null ? "" : String(v).replace(".", ","));

function toForm(o?: OfferWithProduct): OfferFormValues {
  return {
    name: o?.product.name ?? "", description: o?.product.description ?? "", brand: o?.product.brand ?? "", model: o?.product.model ?? "",
    category: o?.product.category ?? "", image_url: o?.product.image_url ?? "", platform_code: o?.platform_code ?? "",
    store_name: o?.store_name ?? "", external_id: o?.external_id ?? "", original_url: o?.original_url ?? "", affiliate_url: o?.affiliate_url ?? "",
    current_price: s(o?.current_price), reference_price: s(o?.reference_price), reference_price_source: o?.reference_price_source ?? "",
    shipping_cost: s(o?.shipping_cost), rating: s(o?.rating), rating_count: o?.rating_count != null ? String(o.rating_count) : "",
    seller_reputation: o?.seller_reputation ?? "", stock_status: o?.stock_status ?? "desconhecido", coupon_code: o?.coupon_code ?? "",
    coupon_details: o?.coupon_details ?? "", commission_rate: s(o?.commission_rate), commission_source: o?.commission_source ?? "", verified_now: false,
  };
}

const nul = (v: string) => (v.trim() === "" ? null : v.trim());

export function formToRows(v: OfferFormValues, existing?: OfferWithProduct) {
  return {
    product: { name: v.name.trim(), description: nul(v.description), brand: nul(v.brand), model: nul(v.model), category: nul(v.category), image_url: nul(v.image_url) },
    offer: {
      platform_code: v.platform_code, store_name: nul(v.store_name), external_id: nul(v.external_id), original_url: nul(v.original_url),
      affiliate_url: nul(v.affiliate_url), current_price: parseBRNumber(v.current_price), reference_price: parseBRNumber(v.reference_price),
      reference_price_source: (nul(v.reference_price_source) as ReferencePriceSource | null), shipping_cost: parseBRNumber(v.shipping_cost),
      rating: parseBRNumber(v.rating), rating_count: v.rating_count ? Number(v.rating_count) : null, seller_reputation: nul(v.seller_reputation),
      stock_status: v.stock_status as StockStatus, coupon_code: nul(v.coupon_code), coupon_details: nul(v.coupon_details),
      commission_rate: parseBRNumber(v.commission_rate), commission_source: nul(v.commission_source),
      ...(v.verified_now ? { last_verified_at: new Date().toISOString() } : existing ? {} : { last_verified_at: null }),
    },
  };
}

function LinkHint({ url, platform, kind }: { url: string; platform: string; kind: "original" | "afiliado" }) {
  if (!url || !platform) return null;
  const c = checkLink(url, platform, kind);
  if (!c.valid) return null;
  return (
    <p className={cn("flex items-start gap-1 text-[11px]", c.level === "valido" ? "text-success" : "text-warning")}>
      {c.level === "valido" ? <CheckCircle2 className="mt-0.5 size-3 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3 shrink-0" />}
      {c.messages.join(" ")}
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function OfferFormDialog({ open, onOpenChange, offer, platforms, categories, settings, profile }: {
  open: boolean; onOpenChange: (o: boolean) => void; offer?: OfferWithProduct; platforms: AffiliatePlatform[];
  categories: string[]; settings: OrgSettings; profile: FilterProfile | null;
}) {
  const form = useForm<OfferFormValues>({ resolver: zodResolver(offerFormSchema), defaultValues: toForm(offer) });
  const save = useSaveOffer(settings, profile);
  React.useEffect(() => { if (open) form.reset(toForm(offer)); }, [open, offer, form]);
  const w = useWatch({ control: form.control });
  const e = form.formState.errors;
  const cp = parseBRNumber(w.current_price ?? ""), rp = parseBRNumber(w.reference_price ?? "");
  const discount = cp != null && rp ? Math.round((1 - cp / rp) * 1000) / 10 : null;
  const allowed = platforms.filter((p) => settings.authorizedPlatforms.includes(p.code) || p.code === offer?.platform_code);

  const onSubmit = form.handleSubmit(async (v) => {
    const rows = formToRows(v, offer);
    await save.mutateAsync({ existing: offer, ...rows });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{offer ? "Editar oferta" : "Nova oferta (inclusão manual)"}</DialogTitle>
          <DialogDescription>Informe apenas dados que você conferiu. Campos vazios ficam como “não disponível” — nunca como aprovados.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-6">
            <Section title="Produto">
              <Field label="Nome do produto *" htmlFor="name" error={e.name?.message} className="sm:col-span-2">
                <Input id="name" {...form.register("name")} aria-invalid={!!e.name} />
              </Field>
              <Field label="Marca" htmlFor="brand"><Input id="brand" {...form.register("brand")} /></Field>
              <Field label="Modelo / variante" htmlFor="model" hint="Ex.: 128 GB, cor preta"><Input id="model" {...form.register("model")} /></Field>
              <Field label="Categoria" htmlFor="category">
                <Input id="category" list="categories-list" {...form.register("category")} />
                <datalist id="categories-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="URL da imagem" htmlFor="image_url" error={e.image_url?.message} hint="Use apenas imagens autorizadas">
                <Input id="image_url" placeholder="https://" {...form.register("image_url")} />
              </Field>
              <Field label="Descrição" htmlFor="description" className="sm:col-span-2">
                <Textarea id="description" rows={2} {...form.register("description")} />
              </Field>
            </Section>

            <Section title="Origem e links">
              <Field label="Plataforma *" htmlFor="platform_code" error={e.platform_code?.message}>
                <NativeSelect id="platform_code" {...form.register("platform_code")} aria-invalid={!!e.platform_code}>
                  <option value="">Selecione…</option>
                  {allowed.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Loja / vendedor" htmlFor="store_name"><Input id="store_name" {...form.register("store_name")} /></Field>
              <Field label="ID externo (ASIN, item ID…)" htmlFor="external_id" hint="Evita cadastros duplicados"><Input id="external_id" {...form.register("external_id")} /></Field>
              <Field label="Reputação do vendedor (fonte oficial)" htmlFor="seller_reputation" hint="Ex.: MercadoLíder Platinum"><Input id="seller_reputation" {...form.register("seller_reputation")} /></Field>
              <Field label="Link original" htmlFor="original_url" error={e.original_url?.message}>
                <Input id="original_url" placeholder="https://" {...form.register("original_url")} />
                <LinkHint url={w.original_url ?? ""} platform={w.platform_code ?? ""} kind="original" />
              </Field>
              <Field label="Link de afiliado" htmlFor="affiliate_url" error={e.affiliate_url?.message}>
                <Input id="affiliate_url" placeholder="https://" {...form.register("affiliate_url")} />
                <LinkHint url={w.affiliate_url ?? ""} platform={w.platform_code ?? ""} kind="afiliado" />
              </Field>
            </Section>

            <Section title="Preço e condições">
              <Field label="Preço atual (R$)" htmlFor="current_price" error={e.current_price?.message}><Input id="current_price" inputMode="decimal" placeholder="0,00" {...form.register("current_price")} /></Field>
              <Field label="Frete (R$)" htmlFor="shipping_cost" error={e.shipping_cost?.message} hint="0 = frete grátis; vazio = desconhecido"><Input id="shipping_cost" inputMode="decimal" {...form.register("shipping_cost")} /></Field>
              <Field label="Preço de referência (R$)" htmlFor="reference_price" error={e.reference_price?.message}><Input id="reference_price" inputMode="decimal" {...form.register("reference_price")} /></Field>
              <Field label="Origem do preço de referência" htmlFor="reference_price_source" error={e.reference_price_source?.message}>
                <NativeSelect id="reference_price_source" {...form.register("reference_price_source")}>
                  <option value="">Não informado</option>
                  {Object.entries(REFERENCE_SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </NativeSelect>
              </Field>
              {discount != null && (
                <div className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-xs sm:col-span-2", w.reference_price_source === "preco_riscado_vendedor" || !w.reference_price_source ? "border-warning/40 bg-warning/10" : "border-success/30 bg-success/10")}>
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  {w.reference_price_source === "preco_riscado_vendedor" || !w.reference_price_source
                    ? <span>Desconto anunciado de {formatPercent(discount)} <strong>não será considerado verificado</strong>: o preço riscado do vendedor não comprova desconto real.</span>
                    : <span>Desconto verificado: <strong>{formatPercent(discount)}</strong>.</span>}
                </div>
              )}
              <Field label="Estoque" htmlFor="stock_status">
                <NativeSelect id="stock_status" {...form.register("stock_status")}>
                  {Object.entries(STOCK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Cupom" htmlFor="coupon_code"><Input id="coupon_code" {...form.register("coupon_code")} /></Field>
              <Field label="Condições do cupom" htmlFor="coupon_details" className="sm:col-span-2"><Input id="coupon_details" placeholder="Validade, valor mínimo…" {...form.register("coupon_details")} /></Field>
            </Section>

            <Section title="Avaliações e comissão">
              <Field label="Avaliação (0 a 5)" htmlFor="rating" error={e.rating?.message}><Input id="rating" inputMode="decimal" {...form.register("rating")} /></Field>
              <Field label="Quantidade de avaliações" htmlFor="rating_count" error={e.rating_count?.message}><Input id="rating_count" inputMode="numeric" {...form.register("rating_count")} /></Field>
              <Field label="Comissão estimada (%)" htmlFor="commission_rate" error={e.commission_rate?.message}><Input id="commission_rate" inputMode="decimal" {...form.register("commission_rate")} /></Field>
              <Field label="Fonte da comissão" htmlFor="commission_source" hint="Ex.: tabela oficial do programa"><Input id="commission_source" {...form.register("commission_source")} /></Field>
            </Section>

            <label className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" {...form.register("verified_now")} />
              <span>
                Confirmo que verifiquei estes dados na loja agora
                <span className="block text-xs text-muted-foreground">Registra a data da última verificação. Sem isso, a oferta é tratada como não verificada.</span>
              </span>
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="brand" loading={save.isPending}>{offer ? "Salvar alterações" : "Cadastrar oferta"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

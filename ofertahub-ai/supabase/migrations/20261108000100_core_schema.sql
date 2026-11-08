-- =============================================================================
-- OfertaHub AI — Esquema principal (Fase 1, com tabelas das fases seguintes já
-- normalizadas para evitar migrações destrutivas no futuro).
--
-- Princípios:
--   * Multi-organização desde o início: toda tabela de negócio tem organization_id.
--   * Row Level Security em TODAS as tabelas expostas.
--   * Credenciais de integrações nunca são legíveis pelo navegador
--     (tabela integration_credentials sem políticas => apenas service_role).
--   * Dados demonstrativos marcados com is_demo = true.
--   * Nenhum preço histórico é inventado: price_observations só recebe
--     observações reais (manual, importação, API) via gatilho ou inserção explícita.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'editor', 'viewer');

create type public.offer_status as enum (
  'encontrada', 'em_verificacao', 'aguardando_aprovacao', 'aprovada',
  'publicada', 'expirada', 'rejeitada', 'dados_insuficientes', 'arquivada'
);

create type public.stock_status as enum ('em_estoque', 'baixo_estoque', 'sem_estoque', 'desconhecido');

create type public.integration_status as enum (
  'nao_configurada', 'configurada', 'conectada_validada', 'erro', 'indisponivel'
);

create type public.verification_outcome as enum ('aprovado', 'atencao', 'rejeitado', 'dados_insuficientes');

create type public.filter_decision as enum ('aprovado', 'rejeitado', 'aguardando_dados', 'revisao_humana');

create type public.publication_status as enum (
  'rascunho', 'aguardando_aprovacao', 'aprovada', 'pronta', 'publicada', 'falhou', 'cancelada'
);

create type public.channel_type as enum (
  'whatsapp_comunidade', 'whatsapp_grupo', 'whatsapp_canal', 'telegram', 'instagram', 'tiktok', 'outro'
);

create type public.media_category as enum (
  'video_proprio', 'video_oficial_afiliado', 'video_autorizado_titular', 'imagem_produto', 'arte_propria'
);

create type public.license_status as enum ('pendente', 'confirmada', 'expirada', 'revogada');

create type public.conversion_status as enum ('pendente', 'aprovada', 'cancelada');

create type public.commission_status as enum ('estimada', 'confirmada', 'paga', 'cancelada');

create type public.data_origin as enum ('interno', 'relatorio_plataforma', 'api_plataforma', 'importacao_csv', 'manual');

create type public.run_status as enum ('na_fila', 'executando', 'sucesso', 'falhou', 'cancelada', 'ignorada');

-- -----------------------------------------------------------------------------
-- Função utilitária updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Usuários, organizações e membros
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  default_organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_default_org_fk foreign key (default_organization_id)
  references public.organizations(id) on delete set null;

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id);

-- Funções de autorização (security definer para evitar recursão de RLS)
create or replace function public.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_write_org(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'editor')
  );
$$;

create or replace function public.is_org_admin(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

-- -----------------------------------------------------------------------------
-- Catálogo global de plataformas de afiliados (somente leitura para usuários)
-- -----------------------------------------------------------------------------
create table public.affiliate_platforms (
  code text primary key,
  name text not null,
  website text,
  kind text not null check (kind in ('marketplace', 'infoproduto', 'outro')),
  connection_methods text[] not null default '{}',
  supported_features text[] not null default '{}',
  required_credentials text[] not null default '{}',
  known_limits text,
  official_docs_url text,
  availability text not null default 'requer_aprovacao'
    check (availability in ('disponivel', 'requer_aprovacao', 'limitada', 'indisponivel', 'manual')),
  notes text,
  sort_order int not null default 100
);

-- -----------------------------------------------------------------------------
-- Integrações por organização (estado) + credenciais (somente servidor)
-- -----------------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform_code text not null references public.affiliate_platforms(code),
  status public.integration_status not null default 'nao_configurada',
  connection_method text,
  affiliate_identifier text,
  commission_info text,
  enabled_features text[] not null default '{}',
  has_credentials boolean not null default false,
  last_sync_at timestamptz,
  last_validated_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform_code)
);

-- Credenciais: RLS habilitado SEM políticas => inacessível para anon/authenticated.
-- Escrita/leitura somente via Edge Function com service_role.
create table public.integration_credentials (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.integration_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete cascade,
  platform_code text not null,
  level text not null check (level in ('info', 'aviso', 'erro')),
  action text not null,
  message text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index integration_logs_org_idx on public.integration_logs(organization_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Produtos, variantes, vendedores e ofertas
-- -----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 300),
  description text,
  brand text,
  model text,
  category text,
  image_url text,
  gtin text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_org_idx on public.products(organization_id);
create index products_name_trgm on public.products using gin (name gin_trgm_ops);
create index products_category_idx on public.products(organization_id, category);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  attributes jsonb not null default '{}'::jsonb,
  sku text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants(product_id);

create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform_code text not null references public.affiliate_platforms(code),
  external_id text,
  name text not null,
  reputation_score numeric(5,2) check (reputation_score between 0 and 100),
  reputation_source text,
  reputation_details jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, platform_code, external_id)
);

create table public.product_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  seller_id uuid references public.sellers(id) on delete set null,
  platform_code text not null references public.affiliate_platforms(code),
  external_id text,
  store_name text,
  original_url text,
  affiliate_url text,
  currency text not null default 'BRL',
  current_price numeric(12,2) check (current_price >= 0),
  -- Preço de referência só vale se for VERIFICÁVEL (histórico próprio, relatório oficial etc.).
  reference_price numeric(12,2) check (reference_price >= 0),
  reference_price_source text check (reference_price_source in ('historico', 'manual_verificado', 'api_oficial', 'preco_riscado_vendedor')),
  shipping_cost numeric(12,2) check (shipping_cost >= 0),
  rating numeric(3,2) check (rating between 0 and 5),
  rating_count int check (rating_count >= 0),
  seller_reputation text,
  stock_status public.stock_status not null default 'desconhecido',
  coupon_code text,
  coupon_details text,
  commission_rate numeric(5,2) check (commission_rate between 0 and 100),
  commission_source text,
  status public.offer_status not null default 'encontrada',
  score int check (score between 0 and 100),
  score_breakdown jsonb,
  filter_decision public.filter_decision,
  filter_reasons jsonb,
  data_source text not null default 'manual',
  collection_method text not null default 'manual'
    check (collection_method in ('manual', 'csv', 'api', 'feed', 'demo')),
  is_favorite boolean not null default false,
  is_monitored boolean not null default false,
  is_demo boolean not null default false,
  last_verified_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_offers_org_status_idx on public.product_offers(organization_id, status);
create index product_offers_org_platform_idx on public.product_offers(organization_id, platform_code);
create index product_offers_product_idx on public.product_offers(product_id);
create index product_offers_created_idx on public.product_offers(organization_id, created_at desc);
-- Evita duplicar a mesma oferta externa
create unique index product_offers_external_uniq
  on public.product_offers(organization_id, platform_code, external_id)
  where external_id is not null;

-- Desconto calculado SOMENTE a partir de referência verificável (nunca preço riscado)
create or replace function public.offer_verified_discount(o public.product_offers) returns numeric
language sql immutable as $$
  select case
    when o.current_price is null or o.reference_price is null or o.reference_price = 0 then null
    when o.reference_price_source is null or o.reference_price_source = 'preco_riscado_vendedor' then null
    else round((1 - o.current_price / o.reference_price) * 100, 2)
  end;
$$;

create table public.price_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  offer_id uuid references public.product_offers(id) on delete set null,
  platform_code text not null references public.affiliate_platforms(code),
  price numeric(12,2) not null check (price >= 0),
  shipping_cost numeric(12,2),
  coupon_code text,
  observed_at timestamptz not null default now(),
  source text not null,
  collection_method text not null,
  quality text not null default 'media' check (quality in ('alta', 'media', 'baixa')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index price_observations_product_idx on public.price_observations(product_id, observed_at desc);
create index price_observations_offer_idx on public.price_observations(offer_id, observed_at desc);

-- -----------------------------------------------------------------------------
-- Filtros e verificações
-- -----------------------------------------------------------------------------
create table public.filter_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  category text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.verification_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  offer_id uuid not null references public.product_offers(id) on delete cascade,
  filter_profile_id uuid references public.filter_profiles(id) on delete set null,
  outcome public.verification_outcome not null,
  checks jsonb not null default '[]'::jsonb,
  score int,
  score_breakdown jsonb,
  created_at timestamptz not null default now()
);
create index verification_results_offer_idx on public.verification_results(offer_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Afiliados: campanhas, links, cliques, conversões, comissões
-- -----------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  identifier text,
  description text,
  starts_at date,
  ends_at date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  offer_id uuid references public.product_offers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  platform_code text not null references public.affiliate_platforms(code),
  original_url text not null,
  affiliate_url text not null,
  sub_id text,
  generated_by text not null default 'manual' check (generated_by in ('manual', 'api')),
  structural_check text check (structural_check in ('valido', 'invalido', 'nao_verificado')),
  structural_check_details text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index affiliate_links_offer_idx on public.affiliate_links(offer_id);

create table public.click_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  affiliate_link_id uuid references public.affiliate_links(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  channel_id uuid,
  platform_code text references public.affiliate_platforms(code),
  occurred_on date not null,
  clicks int not null default 1 check (clicks >= 0),
  origin public.data_origin not null,
  import_batch_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index click_events_org_date_idx on public.click_events(organization_id, occurred_on);

create table public.conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  platform_code text not null references public.affiliate_platforms(code),
  external_order_id text,
  affiliate_link_id uuid references public.affiliate_links(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  order_value numeric(12,2),
  status public.conversion_status not null default 'pendente',
  ordered_at timestamptz,
  origin public.data_origin not null,
  import_batch_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index conversions_external_uniq on public.conversions(organization_id, platform_code, external_order_id)
  where external_order_id is not null;

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversion_id uuid references public.conversions(id) on delete set null,
  platform_code text not null references public.affiliate_platforms(code),
  campaign_id uuid references public.campaigns(id) on delete set null,
  amount numeric(12,2) not null,
  status public.commission_status not null,
  -- 'estimada' nunca é receita. Apenas 'confirmada'/'paga' vindas de relatório/API oficial.
  origin public.data_origin not null,
  reference_month date,
  paid_at date,
  import_batch_id uuid,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commissions_confirmed_origin check (
    status in ('estimada', 'cancelada') or origin in ('relatorio_plataforma', 'api_plataforma', 'importacao_csv')
  )
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('produtos', 'cliques', 'conversoes', 'comissoes')),
  platform_code text references public.affiliate_platforms(code),
  file_name text,
  rows_total int not null default 0,
  rows_imported int not null default 0,
  rows_rejected int not null default 0,
  errors jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Marketing: canais, mídias, licenças, conteúdos, publicações
-- -----------------------------------------------------------------------------
create table public.distribution_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type public.channel_type not null,
  category text,
  invite_url text,
  estimated_audience int check (estimated_audience >= 0),
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'arquivado')),
  notes text,
  campaign_identifier text,
  max_posts_per_day int check (max_posts_per_day > 0),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.click_events
  add constraint click_events_channel_fk foreign key (channel_id) references public.distribution_channels(id) on delete set null;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category public.media_category not null,
  product_id uuid references public.products(id) on delete set null,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  origin text,
  owner_name text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_licenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  authorization_type text not null,
  license_reference text,
  restrictions text,
  allowed_platforms text[] not null default '{}',
  valid_until date,
  status public.license_status not null default 'pendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  offer_id uuid references public.product_offers(id) on delete set null,
  format text not null,
  tone text,
  body text not null,
  generator text not null default 'template' check (generator in ('template', 'ia', 'manual')),
  version int not null default 1,
  parent_id uuid references public.content_drafts(id) on delete set null,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  offer_id uuid references public.product_offers(id) on delete set null,
  channel_id uuid references public.distribution_channels(id) on delete set null,
  content_draft_id uuid references public.content_drafts(id) on delete set null,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  affiliate_link_id uuid references public.affiliate_links(id) on delete set null,
  body text not null default '',
  status public.publication_status not null default 'rascunho',
  planned_at timestamptz,
  published_at timestamptz,
  responsible_id uuid references auth.users(id) on delete set null,
  result_notes text,
  content_hash text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Evita publicar o mesmo conteúdo no mesmo canal
create unique index publications_dedupe_idx on public.publications(organization_id, channel_id, content_hash)
  where content_hash is not null and status not in ('cancelada', 'falhou');

-- -----------------------------------------------------------------------------
-- Automações, notificações, auditoria, configurações, alertas
-- -----------------------------------------------------------------------------
create table public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  name text not null,
  description text,
  is_enabled boolean not null default false,
  frequency_cron text,
  requires_cost_approval boolean not null default false,
  cost_approved_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_status public.run_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind)
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.automation_jobs(id) on delete cascade,
  status public.run_status not null default 'na_fila',
  trigger text not null default 'manual' check (trigger in ('manual', 'agendada')),
  started_at timestamptz,
  finished_at timestamptz,
  summary text,
  error text,
  log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
-- Impede execuções simultâneas do mesmo job
create unique index automation_runs_single_active on public.automation_runs(job_id)
  where status in ('na_fila', 'executando');

create table public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  offer_id uuid references public.product_offers(id) on delete cascade,
  kind text not null check (kind in ('reducao_preco', 'volta_estoque', 'preco_alvo')),
  target_price numeric(12,2),
  min_drop_percent numeric(5,2),
  is_active boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  severity text not null default 'info' check (severity in ('info', 'sucesso', 'aviso', 'erro')),
  read_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_org_unread_idx on public.notifications(organization_id, read_at, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs(organization_id, created_at desc);

create table public.app_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Gatilhos updated_at
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','organizations','integrations','products','product_variants','sellers','product_offers',
    'filter_profiles','campaigns','affiliate_links','conversions','commissions','distribution_channels',
    'media_assets','media_licenses','publications','automation_jobs','app_settings','user_preferences'
  ] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- Status: registra momento da mudança
create or replace function public.offer_status_timestamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

-- Registra observação REAL sempre que o preço de uma oferta é informado/alterado.
create or replace function public.record_price_observation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.current_price is not null and (tg_op = 'INSERT' or new.current_price is distinct from old.current_price
     or new.shipping_cost is distinct from old.shipping_cost) then
    insert into public.price_observations
      (organization_id, product_id, variant_id, offer_id, platform_code, price, shipping_cost,
       coupon_code, observed_at, source, collection_method, quality, is_demo)
    values
      (new.organization_id, new.product_id, new.variant_id, new.id, new.platform_code, new.current_price,
       new.shipping_cost, new.coupon_code, now(), new.data_source, new.collection_method,
       case new.collection_method when 'api' then 'alta' when 'feed' then 'alta' else 'media' end,
       new.is_demo);
  end if;
  return null;
end $$;

create trigger product_offers_status_ts before update on public.product_offers
  for each row execute function public.offer_status_timestamp();
create trigger product_offers_price_observation after insert or update on public.product_offers
  for each row execute function public.record_price_observation();

-- -----------------------------------------------------------------------------
-- Auditoria automática
-- -----------------------------------------------------------------------------
create or replace function public.write_audit_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  org uuid;
  diff jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  org := (rec ->> 'organization_id')::uuid;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('de', o.value, 'para', n.value)) into diff
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value and n.key not in ('updated_at', 'status_changed_at');
    if diff is null then return null; end if;
  elsif tg_op = 'INSERT' then
    diff := rec;
  else
    diff := jsonb_build_object('removido', rec);
  end if;
  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, changes)
  values (org, auth.uid(), lower(tg_op), tg_table_name, rec ->> 'id', diff);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'integrations','products','product_variants','product_offers','filter_profiles','affiliate_links',
    'campaigns','distribution_channels','media_assets','media_licenses','publications','automation_jobs',
    'app_settings','conversions','commissions'
  ] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()', t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.affiliate_platforms enable row level security;
alter table public.integration_credentials enable row level security; -- sem políticas de propósito
revoke all on public.integration_credentials from anon, authenticated;
revoke insert, update, delete on public.audit_logs from anon, authenticated;
revoke insert, update, delete on public.affiliate_platforms from anon, authenticated;
alter table public.audit_logs enable row level security;
alter table public.user_preferences enable row level security;

create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_member_select on public.organizations for select using (public.is_org_member(id));
create policy organizations_admin_update on public.organizations for update using (public.is_org_admin(id));

create policy members_select on public.organization_members for select using (public.is_org_member(organization_id));
create policy members_admin_write on public.organization_members for all
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

create policy platforms_read on public.affiliate_platforms for select to authenticated using (true);

-- Auditoria: leitura para membros; escrita apenas via gatilho (security definer).
create policy audit_select on public.audit_logs for select using (public.is_org_member(organization_id));

create policy user_prefs_self on public.user_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Políticas padrão para tabelas de negócio com organization_id
do $$
declare t text;
begin
  foreach t in array array[
    'integrations','integration_logs','products','product_variants','sellers','product_offers',
    'price_observations','filter_profiles','verification_results','campaigns','affiliate_links',
    'click_events','conversions','commissions','import_batches','distribution_channels','media_assets',
    'media_licenses','content_drafts','publications','automation_jobs','automation_runs','price_alerts',
    'notifications','app_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_org_member(organization_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.can_write_org(organization_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.can_write_org(organization_id))', t || '_delete', t);
  end loop;
end $$;

-- Notificações pessoais: além de ser membro, só vê as suas ou as da organização (user_id nulo)
drop policy notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
  using (public.is_org_member(organization_id) and (user_id is null or user_id = auth.uid()));

-- Integrações: alteração de status "conectada_validada" só pode vir do servidor.
create or replace function public.guard_integration_status() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and auth.role() is distinct from 'service_role' then
    if new.status = 'conectada_validada' and (tg_op = 'INSERT' or old.status is distinct from 'conectada_validada') then
      raise exception 'Somente o servidor pode marcar uma integração como conectada e validada.';
    end if;
    if tg_op = 'UPDATE' then
      new.has_credentials := old.has_credentials;
      new.last_validated_at := old.last_validated_at;
    else
      new.has_credentials := false;
      new.last_validated_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger integrations_guard before insert or update on public.integrations
  for each row execute function public.guard_integration_status();

-- -----------------------------------------------------------------------------
-- Novo usuário => perfil + organização pessoal + configurações padrão
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
begin
  insert into public.organizations (name, created_by)
  values (coalesce(nullif(new.raw_user_meta_data ->> 'organization_name', ''), 'Minha organização'), new.id)
  returning id into org_id;

  insert into public.profiles (id, full_name, default_organization_id)
  values (new.id, new.raw_user_meta_data ->> 'full_name', org_id);

  insert into public.organization_members (organization_id, user_id, role) values (org_id, new.id, 'owner');
  insert into public.app_settings (organization_id, settings) values (org_id, '{}'::jsonb);
  insert into public.user_preferences (user_id, preferences) values (new.id, '{}'::jsonb);

  insert into public.integrations (organization_id, platform_code, status)
  select org_id, p.code,
         case when p.availability = 'indisponivel' then 'indisponivel'::public.integration_status
              else 'nao_configurada'::public.integration_status end
  from public.affiliate_platforms p;

  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

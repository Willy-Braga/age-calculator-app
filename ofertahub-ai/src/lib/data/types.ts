// Tipos espelhando o esquema SQL (supabase/migrations). Mantenha sincronizado.

export type MemberRole = "owner" | "admin" | "editor" | "viewer";

export type OfferStatus =
  | "encontrada" | "em_verificacao" | "aguardando_aprovacao" | "aprovada" | "publicada"
  | "expirada" | "rejeitada" | "dados_insuficientes" | "arquivada";

export type StockStatus = "em_estoque" | "baixo_estoque" | "sem_estoque" | "desconhecido";
export type IntegrationStatus = "nao_configurada" | "configurada" | "conectada_validada" | "erro" | "indisponivel";
export type FilterDecision = "aprovado" | "rejeitado" | "aguardando_dados" | "revisao_humana";
export type ReferencePriceSource = "historico" | "manual_verificado" | "api_oficial" | "preco_riscado_vendedor";
export type CollectionMethod = "manual" | "csv" | "api" | "feed" | "demo";
export type PlatformAvailability = "disponivel" | "requer_aprovacao" | "limitada" | "indisponivel" | "manual";

export interface BaseRow {
  id: string;
  created_at: string;
}
export interface OrgRow extends BaseRow {
  organization_id: string;
}

export interface Organization extends BaseRow { name: string; slug: string | null; created_by: string | null }

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  default_organization_id: string | null;
}

export interface AffiliatePlatform {
  code: string;
  name: string;
  website: string | null;
  kind: "marketplace" | "infoproduto" | "outro";
  connection_methods: string[];
  supported_features: string[];
  required_credentials: string[];
  known_limits: string | null;
  official_docs_url: string | null;
  availability: PlatformAvailability;
  notes: string | null;
  sort_order: number;
}

export interface Integration extends OrgRow {
  platform_code: string;
  status: IntegrationStatus;
  connection_method: string | null;
  affiliate_identifier: string | null;
  commission_info: string | null;
  enabled_features: string[];
  has_credentials: boolean;
  last_sync_at: string | null;
  last_validated_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export interface IntegrationLog extends OrgRow {
  integration_id: string | null;
  platform_code: string;
  level: "info" | "aviso" | "erro";
  action: string;
  message: string;
  details: unknown;
}

export interface Product extends OrgRow {
  name: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  image_url: string | null;
  gtin: string | null;
  is_demo: boolean;
  updated_at: string;
}

export interface ProductOffer extends OrgRow {
  product_id: string;
  variant_id: string | null;
  seller_id: string | null;
  platform_code: string;
  external_id: string | null;
  store_name: string | null;
  original_url: string | null;
  affiliate_url: string | null;
  currency: string;
  current_price: number | null;
  reference_price: number | null;
  reference_price_source: ReferencePriceSource | null;
  shipping_cost: number | null;
  rating: number | null;
  rating_count: number | null;
  seller_reputation: string | null;
  stock_status: StockStatus;
  coupon_code: string | null;
  coupon_details: string | null;
  commission_rate: number | null;
  commission_source: string | null;
  status: OfferStatus;
  score: number | null;
  score_breakdown: unknown;
  filter_decision: FilterDecision | null;
  filter_reasons: unknown;
  data_source: string;
  collection_method: CollectionMethod;
  is_favorite: boolean;
  is_monitored: boolean;
  is_demo: boolean;
  last_verified_at: string | null;
  status_changed_at: string;
  updated_at: string;
}

export interface OfferWithProduct extends ProductOffer {
  product: Product;
}

export interface PriceObservation extends OrgRow {
  product_id: string;
  variant_id: string | null;
  offer_id: string | null;
  platform_code: string;
  price: number;
  shipping_cost: number | null;
  coupon_code: string | null;
  observed_at: string;
  source: string;
  collection_method: string;
  quality: "alta" | "media" | "baixa";
  is_demo: boolean;
}

export interface FilterProfile extends OrgRow {
  name: string;
  description: string | null;
  category: string | null;
  is_default: boolean;
  is_active: boolean;
  rules: import("../domain/filters").FilterRules;
  updated_at: string;
}

export interface Notification extends OrgRow {
  user_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  severity: "info" | "sucesso" | "aviso" | "erro";
  read_at: string | null;
  is_demo: boolean;
}

export interface AuditLog {
  id: number | string;
  organization_id: string | null;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
}

export interface AppSettingsRow {
  organization_id: string;
  settings: Partial<import("../domain/settings").OrgSettings>;
  updated_at: string;
}

export interface UserPreferencesRow {
  user_id: string;
  preferences: Partial<import("../domain/settings").UserPreferences>;
  updated_at: string;
}

export type TableName =
  | "organizations" | "profiles" | "affiliate_platforms" | "integrations" | "integration_logs" | "products"
  | "product_offers" | "price_observations" | "filter_profiles" | "verification_results" | "notifications"
  | "audit_logs" | "app_settings" | "user_preferences" | "affiliate_links" | "click_events" | "conversions"
  | "commissions" | "publications" | "distribution_channels" | "automation_jobs" | "automation_runs";

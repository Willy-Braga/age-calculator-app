import type { DataClient, InvokeResult, ListOptions, QueryFilter } from "./client";
import { DataError } from "./client";
import type { TableName } from "./types";
import { uuid } from "../utils";
import { PLATFORM_CATALOG } from "./platformCatalog";

export const DEMO_ORG_ID = "00000000-0000-4000-8000-00000000d3e0";
export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000d3e1";
const STORAGE_KEY = "ofertahub:demo-db:v1";

type Row = Record<string, unknown>;
type DB = Partial<Record<TableName, Row[]>>;

export interface KeyValueStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export class MemoryStorage implements KeyValueStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const AUDITED: TableName[] = ["integrations", "products", "product_offers", "filter_profiles", "app_settings", "affiliate_links", "publications", "distribution_channels"];

function matchFilter(row: Row, f: QueryFilter): boolean {
  const v = row[f.column];
  switch (f.op) {
    case "eq": return v === f.value;
    case "neq": return v !== f.value;
    case "in": return (f.value as unknown[]).includes(v);
    case "is": return v === f.value || (f.value === null && v == null);
    case "gte": return v != null && (v as never) >= (f.value as never);
    case "lte": return v != null && (v as never) <= (f.value as never);
    case "gt": return v != null && (v as never) > (f.value as never);
    case "lt": return v != null && (v as never) < (f.value as never);
  }
}
const matches = (row: Row, match: Row) => Object.entries(match).every(([k, v]) => row[k] === v);

/**
 * Cliente do MODO DEMO. Dados fictícios ficam isolados no armazenamento local
 * do navegador, marcados com is_demo = true, e nunca são enviados ao banco real.
 * Emula os gatilhos do banco (observações de preço, auditoria, timestamps).
 */
export class DemoDataClient implements DataClient {
  readonly mode = "demo" as const;
  private db: DB;
  constructor(private storage: KeyValueStorage = window.localStorage, seed = true) {
    const raw = storage.getItem(STORAGE_KEY);
    this.db = raw ? (JSON.parse(raw) as DB) : seed ? buildDemoSeed() : baseDb();
    this.persist();
  }

  static reset(storage: KeyValueStorage = window.localStorage) {
    storage.removeItem(STORAGE_KEY);
  }

  private persist() { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.db)); }
  private t(table: TableName): Row[] { return (this.db[table] ??= []); }

  private audit(action: string, table: TableName, row: Row, changes: Row | null) {
    if (!AUDITED.includes(table)) return;
    this.t("audit_logs").push({
      id: uuid(), organization_id: DEMO_ORG_ID, actor_id: DEMO_USER_ID, action, entity: table,
      entity_id: String(row.id ?? row.organization_id ?? ""), changes, created_at: new Date().toISOString(),
    });
  }

  private observe(offer: Row) {
    if (offer.current_price == null) return;
    this.t("price_observations").push({
      id: uuid(), organization_id: offer.organization_id, product_id: offer.product_id, variant_id: offer.variant_id ?? null,
      offer_id: offer.id, platform_code: offer.platform_code, price: offer.current_price, shipping_cost: offer.shipping_cost ?? null,
      coupon_code: offer.coupon_code ?? null, observed_at: new Date().toISOString(), source: offer.data_source ?? "demo",
      collection_method: offer.collection_method ?? "demo", quality: "media", is_demo: true, created_at: new Date().toISOString(),
    });
  }

  async list<T>(table: TableName, opts: ListOptions = {}): Promise<T[]> {
    if (table === "affiliate_platforms") return PLATFORM_CATALOG as T[];
    let rows = [...this.t(table)];
    for (const f of opts.filters ?? []) rows = rows.filter((r) => matchFilter(r, f));
    if (opts.orderBy) {
      const { column, ascending = true } = opts.orderBy;
      rows.sort((a, b) => {
        const av = a[column] as never, bv = b[column] as never;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av > bv ? 1 : av < bv ? -1 : 0) * (ascending ? 1 : -1);
      });
    }
    return structuredClone(rows.slice(0, opts.limit ?? 5000)) as T[];
  }

  async insert<T>(table: TableName, values: Row | Row[]): Promise<T[]> {
    const now = new Date().toISOString();
    const list = Array.isArray(values) ? values : [values];
    const out: Row[] = [];
    for (const v of list) {
      const row: Row = { id: uuid(), created_at: now, updated_at: now, is_demo: true, ...v };
      if (table === "product_offers") {
        row.status ??= "encontrada";
        row.status_changed_at = now;
        row.stock_status ??= "desconhecido";
        row.collection_method ??= "manual";
        row.data_source ??= "manual";
        row.is_favorite ??= false;
        row.is_monitored ??= false;
        row.currency ??= "BRL";
        if (row.external_id && this.t(table).some((r) => r.platform_code === row.platform_code && r.external_id === row.external_id)) {
          throw new DataError("Registro duplicado: já existe um item com esses dados.", "23505");
        }
      }
      if (table === "filter_profiles" && this.t(table).some((r) => r.name === row.name)) {
        throw new DataError("Registro duplicado: já existe um item com esses dados.", "23505");
      }
      if (table === "integrations" && row.status === "conectada_validada") {
        throw new DataError("Somente o servidor pode marcar uma integração como conectada e validada.");
      }
      this.t(table).push(row);
      if (table === "product_offers") this.observe(row);
      this.audit("insert", table, row, row);
      out.push(row);
    }
    this.persist();
    return structuredClone(out) as T[];
  }

  async update<T>(table: TableName, match: Row, patch: Row): Promise<T[]> {
    const out: Row[] = [];
    for (const row of this.t(table)) {
      if (!matches(row, match)) continue;
      if (table === "integrations" && patch.status === "conectada_validada" && row.status !== "conectada_validada") {
        throw new DataError("Somente o servidor pode marcar uma integração como conectada e validada.");
      }
      const changes: Row = {};
      for (const [k, v] of Object.entries(patch)) {
        if (JSON.stringify(row[k]) !== JSON.stringify(v)) changes[k] = { de: row[k] ?? null, para: v };
      }
      const priceChanged = table === "product_offers" && ("current_price" in changes || "shipping_cost" in changes);
      if (table === "product_offers" && "status" in changes) row.status_changed_at = new Date().toISOString();
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
      if (priceChanged) this.observe(row);
      if (Object.keys(changes).length) this.audit("update", table, row, changes);
      out.push(row);
    }
    this.persist();
    return structuredClone(out) as T[];
  }

  async upsert<T>(table: TableName, values: Row, onConflict: string): Promise<T[]> {
    const keys = onConflict.split(",").map((s) => s.trim());
    const match = Object.fromEntries(keys.map((k) => [k, values[k]]));
    const exists = this.t(table).some((r) => matches(r, match));
    if (exists) return this.update<T>(table, match, values);
    return this.insert<T>(table, values);
  }

  async remove(table: TableName, match: Row): Promise<void> {
    const rows = this.t(table);
    const removed = rows.filter((r) => matches(r, match));
    this.db[table] = rows.filter((r) => !matches(r, match));
    // cascatas relevantes
    for (const r of removed) {
      if (table === "products") {
        await this.remove("product_offers", { product_id: r.id });
        this.db.price_observations = this.t("price_observations").filter((o) => o.product_id !== r.id);
      }
      if (table === "product_offers") {
        this.db.price_observations = this.t("price_observations").map((o) => (o.offer_id === r.id ? { ...o, offer_id: null } : o));
      }
      this.audit("delete", table, r, { removido: r });
    }
    this.persist();
  }

  async invoke(fn: string): Promise<InvokeResult> {
    return {
      ok: false,
      result: "demo",
      message: `Modo DEMO: a função de servidor "${fn}" não é executada. Conecte um projeto Supabase/Lovable Cloud para usar integrações reais.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Seed DEMO — dados FICTÍCIOS, claramente identificados.
// ---------------------------------------------------------------------------
function baseDb(): DB {
  const now = new Date().toISOString();
  return {
    organizations: [{ id: DEMO_ORG_ID, name: "Organização DEMO", slug: "demo", created_by: DEMO_USER_ID, created_at: now }],
    profiles: [{ id: DEMO_USER_ID, full_name: "Administrador DEMO", avatar_url: null, default_organization_id: DEMO_ORG_ID }],
    app_settings: [{ organization_id: DEMO_ORG_ID, settings: {}, updated_at: now }],
    user_preferences: [{ user_id: DEMO_USER_ID, preferences: {}, updated_at: now }],
    integrations: PLATFORM_CATALOG.map((p) => ({
      id: uuid(), organization_id: DEMO_ORG_ID, platform_code: p.code, status: p.availability === "indisponivel" ? "indisponivel" : "nao_configurada",
      connection_method: null, affiliate_identifier: null, commission_info: null, enabled_features: [], has_credentials: false,
      last_sync_at: null, last_validated_at: null, last_error: null, created_at: now, updated_at: now,
    })),
  };
}

function buildDemoSeed(): DB {
  const db = baseDb();
  const day = 86_400_000;
  const nowMs = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  type P = [name: string, cat: string, brand: string, platform: string, price: number, ref: number | null, refSrc: string | null, ship: number | null, rating: number | null, count: number | null, stock: string, commission: number | null, status: string, coupon?: string];
  const items: P[] = [
    ["Fone Bluetooth Modelo DEMO A", "Tecnologia", "Marca Fictícia", "amazon", 179.9, 259.9, "historico", 0, 4.6, 1840, "em_estoque", 4, "aguardando_aprovacao"],
    ["Smartwatch DEMO S2", "Tecnologia", "Marca Exemplo", "shopee", 219.0, 299.0, "manual_verificado", 12.9, 4.4, 620, "em_estoque", 7, "aprovada", "DEMO10"],
    ["Air Fryer DEMO 4L", "Casa", "Marca Fictícia", "magalu", 349.9, 499.0, "preco_riscado_vendedor", 0, 4.7, 3200, "em_estoque", 3, "em_verificacao"],
    ["Teclado Mecânico DEMO K1", "Tecnologia", "Marca Exemplo", "mercadolivre", 229.9, 289.9, "historico", 19.9, 4.5, 410, "baixo_estoque", 5, "encontrada"],
    ["Curso Online DEMO de Fotografia", "Educação", "Produtor Fictício", "hotmart", 197.0, null, null, null, null, null, "desconhecido", 40, "dados_insuficientes"],
    ["Mochila DEMO Urbana 20L", "Moda", "Marca Exemplo", "shopee", 89.9, 99.9, "historico", 9.9, 4.2, 88, "em_estoque", 6, "rejeitada"],
    ["SSD DEMO 1TB NVMe", "Tecnologia", "Marca Fictícia", "amazon", 389.0, 549.0, "historico", 0, 4.8, 5120, "em_estoque", 4, "publicada"],
    ["Cafeteira DEMO Expresso", "Casa", "Marca Exemplo", "mercadolivre", 499.0, 529.0, "manual_verificado", null, 4.3, 150, "desconhecido", 5, "encontrada"],
  ];
  const products: Row[] = [];
  const offers: Row[] = [];
  const observations: Row[] = [];
  items.forEach((it, i) => {
    const [name, cat, brand, platform, price, ref, refSrc, ship, rating, count, stock, commission, status, coupon] = it;
    const created = iso(nowMs - (i % 5) * day - i * 3_600_000);
    const pid = uuid();
    const oid = uuid();
    products.push({ id: pid, organization_id: DEMO_ORG_ID, name, description: "Produto fictício para demonstração da interface. Não representa oferta real.", brand, model: `DEMO-${100 + i}`, category: cat, image_url: null, gtin: null, is_demo: true, created_at: created, updated_at: created });
    offers.push({
      id: oid, organization_id: DEMO_ORG_ID, product_id: pid, variant_id: null, seller_id: null, platform_code: platform,
      external_id: `DEMO-${i + 1}`, store_name: "Loja DEMO", original_url: null, affiliate_url: null, currency: "BRL",
      current_price: price, reference_price: ref, reference_price_source: refSrc, shipping_cost: ship, rating, rating_count: count,
      seller_reputation: null, stock_status: stock, coupon_code: coupon ?? null, coupon_details: null, commission_rate: commission,
      commission_source: commission != null ? "demo" : null, status, score: null, score_breakdown: null, filter_decision: null, filter_reasons: null,
      data_source: "demo", collection_method: "demo", is_favorite: i === 0 || i === 6, is_monitored: i < 3, is_demo: true,
      last_verified_at: status === "encontrada" ? null : iso(nowMs - (i + 1) * 3_600_000), status_changed_at: created, created_at: created, updated_at: created,
    });
    // histórico fictício apenas para alguns itens (outros ficam com "histórico insuficiente")
    const points = i % 3 === 0 ? 24 : i % 3 === 1 ? 4 : 1;
    for (let k = points - 1; k >= 0; k--) {
      const factor = k === 0 ? 1 : 1 + (((k * 37 + i * 11) % 30) / 100);
      observations.push({
        id: uuid(), organization_id: DEMO_ORG_ID, product_id: pid, variant_id: null, offer_id: oid, platform_code: platform,
        price: Math.round(price * factor * 100) / 100, shipping_cost: ship, coupon_code: null, observed_at: iso(nowMs - k * 5 * day),
        source: "demo", collection_method: "demo", quality: "baixa", is_demo: true, created_at: iso(nowMs - k * 5 * day),
      });
    }
  });
  db.products = products;
  db.product_offers = offers;
  db.price_observations = observations;
  db.filter_profiles = [{
    id: uuid(), organization_id: DEMO_ORG_ID, name: "Perfil Tecnologia", description: "Desconto ≥ 20%, avaliação ≥ 4,5, ≥ 100 avaliações, até R$ 500 e estoque confirmado.",
    category: "Tecnologia", is_default: true, is_active: true, created_at: iso(nowMs), updated_at: iso(nowMs),
    rules: { minDiscount: 20, minRating: 4.5, minRatingCount: 100, minPrice: null, maxPrice: 500, allowedPlatforms: [], allowedCategories: ["Tecnologia"], blockedTerms: [], minSellerReputation: null, minCommission: null, maxCommission: null, requireCoupon: false, requireInStock: true, minDataQuality: null, maxVerificationAgeHours: null, minHistoryConfidence: null, requireHumanReview: true },
  }];
  db.notifications = [
    { id: uuid(), organization_id: DEMO_ORG_ID, user_id: null, kind: "boas_vindas", title: "Você está no modo DEMO", body: "Todos os dados exibidos são fictícios e servem apenas para testar a interface.", link: null, severity: "aviso", read_at: null, is_demo: true, created_at: iso(nowMs) },
    { id: uuid(), organization_id: DEMO_ORG_ID, user_id: null, kind: "publicacao_pendente", title: "1 oferta aguardando aprovação (DEMO)", body: "Fone Bluetooth Modelo DEMO A", link: "/ofertas?status=aguardando_aprovacao", severity: "info", read_at: null, is_demo: true, created_at: iso(nowMs - 3_600_000) },
  ];
  return db;
}

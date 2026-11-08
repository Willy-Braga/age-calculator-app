import type { OfferWithProduct } from "@/lib/data/types";

export function makeOffer(over: Partial<OfferWithProduct> = {}, product: Partial<OfferWithProduct["product"]> = {}): OfferWithProduct {
  const now = new Date().toISOString();
  return {
    id: "o1", organization_id: "org", created_at: now, updated_at: now, product_id: "p1", variant_id: null, seller_id: null,
    platform_code: "amazon", external_id: null, store_name: null, original_url: "https://www.amazon.com.br/dp/B000", affiliate_url: null,
    currency: "BRL", current_price: 100, reference_price: 150, reference_price_source: "historico", shipping_cost: 0,
    rating: 4.8, rating_count: 500, seller_reputation: null, stock_status: "em_estoque", coupon_code: null, coupon_details: null,
    commission_rate: 5, commission_source: null, status: "encontrada", score: null, score_breakdown: null, filter_decision: null,
    filter_reasons: null, data_source: "manual", collection_method: "manual", is_favorite: false, is_monitored: false, is_demo: false,
    last_verified_at: now, status_changed_at: now,
    ...over,
    product: { id: "p1", organization_id: "org", created_at: now, updated_at: now, name: "Fone X", description: null, brand: "Marca", model: "M1", category: "Tecnologia", image_url: null, gtin: null, is_demo: false, ...product },
  };
}

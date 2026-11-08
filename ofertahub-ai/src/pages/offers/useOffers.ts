import * as React from "react";
import { useList } from "@/hooks/useData";
import { useOrgSettings } from "@/hooks/useSettings";
import type { FilterProfile, OfferWithProduct, PriceObservation, Product, ProductOffer } from "@/lib/data/types";
import { computeHistoryStats, type HistoryStats } from "@/lib/domain/history";
import { evaluateFilters, type FilterResult } from "@/lib/domain/filters";
import { scoreOffer, type ScoreResult } from "@/lib/domain/scoring";
import { DEFAULT_ORG_SETTINGS } from "@/lib/domain/settings";

export interface EnrichedOffer extends OfferWithProduct {
  history: HistoryStats;
  scoring: ScoreResult;
  filter: FilterResult | null;
}

/** Junta ofertas + produtos + observações e calcula pontuação/filtros com as regras atuais. */
export function useOffers(filterProfileId?: string | null) {
  const offers = useList<ProductOffer>("product_offers", { orderBy: { column: "created_at", ascending: false } });
  const products = useList<Product>("products");
  const observations = useList<PriceObservation>("price_observations", { orderBy: { column: "observed_at", ascending: true } });
  const profiles = useList<FilterProfile>("filter_profiles", { orderBy: { column: "name" } });
  const { settings } = useOrgSettings();
  const s = settings ?? DEFAULT_ORG_SETTINGS;

  const profileId = filterProfileId === undefined ? s.defaultFilterProfileId : filterProfileId;
  const profile = profiles.data?.find((p) => p.id === profileId) ?? null;

  const data = React.useMemo<EnrichedOffer[]>(() => {
    if (!offers.data || !products.data) return [];
    const byProduct = new Map(products.data.map((p) => [p.id, p]));
    const obsByOffer = new Map<string, PriceObservation[]>();
    for (const o of observations.data ?? []) {
      if (!o.offer_id) continue;
      const arr = obsByOffer.get(o.offer_id) ?? [];
      arr.push(o);
      obsByOffer.set(o.offer_id, arr);
    }
    return offers.data.flatMap((o) => {
      const product = byProduct.get(o.product_id);
      if (!product) return [];
      const full: OfferWithProduct = { ...o, product };
      const history = computeHistoryStats(obsByOffer.get(o.id) ?? []);
      const scoring = scoreOffer(full, s.scoringWeights, { favoriteCategories: s.favoriteCategories, historyConfidence: history.confidence });
      const filter = profile ? evaluateFilters(full, profile.rules, { historyConfidence: history.confidence }) : null;
      return [{ ...full, history, scoring, filter }];
    });
  }, [offers.data, products.data, observations.data, s, profile]);

  return {
    data,
    profiles: profiles.data ?? [],
    activeProfile: profile,
    observations: observations.data ?? [],
    settings: s,
    isLoading: offers.isLoading || products.isLoading,
    error: offers.error ?? products.error,
    refetch: () => { offers.refetch(); products.refetch(); observations.refetch(); },
  };
}

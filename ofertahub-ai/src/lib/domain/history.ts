import type { PriceObservation } from "../data/types";

export type HistoryConfidence = "insuficiente" | "baixa" | "media" | "alta";

export interface HistoryStats {
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  median: number | null;
  variationPercent: number | null;
  firstObservedAt: string | null;
  lastChangeAt: string | null;
  spanDays: number;
  confidence: HistoryConfidence;
}

export const CONFIDENCE_LABEL: Record<HistoryConfidence, string> = {
  insuficiente: "Histórico insuficiente", baixa: "Confiança baixa", media: "Confiança média", alta: "Confiança alta",
};

/**
 * Estatísticas calculadas SOMENTE a partir de observações registradas.
 * Nunca interpola nem inventa preços.
 */
export function computeHistoryStats(obs: Pick<PriceObservation, "price" | "observed_at">[]): HistoryStats {
  const sorted = [...obs].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  const prices = sorted.map((o) => Number(o.price));
  const n = prices.length;
  if (n === 0) {
    return { count: 0, min: null, max: null, avg: null, median: null, variationPercent: null, firstObservedAt: null, lastChangeAt: null, spanDays: 0, confidence: "insuficiente" };
  }
  const asc = [...prices].sort((a, b) => a - b);
  const min = asc[0];
  const max = asc[n - 1];
  const avg = Math.round((prices.reduce((s, p) => s + p, 0) / n) * 100) / 100;
  const median = n % 2 ? asc[(n - 1) / 2] : Math.round(((asc[n / 2 - 1] + asc[n / 2]) / 2) * 100) / 100;
  const first = prices[0];
  const last = prices[n - 1];
  const variationPercent = first ? Math.round(((last - first) / first) * 10000) / 100 : null;
  let lastChangeAt: string | null = null;
  for (let i = n - 1; i > 0; i--) {
    if (prices[i] !== prices[i - 1]) { lastChangeAt = sorted[i].observed_at; break; }
  }
  const spanDays = (new Date(sorted[n - 1].observed_at).getTime() - new Date(sorted[0].observed_at).getTime()) / 86_400_000;
  let confidence: HistoryConfidence = "insuficiente";
  if (n >= 3 && spanDays >= 7) confidence = "baixa";
  if (n >= 8 && spanDays >= 30) confidence = "media";
  if (n >= 20 && spanDays >= 90) confidence = "alta";
  return { count: n, min, max, avg, median, variationPercent, firstObservedAt: sorted[0].observed_at, lastChangeAt, spanDays: Math.floor(spanDays), confidence };
}

export const CONFIDENCE_RANK: Record<HistoryConfidence, number> = { insuficiente: 0, baixa: 1, media: 2, alta: 3 };

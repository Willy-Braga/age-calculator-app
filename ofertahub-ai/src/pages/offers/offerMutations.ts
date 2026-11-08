import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "@/lib/auth/AppContext";
import type { FilterProfile, OfferStatus, OfferWithProduct, Product, ProductOffer } from "@/lib/data/types";
import { scoreOffer } from "@/lib/domain/scoring";
import { evaluateFilters } from "@/lib/domain/filters";
import { canTransition, OFFER_STATUS, verifiedDiscount } from "@/lib/domain/offers";
import { checkLink } from "@/lib/domain/links";
import type { OrgSettings } from "@/lib/domain/settings";
import type { HistoryConfidence } from "@/lib/domain/history";

const TABLES = ["product_offers", "products", "price_observations", "audit_logs", "notifications"];

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => TABLES.includes(q.queryKey[2] as string) });
}

export type ProductInput = Pick<Product, "name" | "description" | "brand" | "model" | "category" | "image_url">;
export type OfferInput = Partial<Omit<ProductOffer, "id" | "organization_id" | "product_id" | "created_at" | "updated_at">>;

/** Snapshot de pontuação/filtro persistido junto da oferta (auditável). */
export function computeSnapshot(full: OfferWithProduct, settings: OrgSettings, profile: FilterProfile | null, history: HistoryConfidence = "insuficiente") {
  const scoring = scoreOffer(full, settings.scoringWeights, { favoriteCategories: settings.favoriteCategories, historyConfidence: history });
  const filter = profile ? evaluateFilters(full, profile.rules, { historyConfidence: history }) : null;
  return {
    scoring,
    patch: {
      score: scoring.score,
      score_breakdown: { classification: scoring.classification, components: scoring.components, blockers: scoring.blockers, weights: settings.scoringWeights, computed_at: new Date().toISOString() },
      filter_decision: filter?.decision ?? null,
      filter_reasons: filter ? { profile_id: profile!.id, profile_name: profile!.name, checks: filter.checks } : null,
    },
  };
}

export function useSaveOffer(settings: OrgSettings, profile: FilterProfile | null) {
  const { client, orgId, user } = useSession();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ existing, product, offer }: { existing?: OfferWithProduct; product: ProductInput; offer: OfferInput }) => {
      let productRow: Product;
      if (existing) {
        [productRow] = await client.update<Product>("products", { id: existing.product_id, organization_id: orgId }, product);
      } else {
        [productRow] = await client.insert<Product>("products", { ...product, organization_id: orgId, created_by: client.mode === "demo" ? null : user.id, is_demo: client.mode === "demo" });
      }
      let offerRow: ProductOffer;
      if (existing) {
        [offerRow] = await client.update<ProductOffer>("product_offers", { id: existing.id, organization_id: orgId }, offer);
      } else {
        try {
          [offerRow] = await client.insert<ProductOffer>("product_offers", {
            ...offer, organization_id: orgId, product_id: productRow.id, is_demo: client.mode === "demo",
            created_by: client.mode === "demo" ? null : user.id, data_source: offer.data_source ?? "manual", collection_method: "manual",
          });
        } catch (e) {
          await client.remove("products", { id: productRow.id, organization_id: orgId }); // rollback
          throw e;
        }
      }
      const { patch, scoring } = computeSnapshot({ ...offerRow, product: productRow }, settings, profile);
      await client.update("product_offers", { id: offerRow.id, organization_id: orgId }, patch);
      if (!existing && scoring.classification === "alta" && settings.notifications.highScore) {
        await client.insert("notifications", {
          organization_id: orgId, kind: "oferta_pontuacao_alta", title: `Nova oferta com pontuação ${scoring.score}`,
          body: productRow.name, link: `/ofertas?id=${offerRow.id}`, severity: "sucesso", is_demo: client.mode === "demo",
        });
      }
      return offerRow;
    },
    onSuccess: (_d, v) => { invalidate(); toast.success(v.existing ? "Oferta atualizada." : "Oferta cadastrada."); },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Verifica a política de aprovação antes de aprovar. Retorna motivos de bloqueio. */
export function approvalBlockers(o: OfferWithProduct & { scoring?: { blockers: string[] } }, settings: OrgSettings): string[] {
  const reasons: string[] = [...(o.scoring?.blockers ?? [])];
  if (settings.approvalPolicy.requireVerifiedPrice) {
    if (o.current_price == null) reasons.push("Preço atual não informado.");
    if (!o.last_verified_at) reasons.push("Dados nunca verificados (confirme a verificação antes de aprovar).");
    if (o.reference_price != null && verifiedDiscount(o) == null) reasons.push("Desconto exibido não é verificável (preço riscado do vendedor).");
  }
  if (settings.approvalPolicy.requireLinkCheck) {
    const link = o.affiliate_url ?? o.original_url;
    if (!link) reasons.push("Nenhum link (original ou de afiliado) cadastrado.");
    else if (!checkLink(link, o.platform_code, o.affiliate_url ? "afiliado" : "original").valid) reasons.push("Link com estrutura inválida.");
  }
  return Array.from(new Set(reasons));
}

export function useOfferActions(settings: OrgSettings) {
  const { client, orgId } = useSession();
  const invalidate = useInvalidate();
  const patch = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown>; message?: string }) =>
      client.update("product_offers", { id, organization_id: orgId }, values),
    onSuccess: (_d, v) => { invalidate(); if (v.message) toast.success(v.message); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = (o: OfferWithProduct & { scoring?: { blockers: string[] } }, to: OfferStatus) => {
    if (!canTransition(o.status, to)) {
      toast.error(`Transição não permitida: ${OFFER_STATUS[o.status].label} → ${OFFER_STATUS[to].label}.`);
      return;
    }
    if (to === "aprovada") {
      const blockers = approvalBlockers(o, settings);
      if (blockers.length) {
        toast.error("Aprovação bloqueada pela política", { description: blockers.join(" • ") });
        return;
      }
    }
    patch.mutate({ id: o.id, values: { status: to }, message: `Oferta: ${OFFER_STATUS[to].label}.` });
  };

  const remove = useMutation({
    mutationFn: async (o: OfferWithProduct) => {
      await client.remove("product_offers", { id: o.id, organization_id: orgId });
      const remaining = await client.list<ProductOffer>("product_offers", { filters: [{ column: "product_id", op: "eq", value: o.product_id }] });
      if (remaining.length === 0) await client.remove("products", { id: o.product_id, organization_id: orgId });
    },
    onSuccess: () => { invalidate(); toast.success("Oferta excluída."); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { patch, setStatus, remove };
}

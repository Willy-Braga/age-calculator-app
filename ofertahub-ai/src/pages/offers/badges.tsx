import { Badge } from "@/components/ui/badge";
import { OFFER_STATUS, STOCK_STATUS, FILTER_DECISION } from "@/lib/domain/offers";
import { SCORE_CLASS, type ScoreResult } from "@/lib/domain/scoring";
import type { FilterDecision, OfferStatus, StockStatus } from "@/lib/data/types";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const StatusBadge = ({ status }: { status: OfferStatus }) => <Badge variant={OFFER_STATUS[status].variant}>{OFFER_STATUS[status].label}</Badge>;
export const StockBadge = ({ status }: { status: StockStatus }) => <Badge variant={STOCK_STATUS[status].variant}>{STOCK_STATUS[status].label}</Badge>;
export const DecisionBadge = ({ decision }: { decision: FilterDecision }) => <Badge variant={FILTER_DECISION[decision].variant}>{FILTER_DECISION[decision].label}</Badge>;
export const DemoBadge = ({ show }: { show: boolean }) => (show ? <Badge variant="demo" title="Dado fictício do modo DEMO">DEMO</Badge> : null);

export function ScorePill({ scoring, className }: { scoring: ScoreResult; className?: string }) {
  const c = SCORE_CLASS[scoring.classification];
  const color = { success: "text-success border-success/40", warning: "text-warning border-warning/40", muted: "text-muted-foreground", danger: "text-danger border-danger/40" }[c.variant];
  return (
    <Tooltip content={<span>{c.label}{scoring.blockers.length ? ` — ${scoring.blockers.join(" ")}` : ""}</span>}>
      <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums", color, className)} aria-label={`Pontuação ${scoring.score}, ${c.label}`}>
        {scoring.classification === "bloqueada" ? "⛔" : null}{scoring.score}
      </span>
    </Tooltip>
  );
}

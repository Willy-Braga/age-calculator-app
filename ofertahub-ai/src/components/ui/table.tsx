import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Table = ({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto rounded-xl border bg-card">
    <table className={cn("w-full caption-bottom text-sm", className)} {...p} />
  </div>
);
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="bg-muted/50 text-xs text-muted-foreground" {...p} />;
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y" {...p} />;
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className={cn("transition-colors hover:bg-muted/40", className)} {...p} />;
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-10 px-3 text-left font-medium whitespace-nowrap", className)} {...p} />
);
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn("px-3 py-2.5 align-middle", className)} {...p} />;

export type SortState = { column: string; direction: "asc" | "desc" } | null;

export function SortableTH({ column, sort, onSort, children, className }: {
  column: string; sort: SortState; onSort: (s: SortState) => void; children: React.ReactNode; className?: string;
}) {
  const active = sort?.column === column;
  const Icon = !active ? ArrowUpDown : sort!.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TH className={className} aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(!active ? { column, direction: "desc" } : sort!.direction === "desc" ? { column, direction: "asc" } : null)}
      >
        {children}<Icon className="size-3" />
      </button>
    </TH>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
      <span>{from}–{to} de {total}</span>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior"><ChevronLeft /></Button>
        <span className="px-2">Página {page} de {pages}</span>
        <Button size="icon-sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Próxima página"><ChevronRight /></Button>
      </div>
    </div>
  );
}

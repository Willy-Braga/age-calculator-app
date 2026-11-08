import * as React from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: {
  icon?: React.ComponentType<{ className?: string }>; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center", className)}>
      <div className="rounded-full bg-muted p-3"><Icon className="size-5 text-muted-foreground" /></div>
      <p className="text-sm font-medium">{title}</p>
      {description && <div className="max-w-md text-xs text-muted-foreground">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
      <AlertTriangle className="size-5 text-danger" />
      <p className="text-sm font-medium">Não foi possível carregar os dados</p>
      <p className="max-w-md text-xs text-muted-foreground">{msg}</p>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Tentar novamente</Button>}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}

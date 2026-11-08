import { Link } from "react-router-dom";
import { KeyRound, ListChecks, Sparkles } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface Requirement {
  title: string;
  missing: string;
  credentials: string;
  unlocks: string;
  link?: { to: string; label: string };
}

/** Explica, de forma padronizada, por que uma ação depende de configuração externa (seção 24). */
export function RequirementDialog({ req, onOpenChange }: { req: Requirement | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={!!req} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{req?.title}</DialogTitle>
          <DialogDescription>Aguardando configuração — nenhum resultado foi simulado.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 text-sm">
          <div className="flex gap-3"><ListChecks className="mt-0.5 size-4 shrink-0 text-warning" /><div><p className="font-medium">O que falta configurar</p><p className="text-muted-foreground">{req?.missing}</p></div></div>
          <div className="flex gap-3"><KeyRound className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="font-medium">Credencial ou autorização necessária</p><p className="text-muted-foreground">{req?.credentials}</p></div></div>
          <div className="flex gap-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-success" /><div><p className="font-medium">O que ficará disponível</p><p className="text-muted-foreground">{req?.unlocks}</p></div></div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          {req?.link && <Button asChild onClick={() => onOpenChange(false)}><Link to={req.link.to}>{req.link.label}</Link></Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

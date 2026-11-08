import * as React from "react";
import * as A from "@radix-ui/react-alert-dialog";
import { buttonVariants } from "./button";
import { cn } from "@/lib/utils";

interface ConfirmOptions { title: string; description?: string; confirmLabel?: string; destructive?: boolean }
type Resolver = (v: boolean) => void;

const ConfirmCtx = React.createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** Confirmação obrigatória antes de ações destrutivas: `const ok = await confirm({...})`. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: Resolver }) | null>(null);
  const confirm = React.useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <A.Root open={!!state} onOpenChange={(o) => !o && close(false)}>
        <A.Portal>
          <A.Overlay className="fixed inset-0 z-[60] bg-black/50 animate-fade-in" />
          <A.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-2xl animate-fade-in">
            <A.Title className="text-base font-semibold">{state?.title}</A.Title>
            {state?.description && <A.Description className="mt-2 text-sm text-muted-foreground">{state.description}</A.Description>}
            <div className="mt-5 flex justify-end gap-2">
              <A.Cancel className={buttonVariants({ variant: "outline" })} onClick={() => close(false)}>Cancelar</A.Cancel>
              <A.Action className={cn(buttonVariants({ variant: state?.destructive ? "destructive" : "default" }))} onClick={() => close(true)}>
                {state?.confirmLabel ?? "Confirmar"}
              </A.Action>
            </div>
          </A.Content>
        </A.Portal>
      </A.Root>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => React.useContext(ConfirmCtx);

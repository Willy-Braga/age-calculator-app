import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import type { DataClient } from "../data/client";
import { DemoDataClient, DEMO_ORG_ID, DEMO_USER_ID } from "../data/demo";
import { SupabaseDataClient, supabase, isSupabaseConfigured } from "../data/supabase";
import type { Profile } from "../data/types";

const MODE_KEY = "ofertahub:mode";

export interface AppUser { id: string; email: string | null; name: string | null }

interface AppState {
  ready: boolean;
  mode: "supabase" | "demo" | null;
  client: DataClient | null;
  user: AppUser | null;
  orgId: string | null;
  backendConfigured: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
  resetDemo: () => void;
  signOut: () => Promise<void>;
}

const Ctx = React.createContext<AppState | null>(null);

export function AppProvider({ children, testClient }: { children: React.ReactNode; testClient?: DataClient }) {
  const qc = useQueryClient();
  const [demo, setDemo] = React.useState(() => !!testClient || localStorage.getItem(MODE_KEY) === "demo");
  const [session, setSession] = React.useState<Session | null>(null);
  const [sessionReady, setSessionReady] = React.useState(!supabase);
  const [orgId, setOrgId] = React.useState<string | null>(null);
  const [demoNonce, setDemoNonce] = React.useState(0);

  React.useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setSessionReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const client = React.useMemo<DataClient | null>(() => {
    if (testClient) return testClient;
    if (demo) return new DemoDataClient(window.localStorage);
    if (supabase && session) return new SupabaseDataClient(supabase);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, session?.user.id, testClient, demoNonce]);

  // Organização ativa (multi-organização preparada; hoje usa a padrão do perfil)
  React.useEffect(() => {
    if (demo) { setOrgId(DEMO_ORG_ID); return; }
    if (!client || !session) { setOrgId(null); return; }
    let cancelled = false;
    client.list<Profile>("profiles", { filters: [{ column: "id", op: "eq", value: session.user.id }] })
      .then(async (rows) => {
        let org = rows[0]?.default_organization_id ?? null;
        if (!org) {
          const orgs = await client.list<{ id: string }>("organizations", { limit: 1 });
          org = orgs[0]?.id ?? null;
        }
        if (!cancelled) setOrgId(org);
      })
      .catch(() => !cancelled && setOrgId(null));
    return () => { cancelled = true; };
  }, [client, session, demo]);

  const user: AppUser | null = demo
    ? { id: DEMO_USER_ID, email: "demo@ofertahub.local", name: "Administrador DEMO" }
    : session ? { id: session.user.id, email: session.user.email ?? null, name: (session.user.user_metadata?.full_name as string) ?? null } : null;

  const value: AppState = {
    ready: demo ? true : sessionReady && (!session || orgId !== null),
    mode: demo ? "demo" : session ? "supabase" : null,
    client,
    user,
    orgId,
    backendConfigured: isSupabaseConfigured,
    enterDemo: () => { localStorage.setItem(MODE_KEY, "demo"); qc.clear(); setDemo(true); },
    exitDemo: () => { localStorage.removeItem(MODE_KEY); qc.clear(); setDemo(false); },
    resetDemo: () => { DemoDataClient.reset(window.localStorage); qc.clear(); setDemoNonce((n) => n + 1); },
    signOut: async () => {
      if (demo) { localStorage.removeItem(MODE_KEY); setDemo(false); }
      else await supabase?.auth.signOut();
      qc.clear();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useApp fora do AppProvider");
  return v;
}

/** Garante client e organização (para uso dentro das rotas protegidas). */
export function useSession() {
  const app = useApp();
  if (!app.client || !app.orgId || !app.user) throw new Error("Sessão indisponível");
  return { ...app, client: app.client, orgId: app.orgId, user: app.user };
}

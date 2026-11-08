import * as React from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Database, FlaskConical } from "lucide-react";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/lib/auth/AppContext";
import { supabase } from "@/lib/data/supabase";

const loginSchema = z.object({ email: z.string().email("E-mail inválido"), password: z.string().min(8, "Mínimo de 8 caracteres") });
const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, "Informe seu nome"),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: "As senhas não conferem", path: ["confirm"] });

function translateAuthError(msg: string) {
  if (/Invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar.";
  if (/already registered/i.test(msg)) return "Este e-mail já está cadastrado.";
  if (/rate limit/i.test(msg)) return "Muitas tentativas. Aguarde alguns minutos.";
  return msg;
}

function BackendMissing() {
  const { enterDemo } = useApp();
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium text-warning"><Database className="size-4" /> Backend aguardando configuração</p>
        <p className="mt-2 text-muted-foreground">
          Para usar dados reais com login, conecte um projeto <strong>Supabase</strong> ou <strong>Lovable Cloud</strong>:
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Aplique as migrações de <code>supabase/migrations</code>.</li>
          <li>Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> em <code>.env.local</code>.</li>
          <li>Publique as Edge Functions de <code>supabase/functions</code>.</li>
        </ol>
      </div>
      <Button variant="outline" className="w-full" onClick={() => { enterDemo(); navigate("/"); }}>
        <FlaskConical /> Explorar no modo DEMO (dados fictícios)
      </Button>
    </div>
  );
}

export function LoginPage() {
  const { mode, backendConfigured, enterDemo } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = React.useState("entrar");
  const login = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const signup = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema) });

  if (mode) return <Navigate to="/" replace />;

  const onLogin = login.handleSubmit(async (v) => {
    const { error } = await supabase!.auth.signInWithPassword({ email: v.email, password: v.password });
    if (error) toast.error(translateAuthError(error.message));
    else navigate("/");
  });
  const onSignup = signup.handleSubmit(async (v) => {
    const { data, error } = await supabase!.auth.signUp({
      email: v.email, password: v.password,
      options: { data: { full_name: v.fullName }, emailRedirectTo: window.location.origin },
    });
    if (error) return toast.error(translateAuthError(error.message));
    if (!data.session) toast.success("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
    else navigate("/");
  });

  return (
    <AuthLayout title="Bem-vindo ao OfertaHub AI" subtitle="Central inteligente de ofertas e marketing de afiliados.">
      {!backendConfigured ? <BackendMissing /> : (
        <>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entrar">Entrar</TabsTrigger>
              <TabsTrigger value="cadastrar">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="entrar">
              <form onSubmit={onLogin} className="space-y-4" noValidate>
                <Field label="E-mail" htmlFor="email" error={login.formState.errors.email?.message}>
                  <Input id="email" type="email" autoComplete="email" {...login.register("email")} />
                </Field>
                <Field label="Senha" htmlFor="password" error={login.formState.errors.password?.message}>
                  <Input id="password" type="password" autoComplete="current-password" {...login.register("password")} />
                </Field>
                <div className="flex justify-end"><Link to="/recuperar-senha" className="text-xs text-primary hover:underline">Esqueci minha senha</Link></div>
                <Button type="submit" variant="brand" className="w-full" loading={login.formState.isSubmitting}>Entrar</Button>
              </form>
            </TabsContent>
            <TabsContent value="cadastrar">
              <form onSubmit={onSignup} className="space-y-4" noValidate>
                <Field label="Nome" htmlFor="fullName" error={signup.formState.errors.fullName?.message}>
                  <Input id="fullName" autoComplete="name" {...signup.register("fullName")} />
                </Field>
                <Field label="E-mail" htmlFor="semail" error={signup.formState.errors.email?.message}>
                  <Input id="semail" type="email" autoComplete="email" {...signup.register("email")} />
                </Field>
                <Field label="Senha" htmlFor="spassword" error={signup.formState.errors.password?.message}>
                  <Input id="spassword" type="password" autoComplete="new-password" {...signup.register("password")} />
                </Field>
                <Field label="Confirmar senha" htmlFor="confirm" error={signup.formState.errors.confirm?.message}>
                  <Input id="confirm" type="password" autoComplete="new-password" {...signup.register("confirm")} />
                </Field>
                <Button type="submit" variant="brand" className="w-full" loading={signup.formState.isSubmitting}>Criar conta</Button>
              </form>
            </TabsContent>
          </Tabs>
          <div className="my-6 flex items-center gap-3 text-[11px] uppercase text-muted-foreground"><span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" /></div>
          <Button variant="outline" className="w-full" onClick={() => { enterDemo(); navigate("/"); }}>
            <FlaskConical /> Explorar no modo DEMO (dados fictícios)
          </Button>
        </>
      )}
    </AuthLayout>
  );
}

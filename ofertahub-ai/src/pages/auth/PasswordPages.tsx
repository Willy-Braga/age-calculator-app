import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { supabase } from "@/lib/data/supabase";

export function ForgotPasswordPage() {
  const [sent, setSent] = React.useState(false);
  const form = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email: z.string().email("E-mail inválido") })) });
  const onSubmit = form.handleSubmit(async ({ email }) => {
    if (!supabase) return toast.error("Backend não configurado.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir-senha` });
    if (error) toast.error(error.message);
    else setSent(true);
  });
  return (
    <AuthLayout title="Recuperar senha" subtitle="Enviaremos um link seguro para redefinir sua senha.">
      {sent ? (
        <p className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm">Se o e-mail estiver cadastrado, você receberá um link em instantes.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="E-mail" htmlFor="email" error={form.formState.errors.email?.message}>
            <Input id="email" type="email" {...form.register("email")} />
          </Field>
          <Button type="submit" variant="brand" className="w-full" loading={form.formState.isSubmitting}>Enviar link</Button>
        </form>
      )}
      <Link to="/entrar" className="mt-6 block text-center text-xs text-primary hover:underline">Voltar ao login</Link>
    </AuthLayout>
  );
}

const resetSchema = z.object({ password: z.string().min(8, "Mínimo de 8 caracteres"), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "As senhas não conferem", path: ["confirm"] });

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const form = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });
  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (!supabase) return toast.error("Backend não configurado.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error(error.message);
    else { toast.success("Senha atualizada."); navigate("/"); }
  });
  return (
    <AuthLayout title="Definir nova senha">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nova senha" htmlFor="password" error={form.formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" {...form.register("password")} />
        </Field>
        <Field label="Confirmar senha" htmlFor="confirm" error={form.formState.errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" {...form.register("confirm")} />
        </Field>
        <Button type="submit" variant="brand" className="w-full" loading={form.formState.isSubmitting}>Salvar nova senha</Button>
      </form>
    </AuthLayout>
  );
}

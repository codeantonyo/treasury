"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

/** What every server action returns to its form. `values` refills inputs after an error. */
export type FormState = { error?: string; ok?: string; values?: Record<string, string> } | undefined;
type Action = (prev: FormState, data: FormData) => Promise<FormState>;

export function ActionForm({
  action,
  children,
  className = "flex flex-col gap-3",
}: {
  action: Action;
  children: (state: FormState) => React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className} noValidate>
      {children(state)}
      <Status state={state} />
    </form>
  );
}

export function Status({ state }: { state: FormState }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={`rounded-xl px-3 py-2 text-[13px] font-semibold ${state.error ? "bg-red-500/12 text-red-300" : "bg-violet/15 text-lilac-soft"}`}
    >
      {state.error ?? state.ok}
    </p>
  );
}

export function Field({
  label,
  hint,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-muted-2">{label}</span>
      <input
        {...input}
        className="h-12 rounded-[14px] border border-white/12 bg-white/5 px-3.5 text-base font-semibold text-paper outline-none placeholder:text-dim focus:border-violet-2 focus:bg-white/8"
      />
      {hint && <span className="text-[11px] text-dim">{hint}</span>}
    </label>
  );
}

export function Submit({ children, variant = "primary", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const { pending } = useFormStatus();
  const look = {
    primary: "bg-paper text-on-paper",
    ghost: "border border-white/16 text-paper",
    danger: "border border-red-400/40 text-red-300",
  }[variant];
  return (
    <button
      {...rest}
      disabled={pending || rest.disabled}
      className={`h-12 rounded-[14px] px-4 text-sm font-extrabold transition-[transform,opacity] active:scale-[0.98] disabled:opacity-50 ${look} ${rest.className ?? ""}`}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ActionForm, Field, Status, Submit } from "../ui/form";
import { forgot, login, register, resendVerification, resetPassword, verifyEmail } from "./actions";

const linkCls = "font-bold text-lilac underline-offset-4 hover:underline";

export function LoginForm({ next }: { next: string }) {
  return (
    <ActionForm action={login}>
      {(s) => (
        <>
          <input type="hidden" name="next" value={next} />
          <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={s?.values?.email} required />
          <Field label="Password" name="password" type="password" autoComplete="current-password" required />
          <div className="-mt-1 flex justify-end">
            <Link href="/forgot" className={`text-xs ${linkCls}`}>
              Forgot password?
            </Link>
          </div>
          <Submit>Log in</Submit>
          <p className="text-center text-sm text-muted">
            New here?{" "}
            <Link href="/register" className={linkCls}>
              Create an account
            </Link>
          </p>
        </>
      )}
    </ActionForm>
  );
}

export function RegisterForm({ refCode }: { refCode: string }) {
  return (
    <ActionForm action={register}>
      {(s) => (
        <>
          <Field label="Name" name="name" autoComplete="name" defaultValue={s?.values?.name} required />
          <Field label="Username" name="tag" autoComplete="username" placeholder="yourname" hint="Shown as @username. 3–20 letters, numbers or _." defaultValue={s?.values?.tag} required />
          <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={s?.values?.email} required />
          <Field label="Password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters." required />
          <Field label="Referral code (optional)" name="ref" autoCapitalize="characters" placeholder="TRSY-XXXXXX" defaultValue={s?.values?.ref ?? refCode} />
          <Submit>Create account</Submit>
          <p className="text-center text-sm text-muted">
            Already a member?{" "}
            <Link href="/login" className={linkCls}>
              Log in
            </Link>
          </p>
        </>
      )}
    </ActionForm>
  );
}

export function ForgotForm() {
  return (
    <ActionForm action={forgot}>
      {(s) => (
        <>
          <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={s?.values?.email} required />
          <Submit>Send reset link</Submit>
          <p className="text-center text-sm text-muted">
            Remembered it?{" "}
            <Link href="/login" className={linkCls}>
              Log in
            </Link>
          </p>
        </>
      )}
    </ActionForm>
  );
}

export function ResetForm({ u, t }: { u: string; t: string }) {
  return (
    <ActionForm action={resetPassword}>
      {() => (
        <>
          <input type="hidden" name="u" value={u} />
          <input type="hidden" name="t" value={t} />
          <Field label="New password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters." required />
          <Field label="Repeat new password" name="confirm" type="password" autoComplete="new-password" required />
          <Submit>Set new password</Submit>
        </>
      )}
    </ActionForm>
  );
}

export function VerifyForm({ email }: { email: string }) {
  const [resent, resend, pending] = useActionState(resendVerification, undefined);
  return (
    <>
      <ActionForm action={verifyEmail}>
        {() => (
          <>
            <Field
              label={`Code sent to ${email}`}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              required
              className="tracking-[0.4em]"
            />
            <Submit>Verify email</Submit>
          </>
        )}
      </ActionForm>
      <form action={resend} className="flex flex-col gap-3">
        <button disabled={pending} className="text-sm font-bold text-lilac disabled:opacity-50">
          {pending ? "Sending…" : "Send a new code"}
        </button>
        <Status state={resent} />
      </form>
      <Link href="/" className="text-center text-sm text-muted underline-offset-4 hover:underline">
        Skip for now
      </Link>
    </>
  );
}

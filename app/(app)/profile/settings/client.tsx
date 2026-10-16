"use client";

import { useRef, useState, useTransition } from "react";
import { MAIN_TOKEN } from "@/lib/tokens";
import Avatar from "../../../ui/avatar";
import { ActionForm, Field, Submit } from "../../../ui/form";
import { CheckIcon, CopyIcon, ExternalIcon } from "../../../ui/icons";
import { addWallet, changePassword, confirmEmailChange, devVerifyWallet, makePrimary, removeWallet, renewProof, requestEmailChange, saveAvatar, setPref, updateProfile, verifyWallet } from "./actions";

const small = "h-9 rounded-xl px-3 text-xs font-extrabold transition-transform active:scale-[0.97] disabled:opacity-50";

/** Pick a photo, crop it square and shrink it to 256px JPEG in the browser, then save. */
export function AvatarPicker({ src, name }: { src: string | null; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const side = Math.min(bmp.width, bmp.height);
      const canvas = Object.assign(document.createElement("canvas"), { width: 256, height: 256 });
      canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
      const url = canvas.toDataURL("image/jpeg", 0.85);
      start(async () => setError((await saveAvatar(url)).error));
    } catch {
      setError("That file isn't an image we can read.");
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar src={src} name={name} size={64} />
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button type="button" disabled={pending} onClick={() => input.current?.click()} className={`${small} bg-paper text-on-paper`}>
            {pending ? "Saving…" : src ? "Change photo" : "Add photo"}
          </button>
          {src && (
            <button type="button" disabled={pending} onClick={() => start(async () => void (await saveAvatar(null)))} className={`${small} border border-white/16`}>
              Remove
            </button>
          )}
        </div>
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}

export function Toggle({ pref, label, hint, initial }: { pref: "hideBalances" | "emailNotifs" | "tgNotifs"; label: string; hint: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-xs text-muted">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          setPref(pref, e.target.checked);
        }}
        className="peer sr-only"
      />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-white/12 transition-colors peer-checked:bg-violet peer-focus-visible:outline-2 peer-focus-visible:outline-lilac after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-paper after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className={`${small} flex shrink-0 items-center gap-1 border border-white/16`}
      aria-label={`${label}: ${value}`}
    >
      {done ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {done ? "Copied" : label}
    </button>
  );
}

type W = { id: string; address: string; primary: boolean; status: "pending" | "verified"; memo: string; expiresAt: number };

export function WalletRow({ w, treasury, dev }: { w: W; treasury: string | null; dev: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const short = `${w.address.slice(0, 6)}…${w.address.slice(-6)}`;
  const expires = new Date(w.expiresAt);
  const sep7 = treasury && `web+stellar:pay?destination=${treasury}&amount=1&memo=${w.memo}&memo_type=MEMO_TEXT`;

  return (
    <li className="flex flex-col gap-3 rounded-[16px] border border-white/10 bg-black/20 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-[13px] font-bold">{short}</span>
          <span className={`text-[11px] font-extrabold tracking-[0.1em] ${w.status === "verified" ? "text-lilac" : "text-ember"}`}>
            {w.status === "verified" ? (w.primary ? "VERIFIED · PRIMARY" : "VERIFIED") : "WAITING FOR PROOF"}
          </span>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {w.status === "verified" && !w.primary && (
            <button disabled={pending} onClick={() => start(() => makePrimary(w.id))} className={`${small} border border-white/16`}>
              Make primary
            </button>
          )}
          <button
            disabled={pending}
            onClick={() => confirm("Remove this wallet from your account?") && start(() => removeWallet(w.id))}
            className={`${small} border border-red-400/30 text-red-300`}
          >
            Remove
          </button>
        </div>
      </div>

      {w.status === "pending" && (
        <div className="flex flex-col gap-2.5 rounded-xl bg-white/4 p-3 text-xs leading-snug text-muted-2">
          {treasury ? (
            <>
              <p>
                From <b className="text-paper">this wallet</b>, send <b className="text-paper">1 {MAIN_TOKEN.code}</b> (or 1 XLM) to the address below with
                this memo, within 24 hours (before {expires.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}). It isn&apos;t refunded.
              </p>
              <div className="flex items-center gap-2">
                <span className="min-w-0 grow truncate font-mono text-[11px] text-paper">{treasury}</span>
                <CopyButton value={treasury} />
              </div>
              <div className="flex items-center gap-2">
                <span className="grow font-mono text-sm font-extrabold tracking-[0.12em] text-paper">MEMO {w.memo}</span>
                <CopyButton value={w.memo} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={pending}
                  onClick={() => start(async () => setMsg(await verifyWallet(w.id)))}
                  className={`${small} bg-paper text-on-paper`}
                >
                  {pending ? "Checking…" : "I've sent it · verify"}
                </button>
                {sep7 && (
                  <a href={sep7} className={`${small} flex items-center gap-1 border border-white/16 text-paper`}>
                    Open in wallet <ExternalIcon />
                  </a>
                )}
                <button disabled={pending} onClick={() => start(() => renewProof(w.id))} className={`${small} text-lilac`}>
                  New code
                </button>
              </div>
            </>
          ) : (
            <p>Wallet verification opens soon. Your wallet is saved and you&apos;ll be able to verify it here.</p>
          )}
          {dev && (
            <button
              disabled={pending}
              onClick={() => start(async () => setMsg(await devVerifyWallet(w.id)))}
              className={`${small} self-start border border-dashed border-ember/50 text-ember`}
            >
              Mark verified (local dev only)
            </button>
          )}
          {(msg.error || msg.ok) && <p className={msg.error ? "font-semibold text-red-300" : "font-semibold text-lilac-soft"}>{msg.error ?? msg.ok}</p>}
        </div>
      )}
    </li>
  );
}

export function EmailChange() {
  return (
    <ActionForm
      action={async (prev, f) => (f.get("code") !== null ? confirmEmailChange(prev, f) : requestEmailChange(prev, f))}
    >
      {(s) =>
        s?.values?.step === "code" ? (
          <>
            <input type="hidden" name="email" value={s.values.email} />
            <Field label={`Code sent to ${s.values.email}`} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
            <Submit>Confirm new email</Submit>
          </>
        ) : (
          <>
            <Field label="New email" name="email" type="email" autoComplete="email" defaultValue={s?.values?.email} required />
            <Field label="Your password" name="password" type="password" autoComplete="current-password" required />
            <Submit variant="ghost">Send code to new email</Submit>
          </>
        )
      }
    </ActionForm>
  );
}

export function ProfileForm({ name, tag }: { name: string; tag: string }) {
  return (
    <ActionForm action={updateProfile}>
      {(s) => (
        <>
          <Field label="Name" name="name" autoComplete="name" defaultValue={s?.values?.name ?? name} required />
          <Field label="Username" name="tag" autoComplete="username" defaultValue={s?.values?.tag ?? tag} hint="Shown as @username on your card." required />
          <Submit variant="ghost">Save profile</Submit>
        </>
      )}
    </ActionForm>
  );
}

export function AddWalletForm() {
  return (
    <ActionForm action={addWallet}>
      {(s) => (
        <>
          <Field label="Add a wallet" name="address" placeholder="G…" autoCapitalize="characters" autoComplete="off" spellCheck={false} defaultValue={s?.values?.address} required />
          <Submit variant="ghost">Add wallet</Submit>
        </>
      )}
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePassword}>
      {() => (
        <>
          <Field label="Current password" name="current" type="password" autoComplete="current-password" required />
          <Field label="New password" name="next" type="password" autoComplete="new-password" hint="At least 8 characters." required />
          <Field label="Repeat new password" name="confirm" type="password" autoComplete="new-password" required />
          <Submit variant="ghost">Change password</Submit>
        </>
      )}
    </ActionForm>
  );
}

import { XlmMark } from "../ui/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-x-hidden px-5 pt-[max(48px,env(safe-area-inset-top))] pb-10">
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[560px] -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(123,63,255,0.5) 0%, rgba(74,28,160,0.22) 35%, rgba(7,6,11,0) 68%)" }}
      />
      <div className="relative mb-8 flex flex-col items-center gap-3">
        <span
          className="flex size-16 items-center justify-center rounded-full text-[#120c22]"
          style={{
            background: "radial-gradient(circle at 38% 32%, #ffffff 0%, #e7e2f7 18%, #9d8fd6 46%, #3d2585 78%, #1b1036 100%)",
            boxShadow: "0 0 40px rgba(160,107,255,0.6)",
          }}
        >
          <XlmMark size={30} />
        </span>
        <span className="chrome font-display text-lg font-extrabold tracking-[0.08em]">XLM TREASURY</span>
      </div>
      <main className="relative flex flex-col gap-5">{children}</main>
    </div>
  );
}

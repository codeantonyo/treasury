/** Profile photo (small JPEG data URL) or the first letter of the name. */
export default function Avatar({ src, name, size = 40, className = "" }: { src: string | null; name: string; size?: number; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- tiny inline data URL, nothing to optimise
    <img src={src} alt="" width={size} height={size} className={`shrink-0 rounded-full object-cover ${className}`} style={{ width: size, height: size }} />
  ) : (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-linear-135 from-[#8f8aa6] to-paper font-extrabold text-[#1a1426] ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[18px] bg-white/6 ${className}`} />;
}

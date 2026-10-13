export function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-center">
      <h1 className="chrome font-display text-[min(28px,7.18vw)] leading-tight font-extrabold">{title}</h1>
      <p className="text-sm text-muted-2">{sub}</p>
    </div>
  );
}

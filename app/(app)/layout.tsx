import TabBar from "../ui/tab-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Phone-width column; on desktop the app sits centered. */}
      <div className="relative mx-auto min-h-dvh w-full max-w-[430px] overflow-x-hidden pb-[calc(100px+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <TabBar />
    </>
  );
}

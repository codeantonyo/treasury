"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";

/**
 * Bottom sheet. Slides up on the iOS drawer curve; drag the handle down (or flick) to dismiss,
 * tap the backdrop or press Escape to close. Page scroll is locked while open.
 */
export default function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const drag = useDragControls();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-[430px] flex-col rounded-t-[28px] border-t border-white/10 bg-[#110d1c] pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] outline-none"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%", transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] } }}
            transition={{ duration: 0.36, ease: [0.32, 0.72, 0, 1] }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.7 }}
            onDragEnd={(_, i) => (i.offset.y > 110 || i.velocity.y > 450) && onClose()}
          >
            <div className="flex cursor-grab touch-none flex-col items-center px-5 pt-2.5 pb-1 active:cursor-grabbing" onPointerDown={(e) => drag.start(e)}>
              <span className="h-1.5 w-10 rounded-full bg-white/20" />
              <h2 className="mt-3 self-start font-display text-xl font-extrabold">{title}</h2>
            </div>
            <div className="overflow-y-auto overscroll-contain px-5 pt-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

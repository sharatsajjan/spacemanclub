"use client";

import { useMemo } from "react";
import { mulberry32 } from "@/lib/rng";

/**
 * The burst of paper that goes off when a level is finished.
 *
 * Scraps are thrown out from the middle, spin as they go, and drop away as
 * they fade — paper rather than sparks, to match a board that reads as ink
 * on a page. The whole thing is decoration: it sits over the screen without
 * taking any taps, and it is skipped outright for anyone who has asked for
 * reduced motion.
 */

const SCRAP_COUNT = 28;
/** How far a scrap is thrown, as a fraction of the shorter screen edge. */
const MIN_REACH = 0.22;
const MAX_REACH = 0.62;

interface PaperPopProps {
  /** Seeds the scatter, so the same level always pops the same way. */
  seed: number;
}

export function PaperPop({ seed }: PaperPopProps) {
  const scraps = useMemo(() => {
    const rand = mulberry32(seed || 1);
    return Array.from({ length: SCRAP_COUNT }, (_, i) => {
      // Spread around the full circle with a little jitter, so the burst is
      // even without looking mechanical.
      const angle = ((i + rand() * 0.8) / SCRAP_COUNT) * Math.PI * 2;
      const reach = MIN_REACH + rand() * (MAX_REACH - MIN_REACH);
      return {
        id: i,
        dx: Math.cos(angle) * reach,
        dy: Math.sin(angle) * reach,
        spin: (rand() < 0.5 ? -1 : 1) * (140 + rand() * 520),
        delay: rand() * 120,
        duration: 900 + rand() * 500,
        width: 5 + rand() * 6,
        height: 7 + rand() * 9,
        radius: rand() < 0.35 ? "50%" : "1px",
        color: `var(--piece-${i % 6})`,
      };
    });
  }, [seed]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 overflow-hidden motion-reduce:hidden"
      aria-hidden
    >
      {scraps.map((scrap) => (
        <span
          key={scrap.id}
          className="paper-scrap"
          style={
            {
              background: scrap.color,
              width: `${scrap.width}px`,
              height: `${scrap.height}px`,
              borderRadius: scrap.radius,
              animationDelay: `${scrap.delay}ms`,
              animationDuration: `${scrap.duration}ms`,
              "--scrap-dx": `${scrap.dx * 100}vmin`,
              "--scrap-dy": `${scrap.dy * 100}vmin`,
              "--scrap-spin": `${scrap.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

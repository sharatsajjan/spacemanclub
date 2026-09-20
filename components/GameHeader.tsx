import Link from "next/link";
import { ReactNode } from "react";

export function GameHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-panel2 text-white/70 hover:text-white hover:bg-panel2/70 transition-colors"
          aria-label="Back to home"
        >
          ←
        </Link>
        <div>
          <h1 className="font-display text-lg font-bold text-white leading-tight">{title}</h1>
          {subtitle && <p className="text-xs text-white/50">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

import Link from "next/link";
import { ReactNode } from "react";

interface ModeCardProps {
  href: string;
  title: string;
  tagline: string;
  icon: ReactNode;
  accentClass: string;
  stat: { label: string; value: string };
  cta: string;
}

export function ModeCard({ href, title, tagline, icon, accentClass, stat, cta }: ModeCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col justify-between rounded-2xl bg-panel ring-1 ring-white/10 p-5 hover:ring-white/25 transition-all hover:-translate-y-0.5"
    >
      <div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${accentClass}`}>
          {icon}
        </div>
        <h3 className="font-display text-xl font-bold text-white mb-1">{title}</h3>
        <p className="text-sm text-white/60 leading-snug">{tagline}</p>
      </div>
      <div className="mt-5 flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/40">{stat.label}</div>
          <div className="font-display font-bold text-white">{stat.value}</div>
        </div>
        <span className="text-sm font-semibold text-accent2 group-hover:translate-x-0.5 transition-transform">
          {cta} →
        </span>
      </div>
    </Link>
  );
}

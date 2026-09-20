import { Direction } from "@/lib/types";

const rotation: Record<Direction, number> = {
  up: 0,
  right: 90,
  down: 180,
  left: 270,
};

export function ArrowIcon({ direction, className = "" }: { direction: Direction; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={{ transform: `rotate(${rotation[direction]}deg)` }}
      fill="none"
    >
      <path
        d="M12 3L20 15H14V21H10V15H4L12 3Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function FlameIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2c1 3-3 4-3 8a4 4 0 0 0 8 0c1.5 1 2 3 2 4.5A7 7 0 0 1 5 14.5C5 9 9 6 12 2Z" />
    </svg>
  );
}

export function TrophyIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M6 3h12v2h2a3 3 0 0 1-3 3h-.5A6.5 6.5 0 0 1 13 13.9V17h3v2H8v-2h3v-3.1A6.5 6.5 0 0 1 7.5 8H7a3 3 0 0 1-3-3h2V3Zm0 4H5a1 1 0 0 0 1 1h.09A6.6 6.6 0 0 1 6 7Zm12 0a6.6 6.6 0 0 1-.09 1H18a1 1 0 0 0 1-1h-1Z" />
    </svg>
  );
}

export function StarIcon({ className = "", filled = true }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.5}>
      <path d="M12 2.5l2.9 6.2 6.6.7-5 4.6 1.4 6.6L12 17.3l-5.9 3.3 1.4-6.6-5-4.6 6.6-.7L12 2.5Z" />
    </svg>
  );
}

export function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BoltIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}

export function InfinityIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M7 9a4 4 0 1 0 0 6c2-1 3.5-3 5-5s3-4 5-4a4 4 0 1 1 0 6c-2 0-3.5-2-5-4S9 4 7 4a4 4 0 0 0-4 4" />
    </svg>
  );
}

export function LightbulbIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9v.2h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HeartIcon({ className = "", filled = true }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 1.8}>
      <path d="M12 20.5S3.5 15.2 3.5 9.3A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 8.5 2.9c0 5.9-8.5 11.2-8.5 11.2Z" />
    </svg>
  );
}

export function UndoIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M9 8 4 12l5 4M4 12h11a5 5 0 0 1 0 10h-1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

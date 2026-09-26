"use client";

import { ReactNode } from "react";
import { LightbulbIcon, UndoIcon, ZoomIcon } from "./icons";

interface BoosterBarProps {
  onUndo: () => void;
  undosLeft: number;
  canUndo: boolean;
  onHint: () => void;
  hintsLeft: number;
  onZoom: () => void;
  zoom: number;
}

/**
 * The three boosters sit along the bottom rather than in the header: they're
 * the only controls a player touches mid-level besides the board itself, and
 * the bottom of the screen is the part a thumb reaches without shifting grip.
 */
export function BoosterBar({ onUndo, undosLeft, canUndo, onHint, hintsLeft, onZoom, zoom }: BoosterBarProps) {
  return (
    <div data-testid="booster-bar" className="grid grid-cols-3 gap-2 pt-3 pb-1">
      <BoosterButton icon={<UndoIcon className="w-5 h-5" />} label="Undo" badge={String(undosLeft)} onClick={onUndo} disabled={!canUndo} />
      <BoosterButton
        icon={<LightbulbIcon className="w-5 h-5" />}
        label="Hint"
        badge={String(hintsLeft)}
        onClick={onHint}
        disabled={hintsLeft <= 0}
      />
      <BoosterButton
        icon={<ZoomIcon className="w-5 h-5" />}
        label="Zoom"
        badge={zoom === 1 ? undefined : `${zoom}x`}
        onClick={onZoom}
        active={zoom !== 1}
      />
    </div>
  );
}

function BoosterButton({
  icon,
  label,
  badge,
  onClick,
  disabled = false,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  badge?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={badge ? `${label}, ${badge} available` : label}
      className="relative flex flex-col items-center justify-center gap-1 rounded-2xl py-2.5 font-bold text-[11px] disabled:opacity-35 bg-chip text-accent"
      style={active ? { outline: "2px solid var(--accent)", outlineOffset: "-2px" } : undefined}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span
          className="absolute top-1.5 right-2 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center tabular-nums"
          style={{ background: "var(--accent)", color: "var(--btn-text)" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

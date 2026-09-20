"use client";

import { useMemo } from "react";
import { Coord, Puzzle } from "@/lib/types";
import { legalNextCells, sameCoord } from "@/lib/rules";
import { ArrowIcon } from "./icons";

interface ArrowGridProps {
  puzzle: Puzzle;
  path: Coord[];
  onCellSelect: (c: Coord) => void;
  hintCell?: Coord | null;
  disabled?: boolean;
}

function indexInPath(path: Coord[], c: Coord): number {
  return path.findIndex((p) => sameCoord(p, c));
}

export function ArrowGrid({ puzzle, path, onCellSelect, hintCell, disabled }: ArrowGridProps) {
  const { size } = puzzle;
  const cellPct = 100 / size;
  const strokePct = cellPct * 0.32;

  const legalNext = useMemo(
    () => (disabled ? [] : legalNextCells(puzzle, path)),
    [puzzle, path, disabled]
  );

  const connectors = useMemo(() => {
    const segments: { key: string; style: React.CSSProperties }[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const ax = (a.col + 0.5) * cellPct;
      const ay = (a.row + 0.5) * cellPct;
      const bx = (b.col + 0.5) * cellPct;
      const by = (b.row + 0.5) * cellPct;
      const style: React.CSSProperties =
        a.row === b.row
          ? {
              left: `${Math.min(ax, bx)}%`,
              top: `${ay - strokePct / 2}%`,
              width: `${Math.abs(bx - ax)}%`,
              height: `${strokePct}%`,
            }
          : {
              top: `${Math.min(ay, by)}%`,
              left: `${ax - strokePct / 2}%`,
              height: `${Math.abs(by - ay)}%`,
              width: `${strokePct}%`,
            };
      segments.push({ key: `${a.row}-${a.col}-${b.row}-${b.col}`, style });
    }
    return segments;
  }, [path, cellPct, strokePct]);

  return (
    <div
      className="relative w-full select-none touch-none"
      style={{ aspectRatio: "1 / 1" }}
    >
      <div
        className="absolute inset-0 grid rounded-2xl overflow-hidden bg-panel/60 ring-1 ring-white/5"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
        }}
      >
        {puzzle.cells.flatMap((row) =>
          row.map((cell) => {
            const coord: Coord = { row: cell.row, col: cell.col };
            const pIndex = indexInPath(path, coord);
            const isVisited = pIndex >= 0;
            const isHead = pIndex === path.length - 1 && path.length > 0;
            const isStart = cell.type === "start";
            const isEnd = cell.type === "end";
            const isBlocked = cell.type === "blocked";
            const isLegal = !isVisited && legalNext.some((n) => sameCoord(n, coord));
            const isHint = !!hintCell && sameCoord(hintCell, coord);

            return (
              <button
                key={`${cell.row}-${cell.col}`}
                type="button"
                disabled={disabled || isBlocked || (!isLegal && !isVisited)}
                onClick={() => onCellSelect(coord)}
                data-row={cell.row}
                data-col={cell.col}
                data-type={cell.type}
                data-visited={isVisited}
                className={[
                  "relative m-[2.5%] rounded-md flex items-center justify-center transition-colors duration-150",
                  isBlocked
                    ? "bg-ink/70 cursor-not-allowed"
                    : isVisited
                    ? "bg-accent/25"
                    : isLegal
                    ? "bg-panel2 hover:bg-panel2/80 cursor-pointer"
                    : "bg-panel2/50 cursor-default",
                  isStart ? "ring-2 ring-accent2" : "",
                  isEnd ? "ring-2 ring-warn" : "",
                  isHint ? "ring-2 ring-accent2 animate-pulseGlow" : "",
                ].join(" ")}
                aria-label={
                  isStart ? "Start" : isEnd ? "End" : isBlocked ? "Blocked cell" : `Cell ${cell.row},${cell.col}`
                }
              >
                {isLegal && !isVisited && (
                  <span className="absolute inset-0 rounded-md ring-1 ring-accent2/50 animate-pulseGlow" />
                )}
                {cell.forcedDir && (
                  <ArrowIcon
                    direction={cell.forcedDir}
                    className={`w-1/2 h-1/2 ${isVisited ? "text-white" : "text-accent2/80"}`}
                  />
                )}
                {isStart && !cell.forcedDir && (
                  <span className="text-[10px] sm:text-xs font-display font-bold text-accent2 tracking-wide">
                    START
                  </span>
                )}
                {isEnd && (
                  <span className="text-[10px] sm:text-xs font-display font-bold text-warn tracking-wide">
                    END
                  </span>
                )}
                {isHead && !isEnd && (
                  <span className="absolute w-2.5 h-2.5 rounded-full bg-accent2 animate-pop" />
                )}
              </button>
            );
          })
        )}
      </div>
      <div className="absolute inset-0 pointer-events-none">
        {connectors.map((seg) => (
          <div
            key={seg.key}
            className="absolute bg-accent2/70 rounded-full animate-pop"
            style={seg.style}
          />
        ))}
      </div>
    </div>
  );
}

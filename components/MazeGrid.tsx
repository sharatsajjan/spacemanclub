"use client";

import { Coord, Puzzle } from "@/lib/types";
import { sameCoord } from "@/lib/rules";
import { ArrowIcon } from "./icons";

interface MazeGridProps {
  puzzle: Puzzle;
  /** Cells traced so far, in order from the start. */
  trail: Coord[];
}

function indexInTrail(trail: Coord[], c: Coord): number {
  return trail.findIndex((p) => sameCoord(p, c));
}

export function MazeGrid({ puzzle, trail }: MazeGridProps) {
  const { size } = puzzle;

  return (
    <div
      className="relative w-full select-none touch-none rounded-lg overflow-hidden"
      style={{ aspectRatio: "1 / 1", backgroundColor: "#f2e8d3" }}
    >
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gridTemplateRows: `repeat(${size}, 1fr)`,
        }}
      >
        {puzzle.cells.flatMap((row) =>
          row.map((cell) => {
            const coord: Coord = { row: cell.row, col: cell.col };
            const traced = indexInTrail(trail, coord) >= 0;
            const isStart = cell.type === "start";
            const isEnd = cell.type === "end";

            return (
              <div
                key={`${cell.row}-${cell.col}`}
                data-row={cell.row}
                data-col={cell.col}
                data-type={cell.type}
                data-traced={traced}
                className="relative flex items-center justify-center"
              >
                {traced && <div className="absolute inset-0 bg-[#e0a94a]/45" />}
                {cell.forcedDir && (
                  <ArrowIcon
                    direction={cell.forcedDir}
                    className={`relative w-[55%] h-[55%] ${traced ? "text-[#8a5a1f]" : "text-[#6b4a35]"}`}
                  />
                )}
                {isStart && (
                  <span className="absolute w-[38%] h-[38%] rounded-full bg-[#3fa9e0] ring-2 ring-white/70" />
                )}
                {isEnd && (
                  <span className="absolute w-[42%] h-[42%] rounded-sm rotate-45 bg-[#f2c744] ring-2 ring-white/70" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

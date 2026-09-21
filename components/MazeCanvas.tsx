"use client";

import { Coord, Puzzle } from "@/lib/types";
import { sameCoord } from "@/lib/rules";
import { ArrowIcon } from "./icons";

interface MazeCanvasProps {
  puzzle: Puzzle;
  present: boolean[][];
  flashCell: Coord | null;
  disabled?: boolean;
  onTap: (row: number, col: number) => void;
}

export function MazeCanvas({ puzzle, present, flashCell, disabled, onTap }: MazeCanvasProps) {
  const { cols, rows, directions } = puzzle;

  return (
    <div
      className="relative w-full select-none rounded-lg overflow-hidden bg-maze grid"
      style={{
        aspectRatio: `${cols} / ${rows}`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {directions.flatMap((row, r) =>
        row.map((dir, c) => {
          const isPresent = present[r][c];
          const isFlashing = !!flashCell && sameCoord(flashCell, { row: r, col: c });
          return (
            <button
              key={`${r}-${c}`}
              type="button"
              disabled={disabled || !isPresent}
              onClick={() => onTap(r, c)}
              aria-label={isPresent ? `Piece at row ${r + 1}, column ${c + 1}, pointing ${dir}` : "Cleared"}
              data-row={r}
              data-col={c}
              data-dir={dir}
              data-present={isPresent}
              className="relative flex items-center justify-center transition-opacity duration-150"
              style={{ opacity: isPresent ? 1 : 0 }}
            >
              {isFlashing && <span className="absolute inset-[6%] rounded-sm bg-danger/50" />}
              <ArrowIcon
                direction={dir}
                className="relative w-full h-full"
                style={{ color: isFlashing ? "var(--danger)" : "var(--line)" }}
              />
            </button>
          );
        })
      )}
    </div>
  );
}

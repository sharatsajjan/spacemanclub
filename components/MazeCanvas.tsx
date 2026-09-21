"use client";

import { Direction, Piece, Puzzle } from "@/lib/types";
import { delta } from "@/lib/rules";

interface MazeCanvasProps {
  puzzle: Puzzle;
  present: boolean[][];
  flashPieceId: number | null;
  disabled?: boolean;
  onTap: (row: number, col: number) => void;
}

const ARROW_ROTATION: Record<Direction, number> = { up: 0, right: 90, down: 180, left: 270 };
const ARROW_PATH = "M0 -0.46 L0.23 -0.1 L0.07 -0.1 L0.07 0.42 L-0.07 0.42 L-0.07 -0.1 L-0.23 -0.1 Z";
const ARROW_HALO_PATH = "M0 -0.55 L0.32 -0.02 L0.12 -0.02 L0.12 0.51 L-0.12 0.51 L-0.12 -0.02 L-0.32 -0.02 Z";

/**
 * Where the arrowhead is drawn: whichever of the piece's two true path ends
 * (its first or last cell — every cell in between always has exactly 2
 * neighbors within the piece, since it's a simple random-walk path) is
 * further along the travel direction. Scanning every cell in the piece
 * instead of just these two endpoints can land the arrowhead on a middle
 * cell, making the piece look like it wrongly branches mid-line.
 */
function headCellOf(piece: Piece) {
  const d = delta(piece.direction);
  const first = piece.cells[0];
  const last = piece.cells[piece.cells.length - 1];
  const firstScore = first.row * d.row + first.col * d.col;
  const lastScore = last.row * d.row + last.col * d.col;
  return lastScore >= firstScore ? last : first;
}

export function MazeCanvas({ puzzle, present, flashPieceId, disabled, onTap }: MazeCanvasProps) {
  const { cols, rows, pieces } = puzzle;

  return (
    <div
      className="relative w-full select-none rounded-lg overflow-hidden bg-maze grid"
      data-testid="maze-canvas"
      data-pieces={JSON.stringify(pieces)}
      style={{
        aspectRatio: `${cols} / ${rows}`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {Array.from({ length: rows }).flatMap((_, r) =>
        Array.from({ length: cols }).map((__, c) => {
          const isPresent = present[r][c];
          return (
            <button
              key={`${r}-${c}`}
              type="button"
              disabled={disabled || !isPresent}
              onClick={() => onTap(r, c)}
              aria-label={isPresent ? `Piece at row ${r + 1}, column ${c + 1}` : "Cleared"}
              data-row={r}
              data-col={c}
              data-present={isPresent}
              className="relative"
            />
          );
        })
      )}

      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox={`0 0 ${cols} ${rows}`}
        preserveAspectRatio="none"
      >
        {/* Pass 1: every piece's background-colored halo, drawn first so no
            halo can ever paint over another piece's already-drawn line —
            this is what keeps touching pieces visually distinct as separate
            tappable units without resorting to per-piece color. */}
        {pieces.map((piece) => {
          const head = headCellOf(piece);
          const isPresent = present[head.row][head.col];
          const points = piece.cells.map((cell) => `${cell.col + 0.5},${cell.row + 0.5}`).join(" ");
          const rotation = ARROW_ROTATION[piece.direction];
          const dots = piece.cells.filter((cell) => cell.row !== head.row || cell.col !== head.col);

          return (
            <g key={piece.id} style={{ opacity: isPresent ? 1 : 0, transition: "opacity 150ms" }}>
              <polyline points={points} fill="none" stroke="var(--maze)" strokeWidth={0.3} strokeLinecap="round" strokeLinejoin="round" />
              {dots.map((cell, i) => (
                <circle key={i} cx={cell.col + 0.5} cy={cell.row + 0.5} r={0.21} fill="var(--maze)" />
              ))}
              <g transform={`translate(${head.col + 0.5} ${head.row + 0.5}) rotate(${rotation})`}>
                <path d={ARROW_HALO_PATH} fill="var(--maze)" />
              </g>
            </g>
          );
        })}

        {/* Pass 2: every piece's actual line, dots and arrowhead, on top of all halos. */}
        {pieces.map((piece) => {
          const head = headCellOf(piece);
          const isPresent = present[head.row][head.col];
          const isFlashing = flashPieceId === piece.id;
          const color = isFlashing ? "var(--danger)" : "var(--line)";
          const points = piece.cells.map((cell) => `${cell.col + 0.5},${cell.row + 0.5}`).join(" ");
          const rotation = ARROW_ROTATION[piece.direction];
          const dots = piece.cells.filter((cell) => cell.row !== head.row || cell.col !== head.col);

          return (
            <g key={piece.id} style={{ opacity: isPresent ? 1 : 0, transition: "opacity 150ms" }}>
              <polyline points={points} fill="none" stroke={color} strokeWidth={0.14} strokeLinecap="round" strokeLinejoin="round" />
              {dots.map((cell, i) => (
                <circle key={i} cx={cell.col + 0.5} cy={cell.row + 0.5} r={0.13} fill={color} />
              ))}
              <g transform={`translate(${head.col + 0.5} ${head.row + 0.5}) rotate(${rotation})`}>
                <path d={ARROW_PATH} fill={color} />
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

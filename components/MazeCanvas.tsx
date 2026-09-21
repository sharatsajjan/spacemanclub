"use client";

import { Coord, Direction, Piece, Puzzle } from "@/lib/types";
import { delta } from "@/lib/rules";

interface MazeCanvasProps {
  puzzle: Puzzle;
  present: boolean[][];
  flashPieceId: number | null;
  disabled?: boolean;
  onTap: (row: number, col: number) => void;
}

const ARROW_ROTATION: Record<Direction, number> = { up: 0, right: 90, down: 180, left: 270 };
/** Open chevron (not a filled triangle) so it reads as the line's own tip, not a separate icon. */
const CHEVRON_PATH = "M-0.22 -0.06 L0 -0.42 L0.22 -0.06";
const CORNER_RADIUS = 0.22;

function normalize(dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** A piece's line as an SVG path with smoothly rounded corners instead of sharp right angles. */
function buildRoundedPath(cells: Coord[]): string {
  const pts = cells.map((c) => ({ x: c.col + 0.5, y: c.row + 0.5 }));
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0].x} ${pts[0].y} L${pts[1].x} ${pts[1].y}`;

  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const toPrev = normalize(prev.x - cur.x, prev.y - cur.y);
    const toNext = normalize(next.x - cur.x, next.y - cur.y);
    const a = { x: cur.x + toPrev.x * CORNER_RADIUS, y: cur.y + toPrev.y * CORNER_RADIUS };
    const b = { x: cur.x + toNext.x * CORNER_RADIUS, y: cur.y + toNext.y * CORNER_RADIUS };
    d += ` L${a.x} ${a.y} Q${cur.x} ${cur.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last.x} ${last.y}`;
  return d;
}

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
        {/* Every piece's line, dots and arrowhead. No background halo/gap between
            pieces — now that each arrow always continues its own line's real
            direction, adjacent pieces can flow together seamlessly like the
            reference, without reading as one wrongly-connected line. */}
        {pieces.map((piece) => {
          const head = headCellOf(piece);
          const isPresent = present[head.row][head.col];
          const isFlashing = flashPieceId === piece.id;
          const color = isFlashing ? "var(--danger)" : "var(--line)";
          const path = buildRoundedPath(piece.cells);
          const rotation = ARROW_ROTATION[piece.direction];
          const dots = piece.cells.filter((cell) => cell.row !== head.row || cell.col !== head.col);

          return (
            <g key={piece.id} style={{ opacity: isPresent ? 1 : 0, transition: "opacity 150ms" }}>
              {path && <path d={path} fill="none" stroke={color} strokeWidth={0.14} strokeLinecap="round" strokeLinejoin="round" />}
              {dots.map((cell, i) => (
                <circle key={i} cx={cell.col + 0.5} cy={cell.row + 0.5} r={0.13} fill={color} />
              ))}
              <g transform={`translate(${head.col + 0.5} ${head.row + 0.5}) rotate(${rotation})`}>
                <path d={CHEVRON_PATH} fill="none" stroke={color} strokeWidth={0.14} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

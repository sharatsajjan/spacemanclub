"use client";

import type { CSSProperties } from "react";
import { Coord, Direction, Piece, Puzzle } from "@/lib/types";
import { delta } from "@/lib/rules";

interface MazeCanvasProps {
  puzzle: Puzzle;
  present: boolean[][];
  exitingPieces: Map<number, Direction>;
  flashPieceId: number | null;
  hintPieceId: number | null;
  disabled?: boolean;
  onTap: (row: number, col: number) => void;
}

/** Must stay in sync with EXIT_ANIMATION_MS in useMazeGame.ts. */
const EXIT_TRANSITION = "transform 380ms cubic-bezier(0.4, 0, 1, 1)";

const ARROW_ROTATION: Record<Direction, number> = { up: 0, right: 90, down: 180, left: 270 };
/** Solid filled arrow cap. Its apex reaches almost to the cell's true outer
 * edge (matching the tail-extension in buildPiecePath below) and its base
 * width roughly matches LINE_WIDTH so it blends into the pipe with no neck,
 * sitting exactly at the cell center so it meets the line's own end with no
 * gap or visible seam. */
const ARROW_PATH = "M0 -0.46 L0.4 0 L-0.4 0 Z";
const ARROW_HALO_PATH = "M0 -0.52 L0.46 0.03 L-0.46 0.03 Z";
/**
 * Pieces fill almost the entire cell so the whole board reads as one
 * tightly-packed maze (the puzzle is already a full tiling — every cell
 * belongs to some piece — this is what makes that visible). Only a hairline
 * of background peeks through between two different pieces' pipes, which
 * doubles as the border between them.
 */
const LINE_WIDTH = 0.88;
const HALO_WIDTH = 0.98;
/** How far past a cell's center the piece's TAIL end (the non-arrow end)
 * extends, so a butt-capped stroke reaches that cell's true outer edge
 * instead of stopping half a cell short at the center. */
const TAIL_EXTEND = 0.5;
/** Fallback fill for the rare 1-cell piece (no line to stroke at all). */
const SINGLE_CELL_FILL = 0.92;
const SINGLE_CELL_HALO_FILL = 1.0;
/** Fixed amber/gold, independent of theme — same role as the always-red danger flash. */
const HINT_COLOR = "#e0983d";

function normalize(dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function sameCell(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * A piece's line as a straight-segment SVG path through its cells' centers
 * (bends are left to `strokeLinejoin="round"`, which — at this stroke width
 * — reads as a properly rounded pipe elbow filling most of the bend cell).
 * The end AWAY from the arrowhead is extended by TAIL_EXTEND so a
 * butt-capped stroke reaches that cell's true outer edge rather than
 * stopping at its center; the head end stays at the center, since the
 * arrowhead triangle drawn on top covers the remaining reach to the edge.
 */
function buildPiecePath(piece: Piece, headCell: Coord): string {
  const pts = piece.cells.map((c) => ({ x: c.col + 0.5, y: c.row + 0.5 }));
  if (pts.length < 2) return "";

  const headIsFirst = sameCell(piece.cells[0], headCell);
  const tailIdx = headIsFirst ? pts.length - 1 : 0;
  const neighborIdx = headIsFirst ? pts.length - 2 : 1;
  const dir = normalize(pts[tailIdx].x - pts[neighborIdx].x, pts[tailIdx].y - pts[neighborIdx].y);
  pts[tailIdx] = { x: pts[tailIdx].x + dir.x * TAIL_EXTEND, y: pts[tailIdx].y + dir.y * TAIL_EXTEND };

  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
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

/** Slide offset in viewBox units, far enough to clear the board on either axis. */
function slideTransform(cols: number, rows: number, exitDir: Direction): string {
  const d = delta(exitDir);
  const tx = d.col * (cols + 2);
  const ty = d.row * (rows + 2);
  return `translate(${tx} ${ty})`;
}

const EXIT_TRANSITION_STYLE: CSSProperties = { transition: EXIT_TRANSITION };

export function MazeCanvas({ puzzle, present, exitingPieces, flashPieceId, hintPieceId, disabled, onTap }: MazeCanvasProps) {
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
            halo can ever paint over another piece's already-drawn line. Two
            pieces whose lines touch or run close together must never read as
            one continuous shape — a player has to be able to tell, at a
            glance, exactly which cells belong to which independent,
            separately-tappable piece. */}
        {pieces.map((piece) => {
          const head = headCellOf(piece);
          const isPresent = present[head.row][head.col];
          const exitDir = exitingPieces.get(piece.id);
          if (!isPresent && !exitDir) return null;
          const path = buildPiecePath(piece, head);
          const rotation = ARROW_ROTATION[piece.direction];

          return (
            <g
              key={piece.id}
              transform={exitDir ? slideTransform(cols, rows, exitDir) : undefined}
              style={exitDir ? EXIT_TRANSITION_STYLE : { opacity: isPresent ? 1 : 0, transition: "opacity 150ms" }}
            >
              {path ? (
                <path d={path} fill="none" stroke="var(--maze)" strokeWidth={HALO_WIDTH} strokeLinecap="butt" strokeLinejoin="round" />
              ) : (
                <rect
                  x={head.col + (1 - SINGLE_CELL_HALO_FILL) / 2}
                  y={head.row + (1 - SINGLE_CELL_HALO_FILL) / 2}
                  width={SINGLE_CELL_HALO_FILL}
                  height={SINGLE_CELL_HALO_FILL}
                  rx={0.14}
                  fill="var(--maze)"
                />
              )}
              <g transform={`translate(${head.col + 0.5} ${head.row + 0.5}) rotate(${rotation})`}>
                <path d={ARROW_HALO_PATH} fill="var(--maze)" />
              </g>
            </g>
          );
        })}

        {/* Pass 2: every piece's actual thick pipe-like line and solid arrowhead.
            The hinted piece (from tapping Hint) pulses in amber/gold, independent
            of theme, so the player can see exactly which line to tap next. */}
        {pieces.map((piece) => {
          const head = headCellOf(piece);
          const isPresent = present[head.row][head.col];
          const exitDir = exitingPieces.get(piece.id);
          if (!isPresent && !exitDir) return null;
          const isFlashing = flashPieceId === piece.id;
          const isHinted = hintPieceId === piece.id;
          const color = isFlashing ? "var(--danger)" : isHinted ? HINT_COLOR : "var(--line)";
          const path = buildPiecePath(piece, head);
          const rotation = ARROW_ROTATION[piece.direction];

          return (
            <g
              key={piece.id}
              className={isHinted ? "animate-pulse" : undefined}
              transform={exitDir ? slideTransform(cols, rows, exitDir) : undefined}
              style={exitDir ? EXIT_TRANSITION_STYLE : { opacity: isPresent ? 1 : 0, transition: "opacity 150ms" }}
            >
              {path ? (
                <path d={path} fill="none" stroke={color} strokeWidth={LINE_WIDTH} strokeLinecap="butt" strokeLinejoin="round" />
              ) : (
                <rect
                  x={head.col + (1 - SINGLE_CELL_FILL) / 2}
                  y={head.row + (1 - SINGLE_CELL_FILL) / 2}
                  width={SINGLE_CELL_FILL}
                  height={SINGLE_CELL_FILL}
                  rx={0.12}
                  fill={color}
                />
              )}
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

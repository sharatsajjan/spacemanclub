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
/** Solid filled arrow cap, flared wider than the line so it reads as a clear
 * arrowhead, with its base sitting exactly at the cell center so it meets
 * the line's own (round-capped) end with no gap or visible seam. */
const ARROW_PATH = "M0 -0.28 L0.16 0 L-0.16 0 Z";
const ARROW_HALO_PATH = "M0 -0.34 L0.22 0.03 L-0.22 0.03 Z";
const LINE_WIDTH = 0.2;
const HALO_WIDTH = 0.32;
const CORNER_RADIUS = 0.18;
/** Fixed amber/gold, independent of theme — same role as the always-red danger flash. */
const HINT_COLOR = "#e0983d";

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
          const path = buildRoundedPath(piece.cells);
          const rotation = ARROW_ROTATION[piece.direction];

          return (
            <g
              key={piece.id}
              transform={exitDir ? slideTransform(cols, rows, exitDir) : undefined}
              style={exitDir ? EXIT_TRANSITION_STYLE : { opacity: isPresent ? 1 : 0, transition: "opacity 150ms" }}
            >
              {path && <path d={path} fill="none" stroke="var(--maze)" strokeWidth={HALO_WIDTH} strokeLinecap="round" strokeLinejoin="round" />}
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
          const path = buildRoundedPath(piece.cells);
          const rotation = ARROW_ROTATION[piece.direction];

          return (
            <g
              key={piece.id}
              className={isHinted ? "animate-pulse" : undefined}
              transform={exitDir ? slideTransform(cols, rows, exitDir) : undefined}
              style={exitDir ? EXIT_TRANSITION_STYLE : { opacity: isPresent ? 1 : 0, transition: "opacity 150ms" }}
            >
              {path && <path d={path} fill="none" stroke={color} strokeWidth={LINE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />}
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

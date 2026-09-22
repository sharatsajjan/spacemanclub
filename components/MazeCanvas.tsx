"use client";

import { useMemo } from "react";
import { Coord, Direction, Piece, Puzzle } from "@/lib/types";
import { delta } from "@/lib/rules";

interface MazeCanvasProps {
  puzzle: Puzzle;
  present: boolean[][];
  /** Colors hidden beneath the board, uncovered cell by cell as pieces
   * clear. Null on boards too small to hold a picture. */
  pictureLayer: (string | null)[][] | null;
  exitingPieces: Map<number, Direction>;
  flashPieceId: number | null;
  hintPieceId: number | null;
  disabled?: boolean;
  onTap: (row: number, col: number) => void;
}

/** Must stay in sync with EXIT_ANIMATION_MS in useMazeGame.ts. */
const EXIT_ANIMATION_MS = 380;
const EXIT_EASING = "cubic-bezier(0.4, 0, 1, 1)";

const ARROW_ROTATION: Record<Direction, number> = { up: 0, right: 90, down: 180, left: 270 };
/** Solid filled arrow cap. Its apex reaches almost to the cell's true outer
 * edge (matching the tail-extension in buildPiecePath below) and it flares
 * noticeably wider than the line so the arrowhead still reads clearly at
 * this thinner stroke, with its base at the cell center so it meets the
 * line's own end with no gap or visible seam. */
const ARROW_PATH = "M0 -0.44 L0.26 -0.04 L-0.26 -0.04 Z";
const ARROW_HALO_PATH = "M0 -0.5 L0.32 -0.01 L-0.32 -0.01 Z";
/**
 * A slim line with a generous channel of background on either side, so the
 * board reads as a drawn maze of routed pipes rather than a block of
 * colour — every cell still belongs to some piece (the puzzle is a full
 * tiling), the runs are just drawn thin.
 */
const LINE_WIDTH = 0.22;
const HALO_WIDTH = 0.34;
/** Radius of the smooth quarter-turn drawn at each bend. At this stroke
 * width a plain mitred/round join reads as a hard corner, so bends are
 * curved explicitly. */
const CORNER_RADIUS = 0.34;
/** How far past a cell's center the piece's TAIL end (the non-arrow end)
 * extends, so its round cap lands just inside that cell's outer edge
 * instead of stopping halfway back at the center. */
const TAIL_EXTEND = 0.34;
/** Fallback fill for the rare 1-cell piece (no line to stroke at all). */
const SINGLE_CELL_FILL = 0.24;
const SINGLE_CELL_HALO_FILL = 0.36;
/** Fixed amber/gold, independent of theme — same role as the always-red danger flash. */
const HINT_COLOR = "#e0983d";
/** Must match the length of every theme's piecePalette. */
const PALETTE_SIZE = 6;

/**
 * Greedy graph coloring over the pieces: two pieces that touch anywhere on
 * the board never get the same color, so every piece reads as its own shape.
 * Deterministic in piece id, so a board looks the same every time it's
 * drawn. Falls back to cycling ids if a piece somehow has more distinct
 * neighbours than there are colors, which a grid can't actually produce —
 * four colors suffice for any planar map, and there are six here.
 */
function assignPieceColors(pieces: Piece[], cols: number, rows: number): number[] {
  const ownerAt: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  for (const piece of pieces) {
    for (const cell of piece.cells) ownerAt[cell.row][cell.col] = piece.id;
  }

  const neighbours: Set<number>[] = pieces.map(() => new Set<number>());
  for (const piece of pieces) {
    for (const cell of piece.cells) {
      for (const dir of ["up", "down", "left", "right"] as Direction[]) {
        const d = delta(dir);
        const r = cell.row + d.row;
        const c = cell.col + d.col;
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        const other = ownerAt[r][c];
        if (other !== -1 && other !== piece.id) neighbours[piece.id].add(other);
      }
    }
  }

  const colors = new Array(pieces.length).fill(-1);
  const usage = new Array(PALETTE_SIZE).fill(0);
  for (const piece of pieces) {
    const taken = new Set<number>();
    for (const n of neighbours[piece.id]) {
      if (colors[n] !== -1) taken.add(colors[n]);
    }
    // Least-used free color rather than lowest-numbered: always taking the
    // first free index leaves the tail of the palette barely used, and the
    // board ends up looking like two colors with occasional accents.
    let pick = -1;
    for (let i = 0; i < PALETTE_SIZE; i++) {
      if (taken.has(i)) continue;
      if (pick === -1 || usage[i] < usage[pick]) pick = i;
    }
    if (pick === -1) pick = piece.id % PALETTE_SIZE;
    colors[piece.id] = pick;
    usage[pick]++;
  }
  return colors;
}

function normalize(dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function sameCell(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * A piece's line through its cells' centers, with each bend drawn as a
 * smooth quarter-turn (quadratic curve cutting the corner by
 * CORNER_RADIUS) rather than a hard right angle. The end AWAY from the
 * arrowhead is extended by TAIL_EXTEND so its round cap lands just inside
 * that cell's outer edge rather than stopping at its center; the head end
 * stays at the center, where the arrowhead triangle drawn on top takes
 * over.
 */
function buildPiecePath(piece: Piece, headCell: Coord): string {
  const pts = piece.cells.map((c) => ({ x: c.col + 0.5, y: c.row + 0.5 }));
  if (pts.length < 2) return "";

  const headIsFirst = sameCell(piece.cells[0], headCell);
  const tailIdx = headIsFirst ? pts.length - 1 : 0;
  const neighborIdx = headIsFirst ? pts.length - 2 : 1;
  const dir = normalize(pts[tailIdx].x - pts[neighborIdx].x, pts[tailIdx].y - pts[neighborIdx].y);
  pts[tailIdx] = { x: pts[tailIdx].x + dir.x * TAIL_EXTEND, y: pts[tailIdx].y + dir.y * TAIL_EXTEND };

  if (pts.length === 2) return `M${pts[0].x} ${pts[0].y} L${pts[1].x} ${pts[1].y}`;

  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const toPrev = normalize(prev.x - cur.x, prev.y - cur.y);
    const toNext = normalize(next.x - cur.x, next.y - cur.y);
    // Never cut back further than half a segment, or consecutive bends
    // one cell apart would overshoot into each other.
    const rIn = Math.min(CORNER_RADIUS, Math.hypot(prev.x - cur.x, prev.y - cur.y) / 2);
    const rOut = Math.min(CORNER_RADIUS, Math.hypot(next.x - cur.x, next.y - cur.y) / 2);
    const a = { x: cur.x + toPrev.x * rIn, y: cur.y + toPrev.y * rIn };
    const b = { x: cur.x + toNext.x * rOut, y: cur.y + toNext.y * rOut };
    d += ` L${a.x} ${a.y} Q${cur.x} ${cur.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L${last.x} ${last.y}`;
  return d;
}

/**
 * The arrowhead goes on cells[0]. Every piece is built head-first, and the
 * exit check reads the same cell, so what the player sees leading the way
 * out is what actually has to have a clear lane. This used to be inferred
 * by comparing the two endpoints against the travel direction, which was
 * fine when the whole shape had to slide as one but would now be guessing
 * at the one cell the rule depends on.
 */
function headCellOf(piece: Piece) {
  return piece.cells[0];
}

/**
 * The route a leaving piece takes: straight out from its head to past the
 * board edge, then back down its own line to the tail. Drawn as one path so
 * the body can be walked along it — the extension and the piece's first
 * segment are collinear (the head's tangent is the exit direction by
 * construction), so the join is a straight line, not a corner.
 */
function buildExitPath(piece: Piece, cols: number, rows: number): { d: string; runOut: number; bodyLength: number } {
  const head = piece.cells[0];
  const dir = delta(piece.direction);
  const edgeDistance =
    piece.direction === "up"
      ? head.row + 0.5
      : piece.direction === "down"
        ? rows - head.row - 0.5
        : piece.direction === "left"
          ? head.col + 0.5
          : cols - head.col - 0.5;
  // Far enough that the arrowhead is past the edge before the body follows.
  const runOut = edgeDistance + 1;

  const exitPoint = {
    x: head.col + 0.5 + dir.col * runOut,
    y: head.row + 0.5 + dir.row * runOut,
  };
  const body = buildPiecePath(piece, head);
  // Rounded corners shave a little off the true length; padding keeps the
  // drawn body from falling short of its own tail.
  const bodyLength = piece.cells.length - 1 + TAIL_EXTEND + 0.4;

  return { d: `M${exitPoint.x} ${exitPoint.y} ${body.replace(/^M/, "L")}`, runOut, bodyLength };
}

/**
 * A piece threading out along its own route. The whole route is drawn as
 * one path and a dash the length of the body is walked along it, from where
 * the body currently sits to past the start (the exit point) — which reads
 * as the piece following its own line out, head first.
 *
 * Driven by the Web Animations API off a ref rather than a CSS transition:
 * a transition needs the element to render once at its starting offset and
 * again at its end, and this element only exists for the length of the
 * animation.
 */
function ExitingPiece({
  piece,
  cols,
  rows,
  color,
  width,
  rotation,
  arrowPath,
}: {
  piece: Piece;
  cols: number;
  rows: number;
  color: string;
  width: number;
  rotation: number;
  arrowPath: string;
}) {
  const { d, runOut, bodyLength } = buildExitPath(piece, cols, rows);
  const head = piece.cells[0];
  const dir = delta(piece.direction);
  const travel = runOut + bodyLength;

  const startAnimation = (node: SVGPathElement | null) => {
    if (!node) return;
    node.animate([{ strokeDashoffset: -runOut }, { strokeDashoffset: bodyLength }], {
      duration: EXIT_ANIMATION_MS,
      easing: EXIT_EASING,
      fill: "forwards",
    });
  };

  const startArrow = (node: SVGGElement | null) => {
    if (!node) return;
    // The head runs straight out along the extension, so the arrowhead just
    // travels in the exit direction. It is off the board long before the
    // body finishes, which is why it can keep going past the edge. Lengths
    // are in px because that is what the animation API accepts here, and on
    // an SVG element a px resolves to one user unit — the same units as the
    // viewBox, not screen pixels.
    node.animate(
      [{ transform: "translate(0px, 0px)" }, { transform: `translate(${dir.col * travel}px, ${dir.row * travel}px)` }],
      { duration: EXIT_ANIMATION_MS, easing: EXIT_EASING, fill: "forwards" }
    );
  };

  return (
    <g>
      <path
        ref={startAnimation}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${bodyLength} ${travel + bodyLength}`}
        strokeDashoffset={-runOut}
      />
      <g ref={startArrow}>
        <g transform={`translate(${head.col + 0.5} ${head.row + 0.5}) rotate(${rotation})`}>
          <path d={arrowPath} fill={color} />
        </g>
      </g>
    </g>
  );
}

export function MazeCanvas({ puzzle, present, pictureLayer, exitingPieces, flashPieceId, hintPieceId, disabled, onTap }: MazeCanvasProps) {
  const { cols, rows, pieces } = puzzle;
  const pieceColors = useMemo(() => assignPieceColors(pieces, cols, rows), [pieces, cols, rows]);

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
          const hidden = pictureLayer?.[r]?.[c] ?? null;
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
              // Revealed only once the covering piece is gone. The fade is
              // slower than the piece's slide-out so the colour arrives
              // just behind it rather than racing it off the board.
              style={
                hidden
                  ? { backgroundColor: isPresent ? "transparent" : hidden, transition: "background-color 450ms ease-out" }
                  : undefined
              }
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

          if (exitDir) {
            return (
              <ExitingPiece
                key={`${piece.id}-exit`}
                piece={piece}
                cols={cols}
                rows={rows}
                color="var(--maze)"
                width={HALO_WIDTH}
                rotation={rotation}
                arrowPath={ARROW_HALO_PATH}
              />
            );
          }

          return (
            <g key={piece.id} style={{ opacity: isPresent ? 1 : 0, transition: "opacity 150ms" }}>
              {path ? (
                <path d={path} fill="none" stroke="var(--maze)" strokeWidth={HALO_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
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
          const color = isFlashing ? "var(--danger)" : isHinted ? HINT_COLOR : `var(--piece-${pieceColors[piece.id]})`;
          const path = buildPiecePath(piece, head);
          const rotation = ARROW_ROTATION[piece.direction];

          if (exitDir) {
            return (
              <ExitingPiece
                key={`${piece.id}-exit`}
                piece={piece}
                cols={cols}
                rows={rows}
                color={color}
                width={LINE_WIDTH}
                rotation={rotation}
                arrowPath={ARROW_PATH}
              />
            );
          }

          return (
            <g
              key={piece.id}
              className={isHinted ? "animate-pulse" : undefined}
              style={{ opacity: isPresent ? 1 : 0, transition: "opacity 150ms" }}
            >
              {path ? (
                <path d={path} fill="none" stroke={color} strokeWidth={LINE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
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

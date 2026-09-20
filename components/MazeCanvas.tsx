"use client";

import { useCallback, useMemo, useRef } from "react";
import { Coord, Puzzle } from "@/lib/types";
import { directionBetween, isLineComplete, sameCoord } from "@/lib/rules";

interface MazeCanvasProps {
  puzzle: Puzzle;
  progress: number[];
  activeLineId: number | null;
  flashLineId: number | null;
  disabled?: boolean;
  onDragStart: (coord: Coord) => void;
  onCellEnter: (coord: Coord) => void;
  onDragEnd: () => void;
}

const rotationDeg: Record<string, number> = { up: 0, right: 90, down: 180, left: 270 };

export function MazeCanvas({
  puzzle,
  progress,
  activeLineId,
  flashLineId,
  disabled,
  onDragStart,
  onCellEnter,
  onDragEnd,
}: MazeCanvasProps) {
  const { cols, rows, lines } = puzzle;
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCellRef = useRef<Coord | null>(null);
  const draggingRef = useRef(false);

  const cellPxUnit = 44; // viewBox units per cell — arbitrary, aspect handled by viewBox
  const W = cols * cellPxUnit;
  const H = rows * cellPxUnit;
  const cx = useCallback((c: number) => c * cellPxUnit + cellPxUnit / 2, []);
  const cy = useCallback((r: number) => r * cellPxUnit + cellPxUnit / 2, []);

  const coordFromPointer = useCallback(
    (clientX: number, clientY: number): Coord | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
      const col = Math.floor(((clientX - rect.left) / rect.width) * cols);
      const row = Math.floor(((clientY - rect.top) / rect.height) * rows);
      if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
      return { row, col };
    },
    [cols, rows]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      const coord = coordFromPointer(e.clientX, e.clientY);
      if (!coord) return;
      draggingRef.current = true;
      lastCellRef.current = coord;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      onDragStart(coord);
    },
    [disabled, coordFromPointer, onDragStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current || disabled) return;
      const coord = coordFromPointer(e.clientX, e.clientY);
      if (!coord) return;
      if (lastCellRef.current && sameCoord(lastCellRef.current, coord)) return;
      lastCellRef.current = coord;
      onCellEnter(coord);
    },
    [disabled, coordFromPointer, onCellEnter]
  );

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    lastCellRef.current = null;
    onDragEnd();
  }, [onDragEnd]);

  const lineElements = useMemo(() => {
    return lines.map((line) => {
      const p = progress[line.id];
      const complete = isLineComplete(line, p);
      const isFlashing = flashLineId === line.id;

      let dFull = `M ${cx(line.path[0].col)} ${cy(line.path[0].row)}`;
      for (let i = 1; i < line.path.length; i++) dFull += ` L ${cx(line.path[i].col)} ${cy(line.path[i].row)}`;

      let dTraced = "";
      if (p > 0) {
        dTraced = `M ${cx(line.path[0].col)} ${cy(line.path[0].row)}`;
        for (let i = 1; i <= p; i++) dTraced += ` L ${cx(line.path[i].col)} ${cy(line.path[i].row)}`;
      }

      const baseColor = complete ? "var(--line-done)" : "var(--line)";
      const tracedColor = isFlashing ? "var(--danger)" : "var(--accent3)";
      const dotStroke = isFlashing ? "var(--danger)" : baseColor;

      const startDir = directionBetween(line.path[0], line.path[1]);
      const arrowAngle = startDir ? rotationDeg[startDir] : 0;
      const arrowSize = cellPxUnit * 0.17;

      const [startCoord] = line.path;
      const endCoord = line.path[line.path.length - 1];

      return (
        <g key={line.id}>
          <path
            d={dFull}
            fill="none"
            stroke={baseColor}
            strokeWidth={cellPxUnit * 0.22}
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          {dTraced && (
            <path
              d={dTraced}
              fill="none"
              stroke={tracedColor}
              strokeWidth={cellPxUnit * 0.24}
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
          )}
          {!complete && (
            <g transform={`translate(${cx(startCoord.col)} ${cy(startCoord.row)}) rotate(${arrowAngle})`}>
              <path
                d={`M0 ${-arrowSize} L${arrowSize * 0.9} ${arrowSize * 0.75} L${-arrowSize * 0.9} ${arrowSize * 0.75} Z`}
                fill="var(--maze)"
              />
            </g>
          )}
          <circle
            cx={cx(startCoord.col)}
            cy={cy(startCoord.row)}
            r={cellPxUnit * 0.2}
            fill="none"
            stroke={dotStroke}
            strokeWidth={3.5}
          />
          <circle cx={cx(endCoord.col)} cy={cy(endCoord.row)} r={cellPxUnit * 0.18} fill={baseColor} />
        </g>
      );
    });
  }, [lines, progress, flashLineId, cx, cy]);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none touch-none rounded-lg overflow-hidden bg-maze"
      style={{ aspectRatio: `${cols} / ${rows}` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet" className="block w-full h-full">
        {lineElements}
      </svg>
    </div>
  );
}

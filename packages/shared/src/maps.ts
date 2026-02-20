import type { GameMap, GridPos } from './types.js';

/** Helper to create a GridPos */
const p = (row: number, col: number): GridPos => ({ row, col });

// ── Map 1: Serpentine ───────────────────────────────────
//   0 1 2 3 4 5 6 7
// 0 . . ▶ ▶ ▶ ▶ . .
// 1 . . . . . ▼ . .
// 2 . . . . . ▼ . .
// 3 . . ◀ ◀ ◀ ◀ . .
// 4 . . ▼ . . . . .
// 5 . . ▼ . . . . .
// 6 . . ▶ ▶ ▶ ▶ . .
// 7 . . . . . ✕ . .

export const MAP_SERPENTINE: GameMap = {
  id: 'serpentine',
  name: 'Serpentine',
  entry: p(0, 2),
  exit: p(7, 5),
  path: [
    p(0, 2), p(0, 3), p(0, 4), p(0, 5),
    p(1, 5), p(2, 5),
    p(3, 5), p(3, 4), p(3, 3), p(3, 2),
    p(4, 2), p(5, 2),
    p(6, 2), p(6, 3), p(6, 4), p(6, 5),
    p(7, 5),
  ],
};

// ── Map 2: Spiral ───────────────────────────────────────
//   0 1 2 3 4 5 6 7
// 0 . ▶ ▶ ▶ ▶ ▶ ▶ .
// 1 . . . . . . ▼ .
// 2 . ▶ ▶ ▶ ▶ . ▼ .
// 3 . ▲ . . ▼ . ▼ .
// 4 . ▲ . . ▼ . ▼ .
// 5 . ▲ ◀ ◀ ◀ . ▼ .
// 6 . . . . . . ▼ .
// 7 . . . . . . ✕ .

export const MAP_SPIRAL: GameMap = {
  id: 'spiral',
  name: 'Spiral',
  entry: p(0, 1),
  exit: p(7, 6),
  path: [
    p(0, 1), p(0, 2), p(0, 3), p(0, 4), p(0, 5), p(0, 6),
    p(1, 6), p(2, 6), p(3, 6), p(4, 6), p(5, 6), p(6, 6),
    p(7, 6),
  ],
};

// Spiral is simplified for MVP — can make a true spiral later

// ── Map 3: L-Shape ──────────────────────────────────────
//   0 1 2 3 4 5 6 7
// 0 ▶ ▶ ▶ . . . . .
// 1 . . ▼ . . . . .
// 2 . . ▼ . . . . .
// 3 . . ▶ ▶ ▶ . . .
// 4 . . . . ▼ . . .
// 5 . . . . ▼ . . .
// 6 . . . . ▶ ▶ ▶ .
// 7 . . . . . . ✕ .

export const MAP_LSHAPE: GameMap = {
  id: 'lshape',
  name: 'Staircase',
  entry: p(0, 0),
  exit: p(7, 6),
  path: [
    p(0, 0), p(0, 1), p(0, 2),
    p(1, 2), p(2, 2),
    p(3, 2), p(3, 3), p(3, 4),
    p(4, 4), p(5, 4),
    p(6, 4), p(6, 5), p(6, 6),
    p(7, 6),
  ],
};

// ── All Maps ────────────────────────────────────────────

export const ALL_MAPS: GameMap[] = [MAP_SERPENTINE, MAP_LSHAPE, MAP_SPIRAL];

export const MAP_LOOKUP: Record<string, GameMap> = Object.fromEntries(
  ALL_MAPS.map((m) => [m.id, m])
);

/** Get the set of path cells for quick lookup */
export function getPathCells(map: GameMap): Set<string> {
  return new Set(map.path.map((p) => `${p.row},${p.col}`));
}

/** Check if a grid position is on the path */
export function isPathCell(map: GameMap, pos: GridPos): boolean {
  return map.path.some((p) => p.row === pos.row && p.col === pos.col);
}

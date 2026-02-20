import type { GameMap, GridPos } from './types.js';

/** Helper to create a GridPos */
const p = (row: number, col: number): GridPos => ({ row, col });

// ── Map 1: Grand Serpentine (16×16) ─────────────────────
// A classic snake pattern with 6+ turns traversing the entire grid

export const MAP_SERPENTINE: GameMap = {
  id: 'serpentine',
  name: 'Grand Serpentine',
  entry: p(0, 1),
  exit: p(15, 14),
  path: [
    // Top horizontal (left to right)
    p(0, 1), p(0, 2), p(0, 3), p(0, 4), p(0, 5), p(0, 6), p(0, 7), p(0, 8), p(0, 9), p(0, 10), p(0, 11), p(0, 12), p(0, 13), p(0, 14),
    // Down right side
    p(1, 14), p(2, 14), p(3, 14),
    // Second horizontal (right to left)
    p(4, 14), p(4, 13), p(4, 12), p(4, 11), p(4, 10), p(4, 9), p(4, 8), p(4, 7), p(4, 6), p(4, 5), p(4, 4), p(4, 3), p(4, 2), p(4, 1),
    // Down left side
    p(5, 1), p(6, 1), p(7, 1),
    // Third horizontal (left to right)
    p(8, 1), p(8, 2), p(8, 3), p(8, 4), p(8, 5), p(8, 6), p(8, 7), p(8, 8), p(8, 9), p(8, 10), p(8, 11), p(8, 12), p(8, 13), p(8, 14),
    // Down right side again
    p(9, 14), p(10, 14), p(11, 14),
    // Final horizontal (right to left)
    p(12, 14), p(12, 13), p(12, 12), p(12, 11), p(12, 10), p(12, 9), p(12, 8), p(12, 7), p(12, 6), p(12, 5), p(12, 4), p(12, 3), p(12, 2), p(12, 1),
    // Final descent to exit
    p(13, 1), p(14, 1), p(15, 1), p(15, 2), p(15, 3), p(15, 4), p(15, 5), p(15, 6), p(15, 7), p(15, 8), p(15, 9), p(15, 10), p(15, 11), p(15, 12), p(15, 13), p(15, 14),
  ],
};

// ── Map 2: Spiral (16×16) ───────────────────────────────
// A true spiral from exterior to center with 4+ turns

export const MAP_SPIRAL: GameMap = {
  id: 'spiral',
  name: 'Spiral',
  entry: p(0, 2),
  exit: p(15, 13),
  path: [
    // Outer ring - top edge (left to right)
    p(0, 2), p(0, 3), p(0, 4), p(0, 5), p(0, 6), p(0, 7), p(0, 8), p(0, 9), p(0, 10), p(0, 11), p(0, 12), p(0, 13),
    // Outer ring - right edge (top to bottom)
    p(1, 13), p(2, 13), p(3, 13), p(4, 13), p(5, 13), p(6, 13), p(7, 13), p(8, 13), p(9, 13), p(10, 13), p(11, 13), p(12, 13), p(13, 13), p(14, 13), p(15, 13),
    // Outer ring - bottom edge (right to left)
    p(15, 12), p(15, 11), p(15, 10), p(15, 9), p(15, 8), p(15, 7), p(15, 6), p(15, 5), p(15, 4), p(15, 3), p(15, 2),
    // Outer ring - left edge (bottom to top)
    p(14, 2), p(13, 2), p(12, 2), p(11, 2), p(10, 2), p(9, 2), p(8, 2), p(7, 2), p(6, 2), p(5, 2), p(4, 2), p(3, 2), p(2, 2),
    // Second ring - top edge (left to right)
    p(2, 3), p(2, 4), p(2, 5), p(2, 6), p(2, 7), p(2, 8), p(2, 9), p(2, 10), p(2, 11),
    // Second ring - right edge (top to bottom)
    p(3, 11), p(4, 11), p(5, 11), p(6, 11), p(7, 11), p(8, 11), p(9, 11), p(10, 11), p(11, 11), p(12, 11), p(13, 11),
    // Second ring - bottom edge (right to left)
    p(13, 10), p(13, 9), p(13, 8), p(13, 7), p(13, 6), p(13, 5), p(13, 4),
    // Second ring - left edge (bottom to top)
    p(12, 4), p(11, 4), p(10, 4), p(9, 4), p(8, 4), p(7, 4), p(6, 4), p(5, 4), p(4, 4),
    // Inner path - final approach to center
    p(4, 5), p(4, 6), p(4, 7), p(4, 8), p(4, 9),
    p(5, 9), p(6, 9), p(7, 9), p(8, 9), p(9, 9),
    p(9, 8), p(9, 7), p(9, 6),
    p(8, 6), p(7, 6),
    p(7, 7), p(7, 8),
  ],
};

// Spiral is simplified for MVP — can make a true spiral later

// ── Map 3: Maze (16×16) ─────────────────────────────────
// A labyrinth-like path with multiple U-turns and 5+ turns

export const MAP_LSHAPE: GameMap = {
  id: 'maze',
  name: 'Maze',
  entry: p(0, 0),
  exit: p(15, 15),
  path: [
    // Start at top-left, go right
    p(0, 0), p(0, 1), p(0, 2), p(0, 3), p(0, 4), p(0, 5), p(0, 6), p(0, 7), p(0, 8), p(0, 9), p(0, 10),
    // Turn 1: Go down
    p(1, 10), p(2, 10), p(3, 10), p(4, 10), p(5, 10),
    // Turn 2: Go left (U-turn)
    p(5, 9), p(5, 8), p(5, 7), p(5, 6), p(5, 5), p(5, 4), p(5, 3), p(5, 2),
    // Turn 3: Go down
    p(6, 2), p(7, 2), p(8, 2), p(9, 2), p(10, 2),
    // Turn 4: Go right (U-turn)
    p(10, 3), p(10, 4), p(10, 5), p(10, 6), p(10, 7), p(10, 8), p(10, 9), p(10, 10), p(10, 11), p(10, 12), p(10, 13),
    // Turn 5: Go up
    p(9, 13), p(8, 13), p(7, 13), p(6, 13),
    // Turn 6: Go right
    p(6, 14), p(6, 15),
    // Turn 7: Go down
    p(7, 15), p(8, 15), p(9, 15), p(10, 15), p(11, 15), p(12, 15), p(13, 15), p(14, 15),
    // Final stretch to exit
    p(15, 15),
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

// Детерминированная раскладка пирамиды по seed. Без Math.random (R3).
import { BALL_DIAMETER, BALL_RADIUS, DEFAULT_SEED, FOOT_SPOT, HEAD_SPOT } from "./constants";

/** Позиция шара при раскладке. */
export interface BallPlacement {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** PRNG mulberry32: детерминированный генератор из целочисленного seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROW_DX = BALL_RADIUS * Math.sqrt(3); // расстояние между рядами (шары касаются)

interface Slot {
  readonly r: number;
  readonly c: number;
  readonly x: number;
  readonly y: number;
}

/** Индекс слота в треугольнике: ряды длин 1,2,3,4,5. */
function slotIndex(r: number, c: number): number {
  return (r * (r + 1)) / 2 + c;
}

function buildSlots(): readonly Slot[] {
  const slots: Slot[] = [];
  for (let r = 0; r <= 4; r += 1) {
    for (let c = 0; c <= r; c += 1) {
      slots.push({
        r,
        c,
        x: FOOT_SPOT.x + r * ROW_DX,
        y: FOOT_SPOT.y + (c - r / 2) * BALL_DIAMETER,
      });
    }
  }
  return slots;
}

/**
 * Разложить шары: биток на головном пятне, пирамида вершиной на подставке.
 * 8-й — в центре третьего ряда; задние углы — сплошной и полосатый; остальное
 * перемешивается детерминированно по seed.
 */
export function rackPlacements(seed: number = DEFAULT_SEED): readonly BallPlacement[] {
  const rng = mulberry32(seed >>> 0);
  const slots = buildSlots();

  const triangle = new Array<number>(15).fill(0);
  triangle[slotIndex(2, 1)] = 8; // 8-й в центре третьего ряда

  const solids = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  const solidPick = solids[Math.floor(rng() * solids.length)] ?? 1;
  const stripePick = stripes[Math.floor(rng() * stripes.length)] ?? 9;
  const solidAtLeft = rng() < 0.5;
  triangle[slotIndex(4, 0)] = solidAtLeft ? solidPick : stripePick;
  triangle[slotIndex(4, 4)] = solidAtLeft ? stripePick : solidPick;

  const remaining = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ].filter((id) => id !== 8 && id !== solidPick && id !== stripePick);

  // Fisher–Yates на детерминированном генераторе.
  for (let i = remaining.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = remaining[i]!;
    remaining[i] = remaining[j]!;
    remaining[j] = tmp;
  }

  let k = 0;
  for (let idx = 0; idx < triangle.length; idx += 1) {
    if (triangle[idx] === 0) {
      triangle[idx] = remaining[k]!;
      k += 1;
    }
  }

  const placements: BallPlacement[] = [{ id: 0, x: HEAD_SPOT.x, y: HEAD_SPOT.y }];
  for (let idx = 0; idx < slots.length; idx += 1) {
    const slot = slots[idx]!;
    placements.push({ id: triangle[idx]!, x: slot.x, y: slot.y });
  }
  return placements;
}

// Определения классических 16 шаров. Чистые данные, без DOM.
import { BALL_COLORS, BALL_MASS, BALL_RADIUS } from "./constants";

/** Тип шара. */
export type BallKind = "cue" | "solid" | "eight" | "stripe";

/** Определение шара. */
export interface BallDef {
  readonly id: number;
  readonly kind: BallKind;
  readonly color: string;
  readonly radius: number;
  readonly mass: number;
}

function kindOf(id: number): BallKind {
  if (id === 0) return "cue";
  if (id === 8) return "eight";
  if (id >= 1 && id <= 7) return "solid";
  return "stripe";
}

/** Все 16 шаров: 0 — биток, 1–7 сплошные, 8 чёрный, 9–15 полосатые. */
export const BALLS: readonly BallDef[] = BALL_COLORS.map((color, id) => ({
  id,
  kind: kindOf(id),
  color,
  radius: BALL_RADIUS,
  mass: BALL_MASS,
}));

/** Сплошной шар (1–7). */
export function isSolid(id: number): boolean {
  return id >= 1 && id <= 7;
}

/** Полосатый шар (9–15). */
export function isStripe(id: number): boolean {
  return id >= 9 && id <= 15;
}

/** Цвет шара по id (безопасный фолбэк). */
export function colorOf(id: number): string {
  return BALL_COLORS[id] ?? "#000000";
}

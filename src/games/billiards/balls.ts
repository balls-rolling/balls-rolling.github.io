// Определения шаров режима. Чистые данные, без DOM.
// Набор строится из конфига режима (modes/types): цвет, диаметр и масса оттуда,
// вид шара (биток/сплошной/восьмёрка/полосатый) по-прежнему различается по id.
import type { ModeConfig } from "./modes/types";

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

/** Вид шара по номеру: 0 — биток, 1–7 сплошные, 8 — восьмёрка, 9–15 полосатые. */
export function kindOf(id: number): BallKind {
  if (id === 0) return "cue";
  if (id === 8) return "eight";
  if (id >= 1 && id <= 7) return "solid";
  return "stripe";
}

/** Набор шаров режима: цвета/диаметр/масса из конфига, вид — по id. */
export function ballsOf(config: ModeConfig): readonly BallDef[] {
  const { colors, diameter, mass } = config.balls;
  const radius = diameter / 2;
  return colors.map((color, id) => ({ id, kind: kindOf(id), color, radius, mass }));
}

/** Сплошной шар (1–7). */
export function isSolid(id: number): boolean {
  return id >= 1 && id <= 7;
}

/** Полосатый шар (9–15). */
export function isStripe(id: number): boolean {
  return id >= 9 && id <= 15;
}

/** Цвет шара режима по id (безопасный фолбэк, если цвета нет в конфиге). */
export function colorOf(id: number, config: ModeConfig): string {
  return config.balls.colors[id] ?? "#000000";
}

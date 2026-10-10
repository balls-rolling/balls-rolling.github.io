// Состояние партии бильярда и его сериализация (раунд-трип сохранений).
import type { GameState } from "@/core/game";
import { DEFAULT_SEED } from "./constants";
import { rackPlacements } from "./rack";

/** Вектор спина шара (закладываем с самого начала, см. R3). */
export interface Spin {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Состояние шара. */
export interface BallState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: Spin;
  readonly active: boolean;
}

/** Состояние партии бильярда. */
export interface BilliardsState extends GameState {
  readonly version: 1;
  readonly seed: number;
  readonly order: readonly string[];
  readonly turn: number;
  readonly balls: readonly BallState[];
  readonly finished: boolean;
}

/** Начальное состояние: раскладка по seed, биток на головном пятне. */
export function createInitialState(
  playerIds: readonly string[],
  seed: number = DEFAULT_SEED,
): BilliardsState {
  const placements = [...rackPlacements(seed)].sort((a, b) => a.id - b.id);
  const balls: BallState[] = placements.map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    spin: { x: 0, y: 0, z: 0 },
    active: true,
  }));
  const order = playerIds.length > 0 ? [...playerIds] : ["p1"];
  return { version: 1, seed, order, turn: 0, balls, finished: false };
}

/** Сериализовать состояние в JSON-safe plain-данные. */
export function serializeBilliardsState(state: BilliardsState): unknown {
  return {
    version: state.version,
    seed: state.seed,
    order: [...state.order],
    turn: state.turn,
    finished: state.finished,
    balls: state.balls.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      spin: { x: b.spin.x, y: b.spin.y, z: b.spin.z },
      active: b.active,
    })),
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Восстановить состояние; `null` — данные непригодны. */
export function deserializeBilliardsState(data: unknown): BilliardsState | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.version !== 1) return null;

  const seed = d.seed;
  const turn = d.turn;
  const finished = d.finished;
  if (!isFiniteNumber(seed)) return null;
  if (!isFiniteNumber(turn)) return null;
  if (typeof finished !== "boolean") return null;
  if (!Array.isArray(d.order) || !d.order.every((v) => typeof v === "string")) return null;
  if (!Array.isArray(d.balls) || d.balls.length !== 16) return null;

  const balls: BallState[] = [];
  for (let i = 0; i < 16; i += 1) {
    const b = d.balls[i] as Record<string, unknown> | undefined;
    if (typeof b !== "object" || b === null) return null;
    if (b.id !== i) return null;
    const x = b.x;
    const y = b.y;
    const vx = b.vx;
    const vy = b.vy;
    const active = b.active;
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
    if (!isFiniteNumber(vx) || !isFiniteNumber(vy)) return null;
    if (typeof active !== "boolean") return null;
    const sp = b.spin as Record<string, unknown> | undefined;
    if (typeof sp !== "object" || sp === null) return null;
    const sx = sp.x;
    const sy = sp.y;
    const sz = sp.z;
    if (!isFiniteNumber(sx) || !isFiniteNumber(sy) || !isFiniteNumber(sz)) return null;
    balls.push({ id: i, x, y, vx, vy, spin: { x: sx, y: sy, z: sz }, active });
  }

  return {
    version: 1,
    seed,
    order: [...(d.order as string[])],
    turn,
    balls,
    finished,
  };
}

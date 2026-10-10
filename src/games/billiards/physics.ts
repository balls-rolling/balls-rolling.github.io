// Физика бильярда: чистое ядро без DOM. Фиксированный шаг, субшаги по скорости,
// замороженный порядок «интеграция → захват луз → стол → пары → покой».
// Без эффектов спина (фаза 03): только поступательное движение и замедление.
import {
  BALL_RADIUS,
  E_BALL,
  E_FACING,
  E_RAIL,
  MAX_SHOT_SECONDS,
  MAX_SHOT_SPEED,
  PHYS_DT,
  POS_SLOP,
  PUSH_FRACTION,
  ROLL_DECEL,
  SLEEP_SPEED,
  SUBSTEP_CAP,
  SUBSTEP_TRAVEL_FRACTION,
  TANG_KEEP_FACING,
  TANG_KEEP_RAIL,
} from "./constants";
import { buildTableGeometry, type Point, type PocketSpec, type Segment } from "./geometry";
import type { BallState, BilliardsState } from "./state";

/** Удар игрока: направление (радианы), сила (0..1) и, опционально, точка
 *  постановки битка в «кухне» перед первым ударом. */
export interface Shot {
  readonly angle: number;
  readonly power: number;
  readonly cueX?: number;
  readonly cueY?: number;
}

/** Геометрия строится один раз: она чистая и не меняется. */
const GEOMETRY = buildTableGeometry();

/** Внутреннее (мутабельное) состояние шара для шага. */
interface SimBall {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function speedOf(ball: SimBall): number {
  return Math.hypot(ball.vx, ball.vy);
}

function toSim(balls: readonly BallState[]): SimBall[] {
  return balls.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, active: b.active }));
}

function toState(state: BilliardsState, balls: readonly SimBall[]): BilliardsState {
  const spinById = new Map(state.balls.map((b) => [b.id, b.spin]));
  return {
    ...state,
    balls: balls.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      spin: spinById.get(b.id) ?? { x: 0, y: 0, z: 0 },
      active: b.active,
    })),
  };
}

function integrate(balls: SimBall[], h: number): void {
  for (const ball of balls) {
    if (!ball.active) continue;
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    const speed = speedOf(ball);
    if (speed <= 0) continue;
    const next = Math.max(0, speed - ROLL_DECEL * h);
    const scale = next / speed;
    ball.vx *= scale;
    ball.vy *= scale;
  }
}

function resolvePockets(balls: SimBall[], pockets: readonly PocketSpec[]): void {
  // Предикат — по требованиям: шар забит, когда центр пересёк линию рта наружу
  // (outward > 0) и остался в створе, |lateral| < mouth/2 + capturePad. Линия
  // рта — граница сукна и лузы, поэтому «центр за линией» = «центр в лузе».
  // Чинила не смена предиката, а уборка задних кромок (T2, geometry.ts):
  // кромка стояла за линией и отбивала шар раньше захвата.
  for (const ball of balls) {
    if (!ball.active) continue;
    for (const pocket of pockets) {
      const dx = ball.x - pocket.center.x;
      const dy = ball.y - pocket.center.y;
      const outward = dx * pocket.outward.x + dy * pocket.outward.y;
      if (outward <= 0) continue;
      const lateral = dx * -pocket.outward.y + dy * pocket.outward.x;
      if (Math.abs(lateral) < pocket.mouth / 2 + pocket.capturePad) {
        ball.active = false;
        ball.vx = 0;
        ball.vy = 0;
        break;
      }
    }
  }
}

function closestPointOnSegment(x: number, y: number, a: Point, b: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq <= 0) return { x: a.x, y: a.y };
  const t = clamp(((x - a.x) * abx + (y - a.y) * aby) / lengthSq, 0, 1);
  return { x: a.x + abx * t, y: a.y + aby * t };
}

function resolveSegments(balls: SimBall[], segments: readonly Segment[]): void {
  for (const ball of balls) {
    if (!ball.active) continue;
    for (const segment of segments) {
      const closest = closestPointOnSegment(ball.x, ball.y, segment.a, segment.b);
      const dx = ball.x - closest.x;
      const dy = ball.y - closest.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= BALL_RADIUS) continue;

      const penetration = BALL_RADIUS - distance;
      ball.x += segment.normal.x * penetration;
      ball.y += segment.normal.y * penetration;

      const vn = ball.vx * segment.normal.x + ball.vy * segment.normal.y;
      if (vn >= 0) continue;
      const isNose = segment.kind === "nose";
      const keep = isNose ? TANG_KEEP_RAIL : TANG_KEEP_FACING;
      const restitution = isNose ? E_RAIL : E_FACING;
      const perpX = ball.vx - vn * segment.normal.x;
      const perpY = ball.vy - vn * segment.normal.y;
      const reflected = -restitution * vn;
      ball.vx = perpX * keep + reflected * segment.normal.x;
      ball.vy = perpY * keep + reflected * segment.normal.y;
    }
  }
}

function resolvePairs(balls: SimBall[]): void {
  for (let i = 0; i < balls.length; i += 1) {
    const a = balls[i]!;
    if (!a.active) continue;
    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j]!;
      if (!b.active) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= 2 * BALL_RADIUS) continue;
      if (distance === 0) {
        dx = 1e-6;
        dy = 0;
        distance = 1e-6;
      }
      const nx = dx / distance;
      const ny = dy / distance;
      const penetration = 2 * BALL_RADIUS - distance;
      if (penetration > POS_SLOP) {
        const push = (penetration * PUSH_FRACTION) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn >= 0) continue;
      const impulse = (-(1 + E_BALL) * vn) / 2;
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
    }
  }
}

function settle(balls: SimBall[]): void {
  const thresholdSq = SLEEP_SPEED * SLEEP_SPEED;
  for (const ball of balls) {
    if (!ball.active) continue;
    if (ball.vx * ball.vx + ball.vy * ball.vy < thresholdSq) {
      ball.vx = 0;
      ball.vy = 0;
    }
  }
}

/** Один фиксированный шаг физики. Чистая функция состояния. */
export function step(state: BilliardsState): BilliardsState {
  const balls = toSim(state.balls);
  let vmax = 0;
  for (const ball of balls) {
    if (!ball.active) continue;
    vmax = Math.max(vmax, speedOf(ball));
  }
  const need = (vmax * PHYS_DT) / (SUBSTEP_TRAVEL_FRACTION * BALL_RADIUS);
  const substeps = Math.max(1, Math.min(SUBSTEP_CAP, Math.ceil(need)));
  const h = PHYS_DT / substeps;

  for (let s = 0; s < substeps; s += 1) {
    integrate(balls, h);
    resolvePockets(balls, GEOMETRY.pockets);
    resolveSegments(balls, GEOMETRY.segments);
    resolvePairs(balls);
    settle(balls);
  }
  return toState(state, balls);
}

/** Все активные шары неподвижны. */
export function isAtRest(state: BilliardsState): boolean {
  return state.balls.every((b) => !b.active || (b.vx === 0 && b.vy === 0));
}

/** Приложить удар к битку. Невалидный удар не меняет состояние. */
export function strike(state: BilliardsState, shot: Shot): BilliardsState {
  if (!isValidShot(shot)) return state;
  const speed = clamp(shot.power, 0, 1) * MAX_SHOT_SPEED;
  const vx = Math.cos(shot.angle) * speed;
  const vy = Math.sin(shot.angle) * speed;
  return {
    ...state,
    balls: state.balls.map((b) => (b.id === 0 && b.active ? { ...b, vx, vy } : b)),
  };
}

/** Удар валиден: конечные числа, сила в [0,1]. */
export function isValidShot(shot: Shot): boolean {
  return (
    Number.isFinite(shot.angle) && Number.isFinite(shot.power) && shot.power >= 0 && shot.power <= 1
  );
}

/** Прогнать состояние до полного покоя фиксированными шагами. */
export function simulateToRest(
  state: BilliardsState,
  maxSeconds: number = MAX_SHOT_SECONDS,
): BilliardsState {
  let current = state;
  const limit = Math.ceil(maxSeconds / PHYS_DT);
  for (let i = 0; i < limit; i += 1) {
    if (isAtRest(current)) return current;
    current = step(current);
  }
  return current;
}

/** Удар и полный прогон до покоя — один «ход» ядра. */
export function applyShot(state: BilliardsState, shot: Shot): BilliardsState {
  return simulateToRest(strike(state, shot));
}

// Аналитическая трассировка прицела (ядро, без DOM). Чистый луч от битка:
// шары, борта/облицовки, лузы. От борта — отскок и продолжение, предел пути —
// 1.5 длины стола (D3/D8). При первом касании шара — гост и векторы цели/отката.
import { BALL_RADIUS, E_RAIL, TABLE_LENGTH, TANG_KEEP_RAIL } from "./constants";
import { type Point, type Segment, type TableGeometry } from "./geometry";
import type { BallState, BilliardsState } from "./state";
import { kindOf } from "./balls";

/** Предел длины траектории-подсказки: 1.5 длины стола. */
export const AIM_MAX_PATH = 1.5 * TABLE_LENGTH;

/** Шкала тонкого поворота: пикселей ленты на градус угла (1 px = 0.01°). */
export const ANGLE_SCALE_PX_PER_DEG = 100;

/** Привести угол в градусах к диапазону [0, 360). */
export function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Новый угол прицела после перетаскивания шкалы на `dx` пикселей (угол — радианы). */
export function angleAfterScaleDrag(angle: number, dx: number): number {
  return angle + (dx / ANGLE_SCALE_PX_PER_DEG) * (Math.PI / 180);
}

/** Контакт с шаром: точка госта и направления разлёта. */
export interface AimBallHit {
  readonly ballId: number;
  /** Позиция центра битка в момент контакта. */
  readonly ghost: Point;
  /** Направление отлетевшего шара (единичное). */
  readonly targetDir: Point;
  /** Направление отката битка (единичное) или `null`, если удар по центру. */
  readonly cueDir: Point | null;
  /** Доля скорости битка после контакта, 0..1; гасит звёздчатый луч у касательной. */
  readonly cueStrength: number;
}

/** Результат трассировки: ломаная (старт + точки отскоков) и, если был, контакт. */
export interface AimTrace {
  readonly path: readonly Point[];
  readonly hitBall: AimBallHit | null;
}

const EPS = 1e-6;

/**
 * Целевой шар по правилам, а не по геометрии (решение пользователя 2026-10-17):
 * на разбитии — вершина пирамиды (шар 1); дальше — наименьший номер из шаров,
 * которые должен забивать ходящий (сплошные 1–7 или полосатые 9–15); при
 * открытом столе — наименьший групповой шар; после зачистки группы — восьмёрка.
 * Без шаров — null.
 */
export function pickTarget(state: BilliardsState): BallState | null {
  const cue = state.balls.find((b) => b.id === 0 && b.active);
  const active = state.balls.filter((b) => b.active && b.id !== 0);
  if (!cue || active.length === 0) return null;
  const pool = targetPool(state, active);
  let best: BallState | null = null;
  for (const ball of pool) if (best === null || ball.id < best.id) best = ball;
  return best;
}

/**
 * Шары, из которых по правилам выбирается цель удара: разбитие — вершина,
 * далее — свои шары группы, после зачистки — восьмёрка, на открытом столе —
 * групповые. Единственный источник этой логики (используют `pickTarget` и ИИ).
 */
export function legalTargets(state: BilliardsState): readonly BallState[] {
  const active = state.balls.filter((b) => b.active && b.id !== 0);
  return targetPool(state, active);
}

/** Множество шаров, из которого выбирается цель по правилам. */
function targetPool(state: BilliardsState, active: readonly BallState[]): readonly BallState[] {
  if (state.phase === "open" && state.shotSeq === 0) {
    const apex = active.find((b) => b.id === 1);
    if (apex) return [apex];
  }
  const shooter = state.order[state.turn];
  const group = shooter !== undefined ? state.groups?.[shooter] : undefined;
  if (group !== undefined) {
    const own = active.filter((b) => kindOf(b.id) === group);
    return own.length > 0 ? own : active.filter((b) => b.id === 8);
  }
  const groupBalls = active.filter((b) => b.id !== 8);
  return groupBalls.length > 0 ? groupBalls : active;
}

/** Угол прицела по умолчанию — на центр целевого шара (или null, если цели нет). */
export function aimAngleToTarget(state: BilliardsState): number | null {
  const cue = state.balls.find((b) => b.id === 0 && b.active);
  const target = pickTarget(state);
  return cue && target ? Math.atan2(target.y - cue.y, target.x - cue.x) : null;
}

function normalize(v: Point): Point {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

/** Пересечение луча с отрезком, сдвинутым внутрь поля на радиус шара. */
function rayOffsetSegment(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  segment: Segment,
): number | null {
  const ax = segment.a.x + segment.normal.x * BALL_RADIUS;
  const ay = segment.a.y + segment.normal.y * BALL_RADIUS;
  const bx = segment.b.x + segment.normal.x * BALL_RADIUS;
  const by = segment.b.y + segment.normal.y * BALL_RADIUS;
  const abx = bx - ax;
  const aby = by - ay;
  const det = -dx * aby + abx * dy;
  if (Math.abs(det) < EPS) return null;
  const acx = ax - ox;
  const acy = ay - oy;
  const t = (-acx * aby + abx * acy) / det;
  const s = (dx * acy - dy * acx) / det;
  if (t <= EPS || s < 0 || s > 1) return null;
  return t;
}

/** Ближайшее пересечение луча с кругом (радиус — расширение цели). */
function rayCircle(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  radius: number,
): number | null {
  const ocx = cx - ox;
  const ocy = cy - oy;
  const proj = ocx * dx + ocy * dy;
  if (proj < 0) return null;
  const d2 = ocx * ocx + ocy * ocy - proj * proj;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  const t = proj - Math.sqrt(r2 - d2);
  return t > EPS ? t : null;
}

/**
 * Трассировать траекторию битка по углу `angle` из текущего состояния.
 * Не симуляция: чистые пересечения луча с шарами, отрезками и лузами.
 */
export function traceAim(
  state: BilliardsState,
  angle: number,
  geometry: TableGeometry,
): AimTrace {
  const cue = state.balls.find((b) => b.id === 0 && b.active);
  if (!cue) return { path: [], hitBall: null };

  const pockets = geometry.pockets;
  const segments = geometry.segments;
  const others = state.balls.filter((b) => b.active && b.id !== 0);

  let px = cue.x;
  let py = cue.y;
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);
  const path: Point[] = [{ x: px, y: py }];
  let remaining = AIM_MAX_PATH;
  let firstHit: AimTrace["hitBall"] = null;

  for (let bounce = 0; bounce <= 8 && remaining > EPS; bounce += 1) {
    // Ближайший шар: центр битка не может подойти к чужому центру ближе 2R.
    let bestBall: { t: number; id: number; cx: number; cy: number } | null = null;
    for (const ball of others) {
      const t = rayCircle(px, py, dx, dy, ball.x, ball.y, 2 * BALL_RADIUS);
      if (t !== null && (bestBall === null || t < bestBall.t)) {
        bestBall = { t, id: ball.id, cx: ball.x, cy: ball.y };
      }
    }

    // Ближайший отрезок (носы/облицовки).
    let bestSeg: { t: number; normal: Point } | null = null;
    for (const segment of segments) {
      const t = rayOffsetSegment(px, py, dx, dy, segment);
      if (t !== null && (bestSeg === null || t < bestSeg.t)) {
        bestSeg = { t, normal: segment.normal };
      }
    }

    // Ближайшая луза (центр входит в зону захвата — бросок прерывается).
    let bestPocket: number | null = null;
    for (const pocket of pockets) {
      const t = rayCircle(
        px,
        py,
        dx,
        dy,
        pocket.center.x,
        pocket.center.y,
        pocket.mouth / 2 + pocket.capturePad,
      );
      if (t !== null && (bestPocket === null || t < bestPocket)) bestPocket = t;
    }

    // Что встретится раньше; за пределом пути — обрываем.
    let kind: "ball" | "segment" | "pocket" | null = null;
    let t = remaining;
    if (bestBall && bestBall.t < t) {
      t = bestBall.t;
      kind = "ball";
    }
    if (bestSeg && bestSeg.t < t) {
      t = bestSeg.t;
      kind = "segment";
    }
    if (bestPocket !== null && bestPocket < t) {
      t = bestPocket;
      kind = "pocket";
    }

    const ex = px + dx * t;
    const ey = py + dy * t;
    path.push({ x: ex, y: ey });
    remaining -= t;

    if (kind === "ball" && bestBall) {
      // Линия центров: целевой шар уходит по ней, биток — по касательной
      // составляющей. Порог отсекает почти касательные удары: там
      // направление битка физически неопределимо и «дёргалось» при мелкой
      // правке угла.
      const toBall = normalize({ x: bestBall.cx - ex, y: bestBall.cy - ey });
      const dot = dx * toBall.x + dy * toBall.y;
      const cuePerp = { x: dx - dot * toBall.x, y: dy - dot * toBall.y };
      const perpLen = Math.hypot(cuePerp.x, cuePerp.y);
      // Срез не имеет мёртвой зоны: порог в доли радиана заставляет гост
      // внезапно исчезать и появляться с другой стороны при малом изменении угла.
      const CUT_EPS = 1e-6;
      const cut = perpLen >= CUT_EPS
        ? { x: cuePerp.x / perpLen, y: cuePerp.y / perpLen }
        : null;

      // Продолжение пути битка после контакта: он идёт по касательной и может
      // отражаться от бортов — линия прицела не обрывается на призраке удара.
      if (firstHit !== null) return { path, hitBall: firstHit };
      firstHit = {
        ballId: bestBall.id,
        ghost: { x: ex, y: ey },
        targetDir: toBall,
        cueDir: cut,
        cueStrength: perpLen,
      };
      if (cut === null) {
        return { path, hitBall: firstHit };
      }
      // После контакта исключаем именно эту цель: иначе повторный тест луча
      // от граничной точки даёт нестабильное «повторное касание» и зубчатый
      // путь при малых изменениях угла.
      const hitIndex = others.findIndex((ball) => ball.id === bestBall.id);
      if (hitIndex >= 0) others.splice(hitIndex, 1);
      px = ex + cut.x * 0.1;
      py = ey + cut.y * 0.1;
      dx = cut.x;
      dy = cut.y;
      remaining = Math.max(0, remaining * perpLen - 0.1);
      continue;
    }
    if (kind === "segment" && bestSeg) {
      // Отскок по нормали внутрь поля с демпфированием, как в физике.
      const n = bestSeg.normal;
      const vn = dx * n.x + dy * n.y;
      const perpX = dx - vn * n.x;
      const perpY = dy - vn * n.y;
      const reflected = -E_RAIL * vn;
      const nd = normalize({
        x: perpX * TANG_KEEP_RAIL + reflected * n.x,
        y: perpY * TANG_KEEP_RAIL + reflected * n.y,
      });
      dx = nd.x;
      dy = nd.y;
      px = ex + dx * 0.1;
      py = ey + dy * 0.1;
      remaining -= 0.1; // сдвиг после отскока тоже входит в предел пути
      continue;
    }
    // Луза или предел пути — траектория закончена.
    return { path, hitBall: firstHit };
  }

  return { path, hitBall: firstHit };
}

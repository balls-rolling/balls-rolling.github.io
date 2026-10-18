// ИИ-противник 8-ball: чистый модуль без DOM. Выбор удара — перебор своих
// шаров × лузы через ghost-ball, отсев перекрытий и оценка трудности (срезка +
// дистанции); лучший **легальный** удар возвращается наружу. Исполнитель
// накладывает ошибку по навыку через seeded PRNG (`mulberry32`).
//
// Детерминизм (§5 требований): ни `Math.random`, ни времени. Шум выводится из
// seed партии и номера удара, порядок кандидатов фиксирован сортировкой с
// разрешением ничьих по id. Стоимость кандидата ограничена: перебор
// аналитический (без `applyShotWithLog`), состояние не симулируется.
import { BALL_RADIUS } from "./constants";
import type { Point, TableGeometry } from "./geometry";
import type { BallState, BilliardsState } from "./state";
import type { Shot } from "./physics";
import { legalTargets } from "./aim";
import { cueBallInHandPosition } from "./rules-8ball";

/** Кандидат удара: угол, сила и (при постановке битка) его точка. */
export interface AiCandidate {
  readonly angle: number;
  readonly power: number;
  readonly cueX?: number;
  readonly cueY?: number;
  readonly targetId: number;
  readonly pocketId: number;
}

/** План удара ИИ: что показать при прицеливании и что ударить. */
export interface ShotPlan {
  /**
   * Варианты для видимого прицеливания: худшие первыми, выбранный — последним,
   * чтобы прицел «остановился» на решении. Без шума.
   */
  readonly candidates: readonly AiCandidate[];
  /** Выбранный удар — лучший кандидат с наложенной ошибкой навыка. */
  readonly chosen: Shot;
}

/** Настройки исполнителя: навык 0..1 и источник шума (иначе — seed партии). */
export interface AiOptions {
  /** Навык 0..1: 1 — лучший, но всё равно с ошибкой (`σ_min > 0`). */
  readonly skill: number;
  /** Источник шума `[0,1)`; по умолчанию — seeded PRNG от seed партии. */
  readonly rng?: () => number;
}

/** Сколько вариантов показывать при видимом прицеливании. */
const MAX_SHOWN_CANDIDATES = 4;

/** Порог срезки: круче — удар неисполним (тонкая срезка без шансов). */
const MAX_CUT = (80 * Math.PI) / 180;

/** Вес срезки в метрике трудности (доминирует над дистанциями). */
const CUT_WEIGHT = 3;
const CUE_DIST_WEIGHT = 0.6;
const OBJ_DIST_WEIGHT = 1.2;

/** Сила удара: база плюс добавка за суммарную дистанцию, в границах. */
const POWER_BASE = 0.32;
const POWER_PER_DIST = 0.55;
const POWER_MIN = 0.22;
const POWER_MAX = 0.95;

/** Разброс угла, рад: при навыке 0 и минимальный при навыке 1 (`σ_min > 0`). */
const ANGLE_SIGMA_MIN = 0.004;
const ANGLE_SIGMA_RANGE = 0.08;
/** Разброс силы (доля 0..1). */
const POWER_SIGMA_MIN = 0.01;
const POWER_SIGMA_RANGE = 0.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Seeded PRNG mulberry32: один seed — одна последовательность (§5). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Гауссов шум (Бокс–Мюллер) из источника `[0,1)`; детерминирован. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Источник шума на удар: seed партии и номер удара. Один и тот же seed при
 * одном состоянии даёт один и тот же удар.
 */
function shotRng(state: BilliardsState): () => number {
  const seed = (state.seed * 0x9e3779b1 + state.shotSeq * 0x85ebca6b) >>> 0;
  return mulberry32(seed);
}

/** Ближайшая точка отрезка `ab` к точке `p`. */
function closestOnSegment(px: number, py: number, a: Point, b: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq <= 0) return { x: a.x, y: a.y };
  const t = clamp(((px - a.x) * abx + (py - a.y) * aby) / lengthSq, 0, 1);
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/** Свободен ли отрезок: ни один активный шар (кроме исключённых) не ближе диаметра. */
function segmentClear(
  a: Point,
  b: Point,
  balls: readonly BallState[],
  excluded: (id: number) => boolean,
): boolean {
  for (const ball of balls) {
    if (!ball.active || excluded(ball.id)) continue;
    const closest = closestOnSegment(ball.x, ball.y, a, b);
    if (Math.hypot(ball.x - closest.x, ball.y - closest.y) < 2 * BALL_RADIUS - 1e-6) {
      return false;
    }
  }
  return true;
}

/** Точка битка: явная (`explicit`) — уходит в удар как `cueX/cueY`. */
interface CueSpot {
  readonly x: number;
  readonly y: number;
  readonly explicit: boolean;
}

/**
 * Позиции битка для оценки. С руки (`ballInHand`) — точка постановки
 * (`cueBallInHandPosition`) и текущее место, обе явные: удар ИИ несёт координаты
 * (иначе сеть/сохранение не воспроизведут удар, урок `ui-behavior.md` п.6).
 */
function cueSpots(state: BilliardsState): readonly CueSpot[] {
  const cue = state.balls.find((b) => b.id === 0 && b.active);
  const inHand = cueBallInHandPosition(state.balls, state.mode);
  if (state.ballInHand) {
    const spots: CueSpot[] = [{ x: inHand.x, y: inHand.y, explicit: true }];
    if (cue) spots.push({ x: cue.x, y: cue.y, explicit: true });
    return spots;
  }
  if (cue) return [{ x: cue.x, y: cue.y, explicit: false }];
  return [{ x: inHand.x, y: inHand.y, explicit: true }];
}

/** Внутренний кандидат с метрикой трудности (меньше — лучше). */
interface ScoredCandidate extends AiCandidate {
  readonly score: number;
}

/** Перебрать свои шары × лузы и собрать исполнимые кандидаты. */
function collectCandidates(state: BilliardsState, geometry: TableGeometry): ScoredCandidate[] {
  const targets = legalTargets(state);
  if (targets.length === 0) return [];
  const out: ScoredCandidate[] = [];
  const length = geometry.length;
  for (const spot of cueSpots(state)) {
    for (const target of targets) {
      for (const pocket of geometry.pockets) {
        // Направление «шар → луза»: по нему шар уйдёт в лузу.
        const dx = pocket.center.x - target.x;
        const dy = pocket.center.y - target.y;
        const dObj = Math.hypot(dx, dy);
        if (dObj < 1e-6) continue;
        const ux = dx / dObj;
        const uy = dy / dObj;
        // Гост-шар: биток должен прийти в него с противоположной от лузы стороны
        // (на 2r позади шара), тогда импульс направит шар в лузу.
        const ghost: Point = { x: target.x - 2 * BALL_RADIUS * ux, y: target.y - 2 * BALL_RADIUS * uy };
        if (
          ghost.x < BALL_RADIUS ||
          ghost.x > length - BALL_RADIUS ||
          ghost.y < BALL_RADIUS ||
          ghost.y > geometry.width - BALL_RADIUS
        ) {
          continue;
        }
        const gdx = ghost.x - spot.x;
        const gdy = ghost.y - spot.y;
        const dCue = Math.hypot(gdx, gdy);
        if (dCue < 1e-6) continue;
        const cx = gdx / dCue;
        const cy = gdy / dCue;
        // Срезка: угол между направлением битка и линией центров (гост→шар = луза).
        const cosCut = cx * ux + cy * uy;
        if (cosCut <= 0) continue;
        const cut = Math.acos(Math.min(1, cosCut));
        if (cut > MAX_CUT) continue;
        const from: Point = { x: spot.x, y: spot.y };
        // Путь битка до госта и путь целевого шара до лузы должны быть свободны.
        if (!segmentClear(from, ghost, state.balls, (id) => id === 0 || id === target.id)) continue;
        if (
          !segmentClear(
            { x: target.x, y: target.y },
            pocket.center,
            state.balls,
            (id) => id === target.id,
          )
        ) {
          continue;
        }
        const score = CUT_WEIGHT * cut + CUE_DIST_WEIGHT * (dCue / length) + OBJ_DIST_WEIGHT * (dObj / length);
        const power = clamp(POWER_BASE + (POWER_PER_DIST * (dCue + dObj)) / length, POWER_MIN, POWER_MAX);
        out.push({
          angle: Math.atan2(ghost.y - spot.y, ghost.x - spot.x),
          power,
          targetId: target.id,
          pocketId: pocket.id,
          score,
          ...(spot.explicit ? { cueX: spot.x, cueY: spot.y } : {}),
        });
      }
    }
  }
  return out;
}

/** Разбитие: открытый стол и ни одного применённого удара. */
function isBreakShot(state: BilliardsState): boolean {
  return state.phase === "open" && state.shotSeq === 0;
}

/**
 * Удар на разбитии: достаточно попасть в вершину пирамиды — забивать не
 * требуется (CONTEXT п.8). Прицел — по центру шара, сила максимальная.
 */
function breakCandidate(state: BilliardsState): ScoredCandidate | null {
  const apex = state.balls.find((b) => b.active && b.id === 1);
  if (!apex) return null;
  const spot = cueSpots(state)[0];
  if (!spot) return null;
  const dx = apex.x - spot.x;
  const dy = apex.y - spot.y;
  if (Math.hypot(dx, dy) < 1e-6) return null;
  return {
    angle: Math.atan2(dy, dx),
    power: 0.95,
    targetId: 1,
    pocketId: -1,
    score: -1,
    ...(spot.explicit ? { cueX: spot.x, cueY: spot.y } : {}),
  };
}

/** Кандидаты, лучший первым. Порядок детерминирован: ничьи — по id. */
function sortedCandidates(state: BilliardsState, geometry: TableGeometry): ScoredCandidate[] {
  const list = collectCandidates(state, geometry);
  // На разбитии первым идёт прямой удар по вершине: пирамида закрыта, забить
  // шар с разбития нельзя, но удар обязан быть.
  if (isBreakShot(state)) {
    const brk = breakCandidate(state);
    if (brk) list.push(brk);
  }
  list.sort(
    (a, b) => a.score - b.score || a.targetId - b.targetId || a.pocketId - b.pocketId,
  );
  return list;
}

/** Публичный кандидат без внутренней метрики. */
function toPublic(candidate: ScoredCandidate): AiCandidate {
  const base: AiCandidate = {
    angle: candidate.angle,
    power: candidate.power,
    targetId: candidate.targetId,
    pocketId: candidate.pocketId,
  };
  return candidate.cueX !== undefined && candidate.cueY !== undefined
    ? { ...base, cueX: candidate.cueX, cueY: candidate.cueY }
    : base;
}

/** Кандидаты для показа/тестов: без метрики, лучший первым. */
export function candidateShots(
  state: BilliardsState,
  geometry: TableGeometry,
): readonly AiCandidate[] {
  return sortedCandidates(state, geometry).map(toPublic);
}

/** Наложить ошибку навыка на выбранный кандидат. */
function applyNoise(best: ScoredCandidate, skill: number, rng: () => number): Shot {
  const safeSkill = clamp(skill, 0, 1);
  const sigmaAngle = ANGLE_SIGMA_MIN + (1 - safeSkill) * ANGLE_SIGMA_RANGE;
  const sigmaPower = POWER_SIGMA_MIN + (1 - safeSkill) * POWER_SIGMA_RANGE;
  const angle = best.angle + gaussian(rng) * sigmaAngle;
  const power = clamp(best.power + gaussian(rng) * sigmaPower, 0.05, 1);
  if (best.cueX !== undefined && best.cueY !== undefined) {
    return { angle, power, cueX: best.cueX, cueY: best.cueY };
  }
  return { angle, power };
}

/**
 * Запасной легальный удар, когда забить нечем (нет исполнимого кандидата):
 * просто попасть по ближайшей легальной цели со средней силой. Так ИИ играет
 * «плохой, но легальный» удар вместо зависания (CONTEXT п.9: safety play не
 * делаем). `null` — легальных целей нет вовсе.
 */
function directHitCandidate(state: BilliardsState): ScoredCandidate | null {
  const targets = legalTargets(state);
  if (targets.length === 0) return null;
  const spot = cueSpots(state)[0];
  if (!spot) return null;
  let best = targets[0]!;
  let bestD = Infinity;
  for (const target of targets) {
    const d = Math.hypot(target.x - spot.x, target.y - spot.y);
    if (d < bestD) {
      bestD = d;
      best = target;
    }
  }
  if (bestD < 1e-6) return null;
  return {
    angle: Math.atan2(best.y - spot.y, best.x - spot.x),
    power: 0.5,
    targetId: best.id,
    pocketId: -1,
    score: 0,
    ...(spot.explicit ? { cueX: spot.x, cueY: spot.y } : {}),
  };
}

/**
 * План удара ИИ: перебор, выбор лучшего легального и ошибка навыка. Если забить
 * нечем — запасной «плохой, но легальный» удар по ближайшей цели. `null` —
 * легальных целей нет вовсе (правила не дают цели).
 */
export function planShot(
  state: BilliardsState,
  geometry: TableGeometry,
  opts: AiOptions,
): ShotPlan | null {
  const list = sortedCandidates(state, geometry);
  const best = list[0] ?? directHitCandidate(state);
  if (!best) return null;
  const chosen = applyNoise(best, opts.skill, opts.rng ?? shotRng(state));
  // Запасной удар тоже показываем (перебор из одного варианта), иначе прицел
  // на ход компьютера был бы пустым.
  const shown = (list.length > 0 ? list : [best]).slice(0, MAX_SHOWN_CANDIDATES).map(toPublic);
  return { candidates: shown.reverse(), chosen };
}

/** Выбор удара ИИ (контракт `ChooseShot`): лучший легальный с ошибкой навыка. */
export function chooseShot(
  state: BilliardsState,
  geometry: TableGeometry,
  opts: AiOptions,
): Shot | null {
  return planShot(state, geometry, opts)?.chosen ?? null;
}

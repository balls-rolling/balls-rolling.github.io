// Физика бильярда: чистое ядро без DOM. Фиксированный шаг, субшаги по скорости,
// замороженный порядок «интеграция → захват луз → стол → пары → покой».
// Угловая скорость — часть состояния (`spin`): скольжение, срезка, зацеп борта
// и затухание бокового вращения считаются здесь; точка удара — фаза 07.
import {
  BALL_RADIUS,
  E_BALL,
  E_FACING,
  E_RAIL,
  GRAVITY,
  MAX_SHOT_SECONDS,
  MAX_SHOT_SPEED,
  PHYS_DT,
  POCKET_PULL,
  POS_SLOP,
  PUSH_FRACTION,
  ROLL_DECEL,
  SLEEP_SPEED,
  SUBSTEP_CAP,
  SUBSTEP_TRAVEL_FRACTION,
  TANG_KEEP_FACING,
  CUSHION_SPIN_GRAB,
  CUSHION_SPIN_KEEP,
  MU_BALL,
  MU_SLIDE,
  ROLL_SNAP_SPEED,
  SPIN_DECAY,
  SPIN_REST_SPEED,
  TABLE_LENGTH,
  TANG_KEEP_RAIL,
} from "./constants";
import {
  type Point,
  type PocketSpec,
  type Segment,
  type TableGeometry,
} from "./geometry";
import type { BallState, BilliardsState } from "./state";
import {
  ShotLogCollector,
  type ShotLog,
  type StepEvents,
} from "./shot-log";

/** Удар игрока: направление (радианы), сила (0..1) и, опционально, точка
 *  постановки битка в «кухне» перед первым ударом. */
export interface Shot {
  readonly angle: number;
  readonly power: number;
  readonly cueX?: number;
  readonly cueY?: number;
}

/** Внутреннее (мутабельное) состояние шара для шага. Оси: x вправо, y вниз
 *  (экран), z к зрителю (нормаль стола). Спин — угловая скорость, рад/с. */
interface SimBall {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  wx: number;
  wy: number;
  wz: number;
  active: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function speedOf(ball: SimBall): number {
  return Math.hypot(ball.vx, ball.vy);
}

function toSim(balls: readonly BallState[]): SimBall[] {
  return balls.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    vx: b.vx,
    vy: b.vy,
    wx: b.spin.x,
    wy: b.spin.y,
    wz: b.spin.z,
    active: b.active,
  }));
}

function toState(state: BilliardsState, balls: readonly SimBall[]): BilliardsState {
  return {
    ...state,
    balls: balls.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      spin: { x: b.wx, y: b.wy, z: b.wz },
      active: b.active,
    })),
  };
}

/** Момент инерции шара единичной массы (сфера 2/5·mR²). */
const INERTIA = 0.4 * BALL_RADIUS * BALL_RADIUS;

/** Затухание бокового вращения к нулю за шаг `h` (линейное, без перехода через ноль). */
function decaySpin(w: number, h: number): number {
  if (w === 0) return 0;
  const next = Math.abs(w) - SPIN_DECAY * h;
  return next <= 0 ? 0 : Math.sign(w) * next;
}

function integrate(balls: SimBall[], h: number): void {
  for (const ball of balls) {
    if (!ball.active) continue;
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;
    // Скорость точки контакта с сукном: v − R·(wy, −wx).
    const ux = ball.vx - BALL_RADIUS * ball.wy;
    const uy = ball.vy + BALL_RADIUS * ball.wx;
    const u = Math.hypot(ux, uy);
    if (u > ROLL_SNAP_SPEED) {
      // Скольжение: кулоновское трение разворачивает и крутит шар к качению.
      const fx = (-MU_SLIDE * GRAVITY * ux) / u;
      const fy = (-MU_SLIDE * GRAVITY * uy) / u;
      ball.vx += fx * h;
      ball.vy += fy * h;
      // Момент r×F при r = (0,0,−R): (R·Fy, −R·Fx, 0).
      ball.wx += ((BALL_RADIUS * fy) / INERTIA) * h;
      ball.wy += ((-BALL_RADIUS * fx) / INERTIA) * h;
    } else {
      // Качение: спин следует за скоростью, трение качения гасит движение.
      // `+ 0` гасит знаковый ноль (−0 !== 0 для toEqual).
      ball.wy = ball.vx / BALL_RADIUS + 0;
      ball.wx = -ball.vy / BALL_RADIUS + 0;
      const speed = speedOf(ball);
      if (speed > 0) {
        const next = Math.max(0, speed - ROLL_DECEL * h);
        const scale = next / speed;
        ball.vx *= scale;
        ball.vy *= scale;
      }
    }
    // Боковое вращение затухает всегда (и в скольжении, и в качении).
    ball.wz = decaySpin(ball.wz, h);
  }
}

function resolvePockets(
  balls: SimBall[],
  pockets: readonly PocketSpec[],
  h: number,
  onPocketed?: (ballId: number) => void,
): void {
  // Предикат — по требованиям: шар забит, когда центр пересёк линию проёма наружу
  // (outward > 0) и остался в створе, |lateral| < mouth/2 + capturePad. Проём лежит
  // на линии пера, поэтому «центр за линией» = «центр в лузе».
  // Между горлом (концы носа) и проёмом — щёки: центр шара за линией горла уже
  // над лузой, поэтому его затягивает к проёму (POCKET_PULL), иначе медленный шар
  // застрял бы в зеве.
  for (const ball of balls) {
    if (!ball.active) continue;
    for (const pocket of pockets) {
      const tx = (pocket.throatA.x + pocket.throatB.x) / 2;
      const ty = (pocket.throatA.y + pocket.throatB.y) / 2;
      const beyondThroat = (ball.x - tx) * pocket.outward.x + (ball.y - ty) * pocket.outward.y;
      if (beyondThroat > 0) {
        const lateralThroat = Math.abs(
          (ball.x - tx) * -pocket.outward.y + (ball.y - ty) * pocket.outward.x,
        );
        const throatHalf =
          Math.hypot(pocket.throatB.x - pocket.throatA.x, pocket.throatB.y - pocket.throatA.y) / 2;
        if (lateralThroat < throatHalf) {
          ball.vx += pocket.outward.x * POCKET_PULL * h;
          ball.vy += pocket.outward.y * POCKET_PULL * h;
        }
      }
      const dx = ball.x - pocket.center.x;
      const dy = ball.y - pocket.center.y;
      const outward = dx * pocket.outward.x + dy * pocket.outward.y;
      if (outward <= 0) continue;
      const lateral = dx * -pocket.outward.y + dy * pocket.outward.x;
      if (Math.abs(lateral) < pocket.mouth / 2 + pocket.capturePad) {
        ball.active = false;
        ball.vx = 0;
        ball.vy = 0;
        onPocketed?.(ball.id);
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

function resolveSegments(
  balls: SimBall[],
  segments: readonly Segment[],
  onRailContact?: (ballId: number) => void,
): void {
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
      onRailContact?.(ball.id);
      const isNose = segment.kind === "nose";
      const keep = isNose ? TANG_KEEP_RAIL : TANG_KEEP_FACING;
      const restitution = isNose ? E_RAIL : E_FACING;
      const perpX = ball.vx - vn * segment.normal.x;
      const perpY = ball.vy - vn * segment.normal.y;
      const reflected = -restitution * vn;
      ball.vx = perpX * keep + reflected * segment.normal.x;
      ball.vy = perpY * keep + reflected * segment.normal.y;
      if (isNose) {
        // Боковое вращение цепляется за борт: поверхность шара на стороне подушки
        // идёт со скоростью wz·R вдоль (k×o), трение разворачивает её в касательную.
        // Здесь (k×o) = −t касательной, поэтому вклад +GRAB·wz·R·t.
        const tx = -segment.normal.y;
        const ty = segment.normal.x;
        ball.vx += CUSHION_SPIN_GRAB * ball.wz * BALL_RADIUS * tx;
        ball.vy += CUSHION_SPIN_GRAB * ball.wz * BALL_RADIUS * ty;
        ball.wz *= CUSHION_SPIN_KEEP;
      }
    }
  }
}

interface BallContact {
  readonly ballId: number;
  readonly cuePoint: Point;
  readonly targetPoint: Point;
  readonly cueVelocity: Point;
  readonly targetVelocity: Point;
}

function resolvePairs(
  balls: SimBall[],
  onContact?: (contact: BallContact) => void,
  onAnyContact?: (aId: number, bId: number) => void,
): void {
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
      onAnyContact?.(a.id, b.id);
      const impulse = (-(1 + E_BALL) * vn) / 2;
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
      // Трение в контакте: в касательную скорость точки входит и боковое вращение
      // (waz+wbz дают вклад −R·(waz+wbz) вдоль касательной). Гасит относительное
      // движение (срезка/бросок), но не разворачивает его. Момент r×F крутит оба
      // шара вокруг нормали стола (переданный спин).
      const tx = -ny;
      const ty = nx;
      const vt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty - BALL_RADIUS * (a.wz + b.wz);
      const jt = Math.sign(vt) * Math.min(MU_BALL * 2 * impulse, Math.abs(vt));
      a.vx += (jt / 2) * tx;
      a.vy += (jt / 2) * ty;
      b.vx -= (jt / 2) * tx;
      b.vy -= (jt / 2) * ty;
      // На каждый шар приходится половина импульса: Δwz = R·(jt/2)/I.
      // Здесь jt — уже полное изменение относительной скорости (по шару jt/2).
      const dw = (BALL_RADIUS * (jt / 2)) / INERTIA;
      a.wz += dw;
      b.wz += dw;
      if (onContact && (a.id === 0 || b.id === 0)) {
        const cue = a.id === 0 ? a : b;
        const target = a.id === 0 ? b : a;
        // Точка битка в момент касания, а не после выталкивания из проникновения:
        // иначе гост рисуется внутри цели и предсказание дёргается с шагом.
        const sign = a.id === 0 ? 1 : -1;
        onContact({
          ballId: target.id,
          cuePoint: {
            x: target.x - sign * nx * 2 * BALL_RADIUS,
            y: target.y - sign * ny * 2 * BALL_RADIUS,
          },
          targetPoint: { x: target.x, y: target.y },
          cueVelocity: { x: cue.vx, y: cue.vy },
          targetVelocity: { x: target.vx, y: target.vy },
        });
      }
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
export function step(
  state: BilliardsState,
  geometry: TableGeometry,
  onBallContact?: (contact: BallContact) => void,
  events?: StepEvents,
): BilliardsState {
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
    resolvePockets(balls, geometry.pockets, h, events?.onPocketed);
    resolveSegments(balls, geometry.segments, events?.onRailContact);
    resolvePairs(balls, onBallContact, events?.onBallContact);
    settle(balls);
  }
  return toState(state, balls);
}

/** Все активные шары неподвижны: ни скорости, ни видимого вращения. */
export function isAtRest(state: BilliardsState): boolean {
  return state.balls.every(
    (b) =>
      !b.active ||
      (b.vx === 0 &&
        b.vy === 0 &&
        Math.abs(b.spin.x) < SPIN_REST_SPEED &&
        Math.abs(b.spin.y) < SPIN_REST_SPEED &&
        Math.abs(b.spin.z) < SPIN_REST_SPEED),
  );
}

/** Приложить удар к битку. Невалидный удар не меняет состояние. */
export function strike(state: BilliardsState, shot: Shot): BilliardsState {
  if (!isValidShot(shot)) return state;
  const speed = clamp(shot.power, 0, 1) * MAX_SHOT_SPEED;
  const vx = Math.cos(shot.angle) * speed;
  const vy = Math.sin(shot.angle) * speed;
  // Удар в центр: биток стартует скольжением без вращения; трение сукна само
  // докрутит его до качения (накат/оттяжка задаются точкой удара — фаза 07).
  return {
    ...state,
    balls: state.balls.map((b) =>
      b.id === 0 && b.active ? { ...b, vx, vy, spin: { x: 0, y: 0, z: 0 } } : b,
    ),
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
  geometry: TableGeometry,
  maxSeconds: number = MAX_SHOT_SECONDS,
): BilliardsState {
  let current = state;
  const limit = Math.ceil(maxSeconds / PHYS_DT);
  for (let i = 0; i < limit; i += 1) {
    if (isAtRest(current)) return current;
    current = step(current, geometry);
  }
  return current;
}

/** Удар и полный прогон до покоя — один «ход» ядра. */
export function applyShot(
  state: BilliardsState,
  shot: Shot,
  geometry: TableGeometry,
): BilliardsState {
  return simulateToRest(strike(state, shot), geometry);
}

/** Итог прогона с журналом: конечное состояние и побочный продукт шага. */
export interface ShotResult {
  readonly state: BilliardsState;
  readonly log: ShotLog;
}

/** Активный шар вне поля с запасом в радиус — наблюдаемый вылет со стола. */
function isOffTable(x: number, y: number, geometry: TableGeometry): boolean {
  return (
    x < -BALL_RADIUS ||
    x > geometry.length + BALL_RADIUS ||
    y < -BALL_RADIUS ||
    y > geometry.width + BALL_RADIUS
  );
}

/**
 * Прогон до покоя с журналом удара. Физика та же, что в `simulateToRest`:
 * журнал только наблюдает события шага, на состояние не влияет.
 */
export function simulateToRestWithLog(
  state: BilliardsState,
  geometry: TableGeometry,
  maxSeconds: number = MAX_SHOT_SECONDS,
): ShotResult {
  const collector = new ShotLogCollector();
  let current = state;
  const limit = Math.ceil(maxSeconds / PHYS_DT);
  for (let i = 0; i < limit; i += 1) {
    if (isAtRest(current)) break;
    current = step(current, geometry, undefined, {
      onBallContact: (aId, bId) => collector.noteBallContact(aId, bId),
      onRailContact: (ballId) => collector.noteRailContact(ballId),
      onPocketed: (ballId) => collector.notePocketed(ballId),
    });
  }
  for (const ball of current.balls) {
    if (ball.active && isOffTable(ball.x, ball.y, geometry)) collector.noteOffTable(ball.id);
  }
  return { state: current, log: collector.toLog() };
}

/** Удар и полный прогон до покоя с журналом — вход правил 8-ball. */
export function applyShotWithLog(
  state: BilliardsState,
  shot: Shot,
  geometry: TableGeometry,
): ShotResult {
  return simulateToRestWithLog(strike(state, shot), geometry);
}

/** Итог предпросмотра: ломаная пути битка, первый контакт и точка покоя (если дошли). */
export interface CuePreview {
  readonly path: readonly Point[];
  /** `false` — текущий путь ещё постепенно досчитывается. */
  readonly complete: boolean;
  /** id шара, в который попал биток первым; `null` — контакта не было. */
  readonly hitBallId: number | null;
  /** Данные первого контакта и мгновенные направления после импульса. */
  readonly contact: BallContact | null;
  /** Точка покоя битка; `null` — путь оборван лимитом (контакт/длина/время). */
  readonly rest: Point | null;
}

/** Настройки предпросмотра: короткий и дешёвый по умолчанию. */
export interface PreviewOptions {
  /** Предел симуляции, с. По умолчанию — короткий: предсказание, не реплей. */
  readonly maxSeconds?: number;
  /** Предел длины пути, мм. По умолчанию 2.5 длины стола. */
  readonly maxPathMm?: number;
  /** Сколько шагов физики продвигать за один вызов (бюджет кадра). */
  readonly budgetSteps?: number;
}

/** Живая сессия предпросмотра: уточняется по кадрам, а не за один проход. */
export interface PreviewSession {
  /** Текущее состояние симуляции предпросмотра (не состояние партии). */
  readonly state: BilliardsState;
  readonly shot: Shot;
  /** Геометрия стола, на которой считаются шаги предпросмотра. */
  readonly geometry: TableGeometry;
  /** Накопленные точки пути. */
  readonly path: readonly Point[];
  readonly travelled: number;
  /** id первого шара на пути; `null` — ещё не было контакта. */
  readonly hitBallId: number | null;
  /** Первый контакт для точного отображения ghost и направлений разлёта. */
  readonly contact: BallContact | null;
  /** Просчёт завершён: контакт, предел длины/времени или покой. */
  readonly done: boolean;
  /** Шагов физики пройдено (для «чем больше итераций — тем точнее»). */
  readonly steps: number;
}

export const PREVIEW_MAX_SECONDS = 1;
export const PREVIEW_MAX_PATH_MM = 2.5 * TABLE_LENGTH;
const PREVIEW_BUDGET_STEPS = 48;
const PREVIEW_SAMPLE_STEPS = 4;

/** Начать предпросмотр: удар применяется к копии состояния. */
export function previewStart(
  state: BilliardsState,
  shot: Shot,
  geometry: TableGeometry,
): PreviewSession {
  const sim = strike(state, shot);
  const cue = sim.balls.find((b) => b.id === 0);
  const path = cue && cue.active ? [{ x: cue.x, y: cue.y }] : [];
  return {
    state: sim,
    shot,
    geometry,
    path,
    travelled: 0,
    hitBallId: null,
    contact: null,
    done: !cue || !cue.active,
    steps: 0,
  };
}

/**
 * Продвинуть предпросмотр на бюджет шагов: одна порция за кадр — нагрузка
 * ограничена, а точность растёт с числом вызовов. Отдельный грубый результат
 * доступен сразу (первые порции), полный — после нескольких кадров.
 */
export function previewAdvance(
  session: PreviewSession,
  options: PreviewOptions = {},
): PreviewSession {
  if (session.done) return session;
  const maxSeconds = options.maxSeconds ?? PREVIEW_MAX_SECONDS;
  const maxPathMm = options.maxPathMm ?? PREVIEW_MAX_PATH_MM;
  const budget = Math.max(1, options.budgetSteps ?? PREVIEW_BUDGET_STEPS);
  const limit = Math.ceil(maxSeconds / PHYS_DT);

  let current = session.state;
  const path = [...session.path];
  let travelled = session.travelled;
  let hitBallId = session.hitBallId;
  let contact = session.contact;
  let steps = session.steps;
  let done = false;

  for (let i = 0; i < budget; i += 1) {
    const prevCue = current.balls.find((b) => b.id === 0);
    if (!prevCue || !prevCue.active) {
      done = true;
      break;
    }
    current = step(current, session.geometry, (hit) => {
      if (contact !== null) return;
      contact = hit;
      hitBallId = hit.ballId;
    });
    steps += 1;
    const cue = current.balls.find((b) => b.id === 0);
    if (!cue || !cue.active) {
      done = true;
      break;
    }
    if (contact) {
      const toContact = Math.hypot(contact.cuePoint.x - prevCue.x, contact.cuePoint.y - prevCue.y);
      if (travelled + toContact >= maxPathMm && toContact > 0) {
        const t = (maxPathMm - travelled) / toContact;
        path.push({
          x: prevCue.x + (contact.cuePoint.x - prevCue.x) * t,
          y: prevCue.y + (contact.cuePoint.y - prevCue.y) * t,
        });
        travelled = maxPathMm;
        hitBallId = null;
        contact = null;
        done = true;
        break;
      }
      travelled += toContact;
      path.push(contact.cuePoint);
      done = true;
      break;
    }
    const moved = Math.hypot(cue.x - prevCue.x, cue.y - prevCue.y);
    if (travelled + moved >= maxPathMm && moved > 0) {
      const t = (maxPathMm - travelled) / moved;
      path.push({ x: prevCue.x + (cue.x - prevCue.x) * t, y: prevCue.y + (cue.y - prevCue.y) * t });
      travelled = maxPathMm;
      done = true;
      break;
    }
    travelled += moved;
    if (steps % PREVIEW_SAMPLE_STEPS === 0) path.push({ x: cue.x, y: cue.y });
    if (steps >= limit || isAtRest(current)) {
      path.push({ x: cue.x, y: cue.y });
      done = true;
      break;
    }
  }

  return {
    state: current,
    shot: session.shot,
    geometry: session.geometry,
    path,
    travelled,
    hitBallId,
    contact,
    done,
    steps,
  };
}

/**
 * Полный предпросмотр за один вызов (для тестов и разовых нужд). В интерфейсе
 * используется инкрементальный путь (`previewStart`/`previewAdvance`), чтобы не
 * грузить кадр. Прогон тем же ядром, что и удар; состояние не мутируется.
 */
export function previewCuePath(
  state: BilliardsState,
  shot: Shot,
  geometry: TableGeometry,
  options: PreviewOptions = {},
): CuePreview {
  let session = previewStart(state, shot, geometry);
  const guard = 10_000;
  let iterations = 0;
  while (!session.done && iterations < guard) {
    session = previewAdvance(session, { ...options, budgetSteps: 240 });
    iterations += 1;
  }
  const rest = session.done ? finalRest(session) : null;
  return {
    path: session.path,
    complete: session.done,
    hitBallId: session.hitBallId,
    contact: session.contact,
    rest,
  };
}

/** Точка покоя, если путь закончился именно покоем (не контактом и не пределом). */
function finalRest(session: PreviewSession): Point | null {
  if (session.hitBallId !== null) return null;
  const cue = session.state.balls.find((b) => b.id === 0);
  if (!cue || !cue.active || !isAtRest(session.state)) return null;
  return { x: cue.x, y: cue.y };
}

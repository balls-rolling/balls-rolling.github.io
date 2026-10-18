// Чистый разбор удара 8-ball: журнал событий + состояние до удара → состояние после.
// Функция не читает траекторию и не пишет служебных флагов в шары: только
// состояние до удара, журнал и настройка правил.
//
// Разбитие определяется минимально: `phase === "open" && shotSeq === 0`.
// На разбитии фолы «первый контакт» и «без борта» не применяются, контакт
// любой (включая промах); 8 на разбитии — НЕ победа: 8 возвращается на ножное
// пятно (или ближайшую свободную точку по линии к центру), стол остаётся
// открыт, ход у разбивавшего.
// При открытом столе первый контакт с 8 — фол (§6: неверный первый контакт;
// легальной цели-8 при открытом столе нет).
// Неправильная 8 в простых правилах: фол + партия продолжается, 8 остаётся
// забитой (казуальный смысл: 8 потеряна, доигрываем группы).
// Биток с руки после фола ставится на головное пятно (или рядом, если занята)
// без пересечений с шарами; двигать его игроком — задача экранов (подфаза 02-b).
import {
  BALL_DIAMETER,
  CENTER_SPOT,
  FOOT_SPOT,
  HEAD_SPOT,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from "./constants";
import { getMode } from "./modes/registry";
import type { ShotLog } from "./shot-log";
import { kindOf } from "./balls";
import type { BallState, BallGroup, BilliardsState, EightBallRules } from "./state";

/** Настройки разбора удара (пока только вариант правил неправильной 8). */
export interface ResolveSettings {
  readonly rules: EightBallRules;
}

/** Итог классификации удара: фол ли, забил ли свой легально, исход 8. */
interface ShotVerdict {
  /** Произошёл фол (скрач, неверный контакт, без борта, вылет). */
  readonly foul: boolean;
  /** Легально забит свой шар (или любой групповой при открытом столе). */
  readonly scoredOwn: boolean;
  /** 8 забита этим ударом. */
  readonly eightPocketed: boolean;
  /** 8 забита легально (группа зачищена до удара, без фола, контакт с 8). */
  readonly eightLegal: boolean;
  /** 8 забита неправильно (рано или с фолом). */
  readonly eightWrong: boolean;
}

/** Забит ли шар своей группы (при открытом столе — любой групповой шар). */
function isOwnBall(ballId: number, group: BallGroup | null): boolean {
  const kind = kindOf(ballId);
  if (group === null) return kind === "solid" || kind === "stripe";
  return (group === "solid" && kind === "solid") || (group === "stripe" && kind === "stripe");
}

/** Группа бьющего; `null` — стол открыт (группы не назначены). */
function shooterGroup(state: BilliardsState): BallGroup | null {
  if (state.phase !== "assigned" || state.groups === null) return null;
  const shooter = state.order[state.turn] ?? null;
  if (shooter === null) return null;
  return state.groups[shooter] ?? null;
}

/** Группа зачищена: ни одного активного шара группы на столе до удара. */
function isGroupCleared(state: BilliardsState, group: BallGroup): boolean {
  return !state.balls.some((b) => b.active && kindOf(b.id) === group);
}

/**
 * Группа зачищается этим ударом: до удара шары группы были, а после удара
 * (с учётом забитых/вылетевших) не осталось ни одного.
 */
function isGroupClearedByShot(
  state: BilliardsState,
  log: ShotLog,
  group: BallGroup,
): boolean {
  const gone = new Set([...log.pocketedIds, ...log.offTableIds]);
  return !state.balls.some(
    (b) => b.active && kindOf(b.id) === group && !gone.has(b.id),
  );
}

/** Разбитие ли это: открытый стол и ни одного применённого удара. */
function isBreak(state: BilliardsState): boolean {
  return state.phase === "open" && state.shotSeq === 0;
}

/** Легален ли первый контакт (на разбитии — любой). */
function isFirstContactLegal(
  state: BilliardsState,
  log: ShotLog,
  group: BallGroup | null,
  isBreakShot: boolean,
): boolean {
  if (isBreakShot) return true;
  const first = log.firstContactId;
  if (first === null) return false;
  const kind = kindOf(first);
  if (state.phase === "open") return kind === "solid" || kind === "stripe";
  if (group === null) return kind === "solid" || kind === "stripe";
  if (isGroupCleared(state, group)) return kind === "eight";
  return (group === "solid" && kind === "solid") || (group === "stripe" && kind === "stripe");
}

/** Фол «без борта»: был контакт, борта после него не было и никто не забит. */
function isNoRailFoul(log: ShotLog): boolean {
  if (log.firstContactId === null) return false;
  if (log.railAfterContact) return false;
  return !log.pocketedIds.some((id) => id !== 0);
}

/** Собрать вердикт удара: фолы, свои забитые, исход 8. */
function classifyShot(
  state: BilliardsState,
  log: ShotLog,
  group: BallGroup | null,
  isBreakShot: boolean,
): ShotVerdict {
  const eightPocketed = log.pocketedIds.includes(8);
  const firstContactLegal = isFirstContactLegal(state, log, group, isBreakShot);
  const noRailFoul = !isBreakShot && isNoRailFoul(log);
  const foul =
    log.cueScratched ||
    !firstContactLegal ||
    noRailFoul ||
    log.offTableIds.length > 0;
  const scoredOwn =
    !foul &&
    log.pocketedIds.some((id) => id !== 0 && id !== 8 && isOwnBall(id, group));
  // Легальная 8: без фола, не разбитие, и группа зачищена — до удара либо этим
  // же ударом (8 вместе с последним своим шаром = победа, логика WPA; решение
  // пользователя 2026-10-16). Первый контакт: при зачищенной группе — 8,
  // при зачистке этим ударом — свой шар (законность контакта уже даёт `foul`).
  const clearedBefore = group !== null && isGroupCleared(state, group);
  const clearedNow =
    group !== null && !clearedBefore && isGroupClearedByShot(state, log, group);
  const eightLegal =
    eightPocketed &&
    !isBreakShot &&
    !foul &&
    (clearedBefore ? log.firstContactId === 8 : clearedNow);
  const eightWrong = eightPocketed && !eightLegal && !isBreakShot;
  return { foul, scoredOwn, eightPocketed, eightLegal, eightWrong };
}

/** Назначить группы первым легально забитым шаром (8 игнорируется). */
function assignedGroups(
  state: BilliardsState,
  log: ShotLog,
  foul: boolean,
  isBreakShot: boolean,
): BilliardsState["groups"] {
  if (foul || isBreakShot) return state.groups;
  if (state.phase !== "open" || state.groups !== null) return state.groups;
  const first = log.pocketedIds.find((id) => id !== 0 && id !== 8);
  if (first === undefined) return state.groups;
  const kind = kindOf(first);
  if (kind !== "solid" && kind !== "stripe") return state.groups;
  const shooter = state.order[state.turn] ?? null;
  if (shooter === null) return state.groups;
  const mine: BallGroup = kind;
  const theirs: BallGroup = kind === "solid" ? "stripe" : "solid";
  const groups: Record<string, BallGroup> = {};
  for (const player of state.order) {
    groups[player] = player === shooter ? mine : theirs;
  }
  return groups;
}

/** Следующий ход: забил свой — тот же, иначе — дальше по очереди (`order`). */
function nextTurn(state: BilliardsState, stay: boolean): number {
  if (stay || state.order.length === 0) return state.turn;
  return (state.turn + 1) % state.order.length;
}

/** Диаметр шара режима (допуск переставки); неизвестный режим — канон. */
function ballDiameterOf(modeId: string): number {
  const found = getMode(modeId)?.balls.diameter;
  return typeof found === "number" && found > 0 ? found : BALL_DIAMETER;
}

/** В пределах игрового поля с запасом в радиус. */
function insideTable(x: number, y: number, radius: number): boolean {
  return x >= radius && x <= TABLE_LENGTH - radius && y >= radius && y <= TABLE_WIDTH - radius;
}

/**
 * Свободна ли точка: ни один активный шар (кроме переставляемого) не
 * пересекается с шаром в этой точке. Допуск — диаметр из конфига режима.
 */
function isSpotFree(
  x: number,
  y: number,
  balls: readonly BallState[],
  diameter: number,
  excludedId: number,
): boolean {
  for (const b of balls) {
    if (!b.active || b.id === excludedId) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    if (dx * dx + dy * dy < diameter * diameter - 1e-9) return false;
  }
  return true;
}

/** Обнулить движение шара (переставленный шар покоится). */
function resting(ball: BallState, x: number, y: number): BallState {
  return { ...ball, active: true, x, y, vx: 0, vy: 0, spin: { x: 0, y: 0, z: 0 } };
}

/**
 * Переставка 8 после разбития: ножное пятно; занято — ближайшее свободное
 * место по линии к центру, дальше — от пятна в обратную сторону.
 */
export function respotEightPosition(
  balls: readonly BallState[],
  modeId: string,
): { readonly x: number; readonly y: number } {
  const diameter = ballDiameterOf(modeId);
  const radius = diameter / 2;
  if (isSpotFree(FOOT_SPOT.x, FOOT_SPOT.y, balls, diameter, 8)) return { ...FOOT_SPOT };
  const dx = CENTER_SPOT.x - FOOT_SPOT.x;
  const dy = CENTER_SPOT.y - FOOT_SPOT.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const step = radius;
  // К центру от пятна.
  for (let d = step; d <= len + 1e-9; d += step) {
    const x = FOOT_SPOT.x + ux * d;
    const y = FOOT_SPOT.y + uy * d;
    if (insideTable(x, y, radius) && isSpotFree(x, y, balls, diameter, 8)) return { x, y };
  }
  // От пятна в обратную сторону (к задней рейке).
  for (let d = step; ; d += step) {
    const x = FOOT_SPOT.x - ux * d;
    const y = FOOT_SPOT.y - uy * d;
    if (!insideTable(x, y, radius)) break;
    if (isSpotFree(x, y, balls, diameter, 8)) return { x, y };
  }
  return { ...FOOT_SPOT };
}

/**
 * Стартовая точка битка с руки: головное пятно; занято — ближайшая свободная
 * точка кольцами вокруг него. Позиция появляется на подготовке хода, а не в
 * разборе правил (CONTEXT «Цикл хода»), поэтому это подсказка для игры/UI.
 */
export function cueBallInHandPosition(
  balls: readonly BallState[],
  modeId: string,
): { readonly x: number; readonly y: number } {
  const diameter = ballDiameterOf(modeId);
  const radius = diameter / 2;
  if (isSpotFree(HEAD_SPOT.x, HEAD_SPOT.y, balls, diameter, 0)) return { ...HEAD_SPOT };
  const step = diameter;
  for (let ring = 1; ring <= 40; ring += 1) {
    const r = ring * step;
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * 2 * Math.PI;
      const x = HEAD_SPOT.x + r * Math.cos(a);
      const y = HEAD_SPOT.y + r * Math.sin(a);
      if (!insideTable(x, y, radius)) continue;
      if (isSpotFree(x, y, balls, diameter, 0)) return { x, y };
    }
  }
  return { ...HEAD_SPOT };
}



/**
 * Разобрать удар по журналу. Возвращает новое состояние: забитые/вылетевшие
 * шары гасятся, очередь/группы/фаза/победитель — по правилам 8-ball выше.
 */
export function resolveShot(
  before: BilliardsState,
  log: ShotLog,
  settings?: ResolveSettings,
): BilliardsState {
  if (before.finished) return before;
  const rules = settings?.rules ?? before.rules;
  // `before` — состояние после удара: забитые и вылетевшие уже неактивны. Разбор
  // должен видеть шары такими, какими они были до удара (иначе последний свой
  // шар выглядит как зачистка группы до удара и даёт фол).
  const gone = new Set([...log.pocketedIds, ...log.offTableIds]);
  const shotStart: BilliardsState = {
    ...before,
    balls: before.balls.map((b) => (gone.has(b.id) ? { ...b, active: true } : b)),
  };
  const isBreakShot = isBreak(before);
  const group = shooterGroup(before);
  const verdict = classifyShot(shotStart, log, group, isBreakShot);

  // Забитые и вылетевшие остаются забитыми (шары не возвращаются),
  // кроме переставки 8 на разбитии и битка с руки после фола (см. ниже).
  const balls = before.balls.map((b) => (gone.has(b.id) ? { ...b, active: false } : b));

  // Переставка 8 на разбитии: возвращается на ножное пятно (или точку у линии),
  // стол открыт, ход у разбивавшего (исход ниже — обычная ветка).
  const respot =
    isBreakShot && verdict.eightPocketed
      ? respotEightPosition(balls, before.mode)
      : null;
  const spotted: readonly BallState[] =
    respot === null
      ? balls
      : balls.map((b) => (b.id === 8 ? resting(b, respot.x, respot.y) : b));

  // Права подготовки следующего хода: позиционировать биток можно, только если
  // его нет на столе (скраш) — тогда он появится на подготовке, в разрешённой
  // точке. Выбор шара в роли битка у 8-ball нет (BACKLOG, будущие режимы).
  const finishedPrep: BilliardsState["prep"] = {
    canPlaceCue: false,
    canChooseCueBall: false,
  };

  // Победа: легальная 8 после зачистки.
  if (verdict.eightLegal) {
    const winner = before.order[before.turn] ?? null;
    return {
      ...before,
      balls: spotted,
      phase: "finished",
      finished: true,
      winner,
      finishReason: "eightBall",
      ballInHand: false,
      turnReason: "pottedOwn",
      prep: finishedPrep,
      shotSeq: before.shotSeq + 1,
    };
  }

  // Неправильная 8: турнирные — поражение; простые — фол с перестановкой 8.
  if (verdict.eightWrong) {
    if (rules === "tournament") {
      const winner =
        before.order.length > 0
          ? (before.order[(before.turn + 1) % before.order.length] ?? null)
          : null;
      return {
        ...before,
        balls: spotted,
        phase: "finished",
        finished: true,
        winner,
        finishReason: "foulOnEight",
        ballInHand: false,
        turnReason: "pottedOther",
        prep: finishedPrep,
        shotSeq: before.shotSeq + 1,
      };
    }
    // Простые: 8 возвращается на стол (ножное пятно или ближайшее свободное
    // место), фол, ход переходит, бьющий играет с руки (решение пользователя
    // 2026-10-17). Право позиционировать биток даёт фол, а не факт его забития:
    // новый бьющий играет с руки в любом случае.
    const spot = respotEightPosition(balls, before.mode);
    const restored: readonly BallState[] = balls.map((b) =>
      b.id === 8 ? resting(b, spot.x, spot.y) : b,
    );
    return {
      ...before,
      balls: restored,
      turn: nextTurn(before, false),
      ballInHand: true,
      turnReason: "foul",
      prep: { canPlaceCue: true, canChooseCueBall: false },
      shotSeq: before.shotSeq + 1,
    };
  }

  // Обычный исход: фол → смена + биток с руки; свой → ходит снова; иначе смена.
  // На разбитии без фола ход остаётся у разбивавшего, если хоть что-то забито
  // (включая только-8: 8 на разбитии — не победа, стол открыт, 8 переставлена).
  const foul = verdict.foul;
  // Фол даёт новому бьющему игру с руки независимо от того, куда ушёл биток:
  // если он остался на столе, его можно переставить (решение 2026-10-17).
  const prep: BilliardsState["prep"] = {
    canPlaceCue: foul || !spotted.some((b) => b.id === 0 && b.active),
    canChooseCueBall: false,
  };
  const pottedSomething = log.pocketedIds.some((id) => id !== 0);
  const stay = !foul && (verdict.scoredOwn || (isBreakShot && pottedSomething));
  const groups = assignedGroups(before, log, foul, isBreakShot);
  const phase: BilliardsState["phase"] = groups !== null ? "assigned" : before.phase;
  return {
    ...before,
    balls: spotted,
    groups,
    phase,
    turn: nextTurn(before, stay),
    ballInHand: foul,
    turnReason: turnReasonOf({
      isBreakShot,
      foul,
      stay,
      scoredOwn: verdict.scoredOwn,
      pottedSomething,
    }),
    prep,
    shotSeq: before.shotSeq + 1,
  };
}

/** Причина передачи хода — основа плашки перехода (CONTEXT «Цикл хода»). */
function turnReasonOf(args: {
  readonly isBreakShot: boolean;
  readonly foul: boolean;
  readonly stay: boolean;
  readonly scoredOwn: boolean;
  readonly pottedSomething: boolean;
}): BilliardsState["turnReason"] {
  if (args.isBreakShot && args.pottedSomething) return "break";
  if (args.foul) return "foul";
  if (args.stay && args.scoredOwn) return "pottedOwn";
  // Ничего не забито — ход просто переходит; «забил чужой» здесь неправда.
  return args.pottedSomething ? "pottedOther" : "noPocket";
}

// Состояние партии бильярда и его сериализация (раунд-трип сохранений).
import type { GameState } from "@/core/game";
import { DEFAULT_SEED } from "./constants";
import { getMode } from "./modes/registry";
import type { ModeConfig } from "./modes/types";
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

/** Настройка правил 8-ball: разница только в исходе неправильной 8. */
export type EightBallRules = "simple" | "tournament";

/** Группа шаров игрока в 8-ball. */
export type BallGroup = "solid" | "stripe";

/** Статус партии: открытый стол, группы назначены, партия завершена. */
export type TablePhase = "open" | "assigned" | "finished";

/** Причина финиша: легальная 8 или фол/ранняя 8 (проигрыш в турнирных). */
export type FinishReason = "eightBall" | "foulOnEight";

/**
 * Причина передачи хода: разбитие, фол, продолжение после своего шара, переход
 * после чужого шара. Разбор лога предыдущего удара определяет начальные условия
 * следующего хода (CONTEXT «Цикл хода»).
 */
export type TurnReason =
  | "initial"
  | "break"
  | "foul"
  | "pottedOwn"
  | "pottedOther"
  | "noPocket";

/**
 * Права подготовки следующего удара. `canPlaceCue` — можно ли позиционировать
 * биток; `canChooseCueBall` — можно ли выбирать шар в роли битка (у 8-ball
 * всегда `false`: биток один, выбор шара — будущие режимы, см. BACKLOG).
 */
export interface PrepPermissions {
  readonly canPlaceCue: boolean;
  readonly canChooseCueBall: boolean;
}

/** Состояние партии бильярда. */
export interface BilliardsState extends GameState {
  readonly version: 2;
  /** id режима: геометрия/шары выводятся из реестра детерминированно. */
  readonly mode: string;
  readonly seed: number;
  readonly order: readonly string[];
  readonly turn: number;
  readonly balls: readonly BallState[];
  readonly finished: boolean;
  /** Назначение групп по playerId; `null` — стол открыт. */
  readonly groups: Readonly<Record<string, BallGroup>> | null;
  readonly rules: EightBallRules;
  readonly phase: TablePhase;
  /** Победитель; `null` — партия не завершена (или причина неизвестна). */
  readonly winner: string | null;
  readonly finishReason: FinishReason | null;
  /** Биток с руки после фола. */
  readonly ballInHand: boolean;
  /**
   * Причина передачи хода: разбор предыдущего удара определяет, кто ходит и с
   * какими правами подготовки (CONTEXT «Цикл хода»). Нужна сети и сохранению,
   * чтобы следующий ход начался с теми же условиями.
   */
  readonly turnReason: TurnReason;
  /** Права подготовки следующего удара. */
  readonly prep: PrepPermissions;
  /** Счётчик применённых ударов, старт 0 (задел под сеть 02-d). */
  readonly shotSeq: number;
}

/** Необязательные параметры стартового состояния 8-ball. */
export interface CreateStateOptions {
  readonly rules?: EightBallRules;
}

/** Начальное состояние: раскладка по параметрам режима, биток на головном пятне. */
export function createInitialState(
  config: ModeConfig,
  playerIds: readonly string[],
  seed: number = DEFAULT_SEED,
  options: CreateStateOptions = {},
): BilliardsState {
  const placements = [...rackPlacements(config)].sort((a, b) => a.id - b.id);
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
  return {
    version: 2,
    mode: config.id,
    seed,
    order,
    turn: 0,
    balls,
    finished: false,
    groups: null,
    rules: options.rules ?? "simple",
    phase: "open",
    winner: null,
    finishReason: null,
    ballInHand: false,
    turnReason: "initial",
    prep: { canPlaceCue: true, canChooseCueBall: false },
    shotSeq: 0,
  };
}

/** Сериализовать состояние в JSON-safe plain-данные. */
export function serializeBilliardsState(state: BilliardsState): unknown {
  return {
    version: state.version,
    mode: state.mode,
    seed: state.seed,
    order: [...state.order],
    turn: state.turn,
    finished: state.finished,
    groups: state.groups === null ? null : { ...state.groups },
    rules: state.rules,
    phase: state.phase,
    winner: state.winner,
    finishReason: state.finishReason,
    ballInHand: state.ballInHand,
    turnReason: state.turnReason,
    prep: { ...state.prep },
    shotSeq: state.shotSeq,
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

/**
 * Восстановить состояние; `null` — данные непригодны. Формат версии 1 не
 * поддерживается: сериализованных партий старого формата нет (незакоммиченный
 * спринт), а формат заморозим перед сетевой фазой.
 *
 * Дефолты новых полей 8-ball (записи `version: 2` без них читаются):
 * `groups: null` (стол открыт), `rules: "simple"`, `phase` — `"finished"` при
 * `finished: true`, иначе `"open"`, `winner: null`, `finishReason: null`,
 * `ballInHand: false`, `shotSeq: 0`.
 */
export function deserializeBilliardsState(data: unknown): BilliardsState | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.version !== 2) return null;

  const mode = d.mode;
  if (typeof mode !== "string") return null;
  const config = getMode(mode);
  if (!config) return null;
  const expectedBalls = config.balls.colors.length;

  const seed = d.seed;
  const turn = d.turn;
  const finished = d.finished;
  if (!isFiniteNumber(seed)) return null;
  if (!isFiniteNumber(turn)) return null;
  if (typeof finished !== "boolean") return null;
  if (!Array.isArray(d.order) || !d.order.every((v) => typeof v === "string")) return null;
  if (!Array.isArray(d.balls) || d.balls.length !== expectedBalls) return null;

  const balls: BallState[] = [];
  for (let i = 0; i < expectedBalls; i += 1) {
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

  const groups = parseGroups(d.groups);
  const rules = parseRules(d.rules);
  const phase = parsePhase(d.phase, finished);
  const winner = parseWinner(d.winner);
  const finishReason = parseFinishReason(d.finishReason);
  const ballInHand = parseBallInHand(d.ballInHand);
  const turnReason = parseTurnReason(d.turnReason);
  const prep = parsePrep(d.prep);
  const shotSeq = parseShotSeq(d.shotSeq);
  if (
    groups === undefined ||
    rules === undefined ||
    phase === undefined ||
    winner === undefined ||
    finishReason === undefined ||
    ballInHand === undefined ||
    turnReason === undefined ||
    prep === undefined ||
    shotSeq === undefined
  ) {
    return null;
  }

  return {
    version: 2,
    mode,
    seed,
    order: [...(d.order as string[])],
    turn,
    balls,
    finished,
    groups,
    rules,
    phase,
    winner,
    finishReason,
    ballInHand,
    turnReason,
    prep,
    shotSeq,
  };
}

/** `undefined` — поле битое (запись отвергается). */
function parseGroups(value: unknown): Readonly<Record<string, BallGroup>> | null | undefined {
  // Отсутствие поля — старый снимок: стол открыт.
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, BallGroup> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== "solid" && v !== "stripe") return undefined;
    out[k] = v;
  }
  return out;
}

/** `undefined` — поле битое (запись отвергается). */
function parseRules(value: unknown): EightBallRules | undefined {
  if (value === undefined) return "simple";
  return value === "simple" || value === "tournament" ? value : undefined;
}

/** `undefined` — поле битое (запись отвергается). */
function parsePhase(value: unknown, finished: boolean): TablePhase | undefined {
  if (value === undefined) return finished ? "finished" : "open";
  return value === "open" || value === "assigned" || value === "finished" ? value : undefined;
}

/** `undefined` — поле битое (запись отвергается). */
function parseWinner(value: unknown): string | null | undefined {
  if (value === undefined) return null;
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

/** `undefined` — поле битое (запись отвергается). */
function parseFinishReason(value: unknown): FinishReason | null | undefined {
  if (value === undefined) return null;
  if (value === null) return null;
  return value === "eightBall" || value === "foulOnEight" ? value : undefined;
}

/** `undefined` — поле битое (запись отвергается). */
function parseBallInHand(value: unknown): boolean | undefined {
  if (value === undefined) return false;
  return typeof value === "boolean" ? value : undefined;
}

/** `undefined` — поле битое (запись отвергается). */
function parseShotSeq(value: unknown): number | undefined {
  if (value === undefined) return 0;
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0 ? value : undefined;
}

const TURN_REASONS: readonly TurnReason[] = [
  "initial",
  "break",
  "foul",
  "pottedOwn",
  "pottedOther",
  "noPocket",
];

/** Отсутствие поля — старый снимок: причина старта партии. */
function parseTurnReason(value: unknown): TurnReason | undefined {
  if (value === undefined) return "initial";
  return TURN_REASONS.includes(value as TurnReason) ? (value as TurnReason) : undefined;
}

/** Старый снимок без прав подготовки: позиционировать битка нельзя, биток на столе. */
function parsePrep(value: unknown): PrepPermissions | undefined {
  if (value === undefined) return { canPlaceCue: false, canChooseCueBall: false };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  const place = v.canPlaceCue === undefined ? false : v.canPlaceCue;
  const choose = v.canChooseCueBall === undefined ? false : v.canChooseCueBall;
  if (typeof place !== "boolean" || typeof choose !== "boolean") return undefined;
  return { canPlaceCue: place, canChooseCueBall: choose };
}

/**
 * Детерминированный хэш состояния для сети (задел под 02-d: shooter-authoritative
 * результат + hash + shotSeq, §8 требований). Хэшируется каноническая строка
 * сериализации — та же, что уходит по сети, поэтому «одинаковый удар из
 * одинакового состояния» и «разные исходы» дают разный хэш. Наведение в
 * состояние не входит (его там нет), спин — входит (§5).
 *
 * Алгоритм — FNV-1a 32 бита по кодовым единицам строки: без внешних
 * зависимостей, воспроизводим в любой среде, не зависит от float-форматирования
 * (числа берём через `String(n)`, которое в JS детерминировано).
 */
export function hashBilliardsState(state: BilliardsState): number {
  return fnv1a(canonicalStateString(state));
}

/** Каноническая строка состояния: стабильный порядок ключей и шаров по id. */
function canonicalStateString(state: BilliardsState): string {
  const balls = [...state.balls]
    .sort((a, b) => a.id - b.id)
    .map((b) => `${b.id}:${b.x},${b.y},${b.vx},${b.vy},${b.spin.x},${b.spin.y},${b.spin.z},${b.active ? 1 : 0}`)
    .join("|");
  const groups =
    state.groups === null
      ? ""
      : Object.keys(state.groups)
          .sort()
          .map((k) => `${k}=${state.groups?.[k]}`)
          .join(",");
  return [
    state.version,
    state.mode,
    state.seed,
    state.order.join(","),
    state.turn,
    state.finished ? 1 : 0,
    groups,
    state.rules,
    state.phase,
    state.winner ?? "",
    state.finishReason ?? "",
    state.ballInHand ? 1 : 0,
    state.shotSeq,
    balls,
  ].join(";");
}

/** FNV-1a (32 бита) без знака. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

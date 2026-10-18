// Игра «Бильярд» как обычная игра платформы. Физика — в ядре (`physics.ts`),
// рендер и ввод — слои; правила и переход хода придут в фазах режимов.
import {
  Game,
  type Dialogs,
  type GameEnvironment,
  type GameRenderFrame,
  type GameState,
  type GameViewOptions,
  type Move,
  type MoveResult,
} from "@/core/game";
import type { FormNode, FormSchema } from "@/core/form";
import type { PlayerInit } from "@/core/player";
import type { PlayerPanelSchema } from "@/core/game";
import type { UiZones } from "@/core/ui-zones";
import { HEAD_SPOT, MAX_SHOT_SECONDS, PHYS_DT } from "./constants";
import { buildTableGeometry, type TableGeometry } from "./geometry";
import { BASE_8BALL } from "./modes/base8ball";
import type { ChooseShot, ModeConfig } from "./modes/types";
import {
  applyShotWithLog,
  isAtRest,
  isValidShot,
  step,
  strike,
  type Shot,
} from "./physics";
import { AimPreviewController } from "./preview";
import { spinStep } from "./roll";
import { aimAngleToTarget } from "./aim";
import {
  chooseShot as aiChooseShot,
  planShot as aiPlanShot,
  type ShotPlan,
} from "./ai";
import {
  applyAutoResult,
  clampScale,
  INITIAL_DIFFICULTY,
  skillFor,
  type Difficulty,
  type DifficultyState,
} from "./difficulty";
import { aimLog, aimNow, aimSince } from "@/debug/perf-log";
import {
  computeFit,
  drawAimOverlay,
  drawBilliards,
  FIT_PADDING,
  type FitInsets,
  type FitTransform,
} from "./render";
import {
  createInitialState,
  deserializeBilliardsState,
  serializeBilliardsState,
  type BilliardsState,
  type EightBallRules,
  type PrepPermissions,
  type TurnReason,
} from "./state";
import { cueBallInHandPosition, resolveShot } from "./rules-8ball";
import { kindOf } from "./balls";

/** Идентификатор экрана настроек режима 8-ball. */
const MODE_SCREEN_8BALL = "8ball";

/**
 * Варианты сложности ИИ: «авто» плюс числа шкалы 0..4 (образец tic-tac).
 * Сложность — настройка игры (не свойство игрока), поэтому живёт контроллом
 * преднастройки, как уровень ИИ у tic-tac.
 */
const DIFFICULTY_OPTIONS = [
  { value: "auto", label: "Авто" },
  { value: "0", label: "Очень лёгкий" },
  { value: "1", label: "Лёгкий" },
  { value: "2", label: "Средний" },
  { value: "3", label: "Сложный" },
  { value: "4", label: "Мастер" },
] as const;

/**
 * Преднастройка бильярда — два экрана (требование пользователя 2026-10-16):
 * сначала выбор режима, затем параметры режима и способы старта. Кнопка первого
 * экрана не запускает игру, а открывает меню режима (`navigate: push`);
 * платформа ведёт историю экранов и показывает «Назад».
 */
const SETUP_ROOT: FormSchema = {
  id: "billiards-setup",
  nodes: [
    {
      type: "group",
      id: "billiards-modes",
      label: "Режим игры",
      frame: true,
      children: [
        {
          type: "control",
          control: {
            id: "mode-8ball",
            kind: "button",
            label: BASE_8BALL.label,
            icon: "circle-dot",
            signals: ["press"],
            navigate: { type: "push", screen: MODE_SCREEN_8BALL },
          },
        },
      ],
    },
  ],
};

const SETUP_8BALL: FormSchema = {
  id: "billiards-setup-8ball",
  nodes: [
    {
      type: "group",
      id: "billiards-rules",
      label: "Правила 8-ball",
      frame: true,
      children: [
        {
          type: "control",
          control: {
            id: "rules",
            kind: "select",
            label: "Правила",
            value: "simple",
            options: [
              { value: "simple", label: "Простые" },
              { value: "tournament", label: "Турнирные" },
            ],
            signals: ["change"],
          },
        },
      ],
    },
    {
      type: "group",
      id: "billiards-difficulty",
      label: "Сложность компьютера",
      frame: true,
      children: [
        {
          type: "control",
          control: {
            id: "difficulty",
            kind: "select",
            label: "Сложность",
            value: "auto",
            options: DIFFICULTY_OPTIONS,
            signals: ["change"],
          },
        },
      ],
    },
    {
      type: "group",
      id: "billiards-start",
      label: "Начать партию",
      frame: true,
      orientation: "horizontal",
      children: [
        {
          type: "control",
          control: {
            id: "start-hotseat",
            kind: "button",
            label: "Двое за экраном",
            icon: "users",
            signals: ["press"],
            variant: "primary",
          },
        },
        {
          type: "control",
          control: {
            id: "start-vs-computer",
            kind: "button",
            label: "С компьютером",
            icon: "bot",
            signals: ["press"],
          },
        },
      ],
    },
    {
      type: "group",
      id: "billiards-start-network",
      label: "По сети",
      frame: true,
      orientation: "horizontal",
      children: [
        {
          type: "control",
          control: {
            id: "start-host",
            kind: "button",
            label: "Создать партию",
            icon: "plus",
            signals: ["press"],
          },
        },
        {
          type: "control",
          control: {
            id: "start-join",
            kind: "button",
            label: "Присоединиться",
            icon: "list",
            signals: ["press"],
          },
        },
      ],
    },
  ],
};

/** Разобрать ход-удар из непрозрачного `Move`; мусор — `null`. */
export function parseShot(move: Move): Shot | null {
  const angle = move.angle;
  const power = move.power;
  if (typeof angle !== "number" || typeof power !== "number") return null;
  const shot: Shot = { angle, power };
  if (!isValidShot(shot)) return null;
  return typeof move.cueY === "number" || typeof move.cueX === "number"
    ? {
        ...shot,
        cueX: typeof move.cueX === "number" ? move.cueX : undefined,
        cueY: typeof move.cueY === "number" ? move.cueY : undefined,
      }
    : shot;
}

/** Угол прицела по умолчанию (до наведения) — в сторону пирамиды. */
const DEFAULT_AIM_ANGLE = 0;

/** Поставленный биток: позиция в «кухне» — позади стартовой (головной) линии. */
export interface CuePlacement {
  readonly x: number;
  readonly y: number;
}

/**
 * Участник игры с источником ввода (решение пользователя 2026-10-18): локальный
 * игрок, ИИ и сетевой соперник отличаются только источником данных, а не
 * правилами. Прицел, сила и поставленный биток принадлежат участнику и
 * восстанавливаются на его ходу. Рантайм-слой вида — в состояние и `Move` не
 * пишется (урок `ui-behavior` п.6).
 */
export interface Participant {
  readonly id: string;
  readonly name: string;
  readonly agent: string;
  readonly transport: string;
  /** Угол прицела; `null` — прицел не выставлен (цель по умолчанию). */
  aim: number | null;
  /** Выбранная сила удара 0..1. */
  power: number;
  /** Поставленный биток; `null` — на штатном месте. */
  cue: CuePlacement | null;
}

/** Сила участника по умолчанию — как у контролла UI (50%). */
const DEFAULT_PARTICIPANT_POWER = 0.5;

/**
 * Фаза хода (CONTEXT «Цикл хода»): `preparing` — подготовка (прицел, позиция
 * битка), `animating` — симуляция и реплей удара, `passing` — обработка и
 * передача хода. Внесериализуема: состояние партии её не хранит.
 */
export type TurnPhase = "preparing" | "animating" | "passing";

/** Передача хода: кто ходит, почему и с какими правами подготовки. */
export interface TurnHandoff {
  readonly playerId: string;
  readonly reason: TurnReason;
  readonly prep: PrepPermissions;
}

/**
 * Вернуть состояние с битком в заданной точке. Постановка воскрешает биток;
 * пересечение с другими шарами запрещено — выталкивание на минимальный путь.
 * Граница постановки задаётся левой границей (`maxX`): свежая партия — кухня
 * (стартовая линия), режим «с руки» — весь стол (решение пользователя).
 * Размеры поля и радиус шара — из режима (`field`).
 */
interface Playfield {
  readonly length: number;
  readonly width: number;
  readonly radius: number;
}

/** Свободна ли точка: ни один активный шар (кроме битка) не ближе диаметра. */
function isFreeSpot(balls: BilliardsState["balls"], x: number, y: number, r: number): boolean {
  return balls.every((b) => b.id === 0 || !b.active || Math.hypot(b.x - x, b.y - y) >= 2 * r);
}

/**
 * Ближайшая свободная точка в области постановки (сетка с шагом r/2). Нужна,
 * когда расталкивание не нашло места: плотный стол, биток у борта.
 */
function nearestFreeSpot(
  balls: BilliardsState["balls"],
  x: number,
  y: number,
  maxX: number,
  field: Playfield,
): { x: number; y: number } {
  const r = field.radius;
  const step = r / 2;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let px = r; px <= maxX; px += step) {
    for (let py = r; py <= field.width - r; py += step) {
      const d = Math.hypot(px - x, py - y);
      if (d < bestD && isFreeSpot(balls, px, py, r)) {
        best = { x: px, y: py };
        bestD = d;
      }
    }
  }
  return best ?? { x, y };
}

function withPlacedCue(
  state: BilliardsState,
  x: number,
  y: number,
  maxX: number,
  field: Playfield,
): BilliardsState {
  const r = field.radius;
  const maxY = field.width - r;
  let cx = Math.min(Math.max(x, r), maxX);
  let cy = Math.min(Math.max(y, r), maxY);
  // Несколько итераций расталкивания: чужие шары могут стоять вплотную друг к другу.
  for (let pass = 0; pass < 8; pass += 1) {
    let moved = false;
    for (const ball of state.balls) {
      if (ball.id === 0 || !ball.active) continue;
      const dx = cx - ball.x;
      const dy = cy - ball.y;
      const d = Math.hypot(dx, dy);
      if (d >= 2 * r) continue;
      // Точно на борт другого шара по кратчайшему пути; вплотную (d≈0) — сдвиг вправо.
      const nx = d > 1e-9 ? dx / d : 1;
      const ny = d > 1e-9 ? dy / d : 0;
      cx = ball.x + nx * 2 * r;
      cy = ball.y + ny * 2 * r;
      moved = true;
    }
    cx = Math.min(Math.max(cx, r), maxX);
    cy = Math.min(Math.max(cy, r), maxY);
    if (!moved) break;
  }
  if (!isFreeSpot(state.balls, cx, cy, r)) {
    const spot = nearestFreeSpot(state.balls, cx, cy, maxX, field);
    cx = spot.x;
    cy = spot.y;
  }
  return {
    ...state,
    balls: state.balls.map((b) =>
      b.id === 0 ? { ...b, x: cx, y: cy, vx: 0, vy: 0, active: true } : b,
    ),
  };
}

/** Максимум шагов физики на кадр анимации (защита от «спирали смерти»). */
const MAX_STEPS_PER_FRAME = 16;

/** Бильярд. Показывает схему стола и шаров; правила 8-ball — в ядре (02-a). */
export class BilliardsGame extends Game {
  readonly id = "billiards";
  readonly label = "Бильярд";

  /** Отписки от сигналов формы: снимаются в `detachEnvironment`. */
  #unsubscribe: Array<() => void> = [];

  /** Инструмент платформы «показать окно». В демо окружения нет — итога нет. */
  #dialogs: Dialogs | null = null;

  // --- Рантайм анимации (несериализуемый, решение Q7) ---
  /** Последнее отрисованное состояние: источник для начала удара. */
  #lastState: BilliardsState | null = null;
  /** Активный реплей удара; `null`, когда движения нет. */
  #runtime: BilliardsState | null = null;
  /** Итог последнего воспроизведения (после покоя). */
  #lastFinished: BilliardsState | null = null;
  /** Аккумулятор реального времени для фиксированного шага. */
  #accumulator = 0;
  /** Накопленное время текущего воспроизведения (защита от незавершения). */
  #animElapsed = 0;
  /**
   * Реестр участников (решение 2026-10-18): состав передаёт UI (`setRoster`).
   * Прицел, сила и биток живут на участнике и восстанавливаются на его ходу.
   */
  #participants = new Map<string, Participant>();
  /** Можно ли ещё ставить биток (свежая партия, ни одного удара). */
  #canPlace = true;
  /** Идёт режим размещения битка (постановка/с руки) — перетаскивание не гаснет после первого сдвига. */
  #placing = false;
  /** Идёт перетаскивание битка (прицел скрыт). */
  #moving = false;
  /** Курсор наведён на биток (стрелки ярче). */
  #cueHover = false;
  /** Фаза мигания стрелок 0..1. */
  #blink = 0;
  /** Активный режим: геометрия и шары собираются из его параметров. */
  #mode: ModeConfig = BASE_8BALL;
  /** Геометрия стола режима: строится один раз и переиспользуется. */
  #geometry: TableGeometry = buildTableGeometry(this.#mode);
  /** Радиус шара режима (для постановки битка и границ). */
  #ballRadius: number = this.#mode.balls.diameter / 2;
  /** Поколения предпросмотра и его постепенный просчёт. */
  #preview = new AimPreviewController();
  /**
   * Фаза хода (CONTEXT «Цикл хода»): подготовка → симуляция/реплей → обработка →
   * передача → подготовка. Между ударами поле не трогается: биток появляется
   * только на подготовке следующего хода.
   */
  #turnPhase: TurnPhase = "preparing";
  /** Передача хода для плашки перехода; `null` — плашка не показывается. */
  #turnHandoff: TurnHandoff | null = null;
  /** Имена игроков — плашка перехода и экран результата (собирает игра). */
  #names: Record<string, string> = {};
  /** Правила режима из настроек преднастройки (сериализуются в состояние). */
  #rules: EightBallRules = "simple";
  /** Сложность из преднастройки: «авто» или фиксированное число шкалы. */
  #difficulty: Difficulty = "auto";
  /**
   * Состояние авто-шкалы: двигается между партиями, персистится настройками.
   * Внутри партии шкала заморожена (`#frozenScale`).
   */
  #difficultyState: DifficultyState = INITIAL_DIFFICULTY;
  /** Замороженная на текущую партию шкала 0..4 — вход навыка ИИ. */
  #frozenScale: number = INITIAL_DIFFICULTY.scale;
  /** Агенты игроков (`human`/`computer`) — исход партии для авто-шкалы. */
  #agents: Record<string, string> = {};
  /** Запуск уже идёт (повторные нажатия кнопок старта игнорируем). */
  #starting = false;
  /** Прицел рисуется отдельным холстом (см. `drawAimOverlay`), а не в основном кадре. */
  #overlayAim = false;
  /**
   * Кэш состояния с поставленным битком: preview сравнивает состояние по
   * идентичности, а `withPlacedCue` создаёт новый объект. Без кэша прицел после
   * установки битка сбрасывался бы на каждом кадре.
   */
  #placedCueCache: {
    readonly state: BilliardsState;
    readonly x: number;
    readonly y: number;
    readonly maxX: number;
    readonly result: BilliardsState;
  } | null = null;
  /** Запас под собственные панели игры (боковые/нижняя), задаёт UI. */
  #panelInsets: FitInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** Зоны интерфейса игры: их место игра резервирует в рендере сама. */
  #ui: UiZones | null = null;

  override getSetupForm(screen?: string): FormSchema {
    return screen === MODE_SCREEN_8BALL ? SETUP_8BALL : SETUP_ROOT;
  }

  override getViewOptions(): GameViewOptions {
    // Бильярд: стол фиксирован целиком — ни зума, ни панорамы, ни сетки.
    // Панель участников — системная; счёт и шары в ней нужны.
    return { zoom: false, pan: false, grid: false, playersStats: true };
  }

  override getPlayerPanel(): PlayerPanelSchema {
    // Слоты панели игрока: чья группа (имя ходящего) и шкала забитых. Чипа
    // бонусов у 8-ball нет (бонусы — режим аркады, 06).
    const widget = (id: string, token: string): FormNode => ({
      type: "control",
      control: { id, kind: "widget", label: token, value: token },
    });
    return {
      nameRow: [widget("panel-group", "billiards.group")],
      bottomRow: [widget("panel-balls", "billiards.balls")],
    };
  }

  createInitialState(playerIds: readonly string[]): GameState {
    this.#turnPhase = "preparing";
    this.#turnHandoff = null;
    this.#lastFinished = null;
    this.#freezeDifficulty();
    const state = createInitialState(this.#mode, playerIds, undefined, { rules: this.#rules });
    // Состояние доступно игре сразу, не дожидаясь кадра отрисовки: от него зависит
    // и ход компьютера (`planComputerTurn`), и прицел по умолчанию.
    this.#lastState = state;
    return state;
  }

  // --- Участники с источником ввода (решение 2026-10-18) ---

  /**
   * Передать состав из сессии: имена, агенты и транспорт. Прицел, сила и биток
   * уже известных участников сохраняются — состав меняется без потери памяти хода.
   * Это же чинит `resume`: игра узнаёт имена и агентов до первого кадра.
   */
  setRoster(players: readonly PlayerInit[]): void {
    const next = new Map<string, Participant>();
    for (const p of players) {
      const prev = this.#participants.get(p.id);
      next.set(p.id, {
        id: p.id,
        name: p.name,
        agent: p.agent,
        transport: p.transport,
        aim: prev?.aim ?? null,
        power: prev?.power ?? DEFAULT_PARTICIPANT_POWER,
        cue: prev?.cue ?? null,
      });
    }
    this.#participants = next;
    // Имена и агенты — плашке перехода, экрану результата и авто-шкале.
    this.#names = Object.fromEntries(players.map((p) => [p.id, p.name]));
    this.#agents = Object.fromEntries(players.map((p) => [p.id, p.agent]));
  }

  /** Id текущего участника по очереди хода (`state.order[state.turn]`). */
  #currentId(): string | null {
    const state = this.#lastState ?? this.#lastFinished;
    if (!state) return null;
    return state.order[state.turn] ?? null;
  }

  /** Текущий участник (чей ход) — источник прицела, силы и битка. */
  currentParticipant(): Participant | null {
    const id = this.#currentId();
    return id === null ? null : (this.#participants.get(id) ?? null);
  }

  /** Участник по id; `null` — состав не передан. */
  getParticipant(id: string): Participant | null {
    return this.#participants.get(id) ?? null;
  }

  getParticipantAim(id: string): number | null {
    return this.#participants.get(id)?.aim ?? null;
  }

  getParticipantPower(id: string): number {
    return this.#participants.get(id)?.power ?? DEFAULT_PARTICIPANT_POWER;
  }

  /** Записать прицел участника (влияет на предпросмотр только на его ходу). */
  setParticipantAim(id: string, angle: number | null): void {
    const p = this.#participants.get(id);
    if (!p) return;
    const isCurrent = id === this.#currentId();
    if (p.aim === angle) {
      if (angle === null && isCurrent) this.#preview.cancelPending();
      return;
    }
    p.aim = angle;
    if (!isCurrent) return;
    if (angle === null) this.#preview.cancelPending();
    else this.#preview.invalidate();
  }

  /** Записать силу участника 0..1. */
  setParticipantPower(id: string, power: number): void {
    const p = this.#participants.get(id);
    if (!p) return;
    const next = Math.min(1, Math.max(0, power));
    if (next === p.power) return;
    p.power = next;
    if (id === this.#currentId()) this.#preview.invalidate();
  }

  /**
   * Ход принадлежит локальному человеку (ввод с этой машины). ИИ и сетевой
   * соперник — не локальный источник: их контроллы заблокированы, прицел —
   * бледно-оранжевый. Состав неизвестен — считаем ход локальным (поведение по
   * умолчанию).
   */
  isCurrentLocal(): boolean {
    const p = this.currentParticipant();
    if (p === null) return true;
    return p.agent === "human" && p.transport === "local";
  }

  /** Прицел текущего участника; `null` — не выставлен. */
  #currentAim(): number | null {
    return this.currentParticipant()?.aim ?? null;
  }

  /** Сила текущего участника (0..1). */
  #currentPower(): number {
    return this.currentParticipant()?.power ?? DEFAULT_PARTICIPANT_POWER;
  }

  /**
   * Удар от имени участника (источник ввода): валиден только для текущего
   * участника на фазе подготовки. Читает его прицел, силу и биток и запускает
   * реплей (`startShot`). Возвращает начатый удар или `null`.
   */
  commitShot(playerId: string): Shot | null {
    const state = this.#lastState ?? this.#lastFinished;
    if (!state || this.#turnPhase !== "preparing") return null;
    if (state.order[state.turn] !== playerId) return null;
    const p = this.#participants.get(playerId);
    if (!p) return null;
    // Прицел по умолчанию считается только если участник ещё не целился.
    const aim = p.aim ?? (aimAngleToTarget(this.#shownState(state)) ?? DEFAULT_AIM_ANGLE);
    const shot: Shot = {
      angle: aim,
      power: p.power,
      ...(p.cue ? { cueX: p.cue.x, cueY: p.cue.y } : {}),
    };
    return this.startShot(shot) ? shot : null;
  }

  /** Заморозить шкалу на партию: «авто» берёт текущую, число — себя. */
  #freezeDifficulty(): void {
    this.#frozenScale =
      this.#difficulty === "auto" ? this.#difficultyState.scale : clampScale(this.#difficulty);
  }

  /** Навык ИИ 0..1 для текущей партии. */
  #skill(): number {
    return skillFor(this.#frozenScale);
  }

  applyMove(state: GameState, playerId: string, move: Move): MoveResult {
    // Удар 8-ball: парсинг → позиция битка на подготовке → симуляция до покоя с
    // логом → чистый разбор правил. Разбор определяет начальные условия
    // следующего хода (CONTEXT «Цикл хода»): кто ходит, почему, можно ли
    // позиционировать биток.
    const shot = parseShot(move);
    if (!shot) {
      return { accepted: false, state, finished: this.isFinished(state) };
    }
    let base = state as BilliardsState;
    const explicit = typeof shot.cueY === "number" || typeof shot.cueX === "number";
    if (explicit || this.#rawNeedsPlacementIn(base)) {
      const cue = base.balls.find((b) => b.id === 0);
      const spot = explicit
        ? { x: shot.cueX ?? cue?.x ?? HEAD_SPOT.x, y: shot.cueY ?? cue?.y ?? 0 }
        : cueBallInHandPosition(base.balls, this.#mode.id);
      base = withPlacedCue(
        base,
        spot.x,
        spot.y,
        this.#placementMax(base),
        this.#field(),
      );
    }
    this.#placing = false;
    this.#canPlace = false;
    // Биток применён: слот постановки бьющего больше не нужен.
    const shooter = this.#participants.get(playerId);
    if (shooter) shooter.cue = null;
    this.#turnPhase = "animating";
    const { state: rest, log } = applyShotWithLog(base, shot, this.#geometry);
    const next = resolveShot(rest, log);
    const finished = next.finished;
    // Авто-шкала двигается только между партиями (CONTEXT п.9): обновляем по
    // исходу завершённой партии, до плашки результата.
    if (finished) this.#onFinished(next);
    // Передача хода: плашка показывает, кто ходит и почему; подготовка следующего
    // хода начинается после её исчезновения (`acknowledgeTurn`).
    this.#turnPhase = "passing";
    // Разобранное состояние — источник правды для подготовки следующего хода:
    // права позиционировать читаются из него, а не только из отрисованного кадра.
    this.#lastState = next;
    const nextPlayerId = next.order[next.turn] ?? null;
    this.#turnHandoff =
      finished || nextPlayerId === null
        ? null
        : { playerId: nextPlayerId, reason: next.turnReason, prep: next.prep };
    if (finished) void this.#showResult(next);
    return { accepted: true, state: next, finished, winnerId: next.winner };
  }

  /** Текущая фаза хода (CONTEXT «Цикл хода»): готов ли стол к подготовке удара. */
  getTurnPhase(): TurnPhase {
    return this.#turnPhase;
  }

  /** Передача хода для плашки перехода; `null` — плашка не нужна. */
  getTurnHandoff(): TurnHandoff | null {
    return this.#turnHandoff;
  }

  /**
   * Плашка перехода показана и скрыта: начинается подготовка следующего хода.
   * До этого ввод заблокирован — между ударами поле не трогаем.
   */
  acknowledgeTurn(): void {
    if (this.#turnPhase !== "passing") return;
    this.#turnPhase = "preparing";
    this.#turnHandoff = null;
    // Угол не запоминается между ходами (решение 2026-10-18): в начале хода он
    // выставляется по правилам (на целевой шар). Сила — своя у каждого участника
    // и сохраняется.
    const current = this.currentParticipant();
    if (current) current.aim = null;
    this.#preview.cancelPending();
  }

  /**
   * Итог партии для авто-шкалы: сдвиг только между партиями и только когда в
   * партии был компьютер (иначе «авто» бессмысленно). `won` — выиграл человек.
   */
  #onFinished(state: BilliardsState): void {
    if (this.#difficulty !== "auto") return;
    const winner = state.winner;
    if (winner === null) return;
    const winnerAgent = this.#agents[winner];
    if (winnerAgent === undefined) return; // состав неизвестен — шкалу не трогаем
    const hasComputer = Object.values(this.#agents).some((agent) => agent === "computer");
    if (!hasComputer) return;
    this.#difficultyState = applyAutoResult(this.#difficultyState, {
      won: winnerAgent === "human",
    });
  }

  /** Текущая сложность и действующая шкала (для тестов и UI). */
  getDifficulty(): { readonly difficulty: Difficulty; readonly scale: number } {
    return {
      difficulty: this.#difficulty,
      scale: this.#difficulty === "auto" ? this.#difficultyState.scale : clampScale(this.#difficulty),
    };
  }

  /** Применить значение контролла сложности: `"auto"` или строка-число; мусор — нет. */
  #applyDifficultyValue(value: unknown): void {
    if (value === "auto") {
      this.#difficulty = "auto";
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      this.#difficulty = clampScale(value);
      return;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) this.#difficulty = clampScale(parsed);
    }
  }

  /**
   * Выбор удара агентом (контракт `ChooseShot`, CONTEXT пп.9–10). ИИ выбирает
   * лучший легальный удар и накладывает ошибку по навыку (шкала заморожена на
   * партию). `null` — легального удара нет.
   */
  chooseShot: ChooseShot = (state) => {
    return aiChooseShot(state as BilliardsState, this.#geometry, { skill: this.#skill() });
  };

  /**
   * Ход компьютера ведёт UI игры, а не `Session`: `chooseMove` всегда `null`,
   * чтобы сессия не применила удар мгновенно, минуя реплей (иначе поле
   * «телепортируется», фаза залипает в `passing`). UI берёт удар через
   * `planComputerTurn`/`chooseShot` и проводит его тем же циклом, что человек.
   */
  chooseMove(_state: GameState, _playerId: string): Move | null {
    return null;
  }

  /**
   * План удара компьютера: кандидаты для видимого прицеливания (худшие первыми,
   * выбранный последним) и сам выбранный удар. Запасной «плохой, но легальный»
   * удар уже внутри `planShot`; `null` — легальных целей нет вовсе.
   */
  planComputerTurn(): ShotPlan | null {
    const state = this.#lastState ?? this.#lastFinished;
    if (!state || state.finished) return null;
    return aiPlanShot(state, this.#geometry, { skill: this.#skill() });
  }

  nextPlayer(state: GameState, _playerId: string): string | null {
    // Очередь ведёт разбор правил: `turn` уже указывает на того, чей ход
    // (забил свой — остался, фол/мимо — следующий). Здесь только чтение.
    const billiards = state as BilliardsState;
    if (billiards.finished) return null;
    if (billiards.order.length === 0) return null;
    return billiards.order[billiards.turn] ?? null;
  }

  isFinished(state: GameState): boolean {
    return (state as BilliardsState).finished === true;
  }

  override serializeState(state: GameState): unknown {
    return serializeBilliardsState(state as BilliardsState);
  }

  override deserializeState(data: unknown): GameState | null {
    // Восстановленная партия — не свежий разбой: ставить биток заново нельзя.
    const state = deserializeBilliardsState(data);
    if (state !== null) {
      this.#canPlace = false;
      // Состояние и фаза доступны сразу: иначе возобновлённая партия на ходе
      // компьютера не получила бы план (`planComputerTurn`) и встала бы, пока не
      // отрисуется первый кадр. Фаза восстановления — подготовка хода.
      this.#lastFinished = null;
      this.#turnPhase = "preparing";
      this.#turnHandoff = null;
      this.#lastState = state;
      // Шкала восстановленной партии — из применённых настроек (`applySettings`
      // вызывается до `deserializeState` в `resumeSession`).
      this.#freezeDifficulty();
    }
    return state;
  }

  draw(state: GameState, frame: GameRenderFrame): void {
    const gt0 = aimNow();
    // Один набор параметров вида для всех веток (урок `ui-behavior` п.7): стол
    // вписывается одинаково и в реплее, и в покое.
    const base = { insets: this.getInsets(), geometry: this.#geometry, modeKey: this.#mode.id };
    if (this.#runtime) {
      // Во время реплея прицел не рисуется, но запас под панели сохраняется —
      // иначе стол на кадр «прыгает» в увеличенный масштаб.
      drawBilliards(this.#runtime, frame, { aim: null, ...base });
      return;
    }
    if (this.#turnPhase === "animating" && this.#lastFinished) {
      // Реплей закончился, но игра ещё ждёт небольшую паузу перед применением
      // лога. Сохраняем конечный кадр удара: не возвращаем поле к состоянию до
      // удара и не показываем результаты раньше времени.
      drawBilliards(this.#lastFinished, frame, { aim: null, ...base });
      return;
    }
    this.#lastState = state as BilliardsState;
    if (this.#turnPhase === "passing") {
      // Передача хода: поле не трогаем, прицел и стрелки скрыты до подготовки.
      drawBilliards(this.#lastState, frame, { aim: null, ...base });
      return;
    }
    const gt1 = aimNow();
    // Биток: явная постановка или стартовая точка, если ждём постановку.
    const shown = this.#shownState(this.#lastState);
    if (this.#overlayAim) {
      // Основной кадр: стол и шары из кэша, без прицела и без пересчёта линии.
      drawBilliards(shown, frame, { aim: null, overlayAim: true, ...base });
      return;
    }
    // Прицел — из текущего участника (свой или соперника); при перемещении скрыт.
    const aim =
      this.#moving ? null : (this.#currentAim() ?? aimAngleToTarget(shown) ?? DEFAULT_AIM_ANGLE);
    // Предпросмотр пути: физика (со спином) с кэшем по (состояние, угол, сила).
    const preview =
      aim === null ? null : this.#preview.frame(shown, aim, this.#currentPower(), this.#geometry);
    const gt2 = aimNow();
    drawBilliards(shown, frame, {
      aim,
      aimPale: !this.isCurrentLocal(),
      preview: preview?.current ?? undefined,
      previousPreview: preview?.previous ?? undefined,
      arrows: this.canMove() && this.isCurrentLocal() && !this.#moving,
      hover: this.#cueHover,
      blink: this.#blink,
      ...base,
    });
    aimLog("gdraw", { pre: Math.round((gt1 - gt0) * 100) / 100, prev: Math.round((gt2 - gt1) * 100) / 100, render: aimSince(gt2), total: aimSince(gt0) });
  }

  /**
   * Геометрия поля для заданного размера области: единственный источник fit для
   * рендера и ввода (M3). UI не знает `FIT_PADDING` и не зовёт `computeFit` сам.
   */
  getFit(size: { width: number; height: number }): FitTransform {
    return computeFit(size, FIT_PADDING, this.getInsets());
  }

  /** Итоговые инсеты: место зон + собственные панели игры + малый зазор. */
  getInsets(): FitInsets {
    const ui = this.#ui?.insets;
    const panel = this.#panelInsets;
    // Зазор до панелей: рейка сама даёт «воздух», поэтому зазор минимальный.
    const gap = 4;
    return {
      top: Math.max(ui?.top ?? 0, panel.top) + gap,
      right: Math.max(ui?.right ?? 0, panel.right) + gap,
      left: Math.max(ui?.left ?? 0, panel.left) + gap,
      bottom: Math.max(ui?.bottom ?? 0, panel.bottom) + gap,
    };
  }

  /** Начать воспроизведение удара от последнего отрисованного состояния. */
  startShot(shot: Shot, fromState?: BilliardsState): boolean {
    const base = fromState ?? this.#lastState;
    if (this.#runtime || !base || !isValidShot(shot)) return false;
    // Явные координаты — из удара; иначе, если биток ждёт постановки (скрач),
    // берём действующую точку (постановка или стартовая), чтобы удар был возможен.
    const explicit = typeof shot.cueY === "number" || typeof shot.cueX === "number";
    const placement = explicit ? null : this.#effectivePlacement();
    const maxX = this.#placementMax(base);
    const placed = explicit
      ? (() => {
          const cue = base.balls.find((b) => b.id === 0);
          return withPlacedCue(
            base,
            shot.cueX ?? cue?.x ?? HEAD_SPOT.x,
            shot.cueY ?? cue?.y ?? 0,
            maxX,
            this.#field(),
          );
        })()
      : placement
        ? withPlacedCue(base, placement.x, placement.y, maxX, this.#field())
        : base;
    this.#lastFinished = null;
    this.#turnPhase = "animating";
    this.#runtime = strike(placed, shot); // Нулевая сила: покой уже сейчас — реплей не нужен, итог сразу.
    if (isAtRest(this.#runtime)) {
      this.#lastFinished = this.#runtime;
      this.#runtime = null;
    }
    this.#accumulator = 0;
    this.#animElapsed = 0;
    this.#preview.reset();
    // Биток применён — слот постановки текущего участника больше не нужен.
    // Сила участника сохраняется (своя память), угол — нет: он выставляется
    // заново в начале следующего хода (`acknowledgeTurn`).
    const shooter = this.currentParticipant();
    if (shooter) shooter.cue = null;
    this.#canPlace = false;
    this.#placing = false;
    return true;
  }

  /** Продвинуть воспроизведение на реальное время `dt`. `true` — ещё идёт. */
  advance(dt: number): boolean {
    if (!this.#runtime) return false;
    const real = Math.min(Math.max(dt, 0), 0.25);
    this.#accumulator += real;
    this.#animElapsed += real;
    let steps = 0;
    while (this.#accumulator >= PHYS_DT && steps < MAX_STEPS_PER_FRAME) {
      this.#runtime = step(this.#runtime, this.#geometry);
      // Ориентация для отрисовки крутится из спина физики (поза — только вид,
      // в состояние не входит).
      for (const ball of this.#runtime.balls) {
        if (ball.active) spinStep(ball.id, ball.spin, PHYS_DT);
      }
      this.#accumulator -= PHYS_DT;
      steps += 1;
      if (isAtRest(this.#runtime)) break;
    }
    if (isAtRest(this.#runtime) || this.#animElapsed >= MAX_SHOT_SECONDS) {
      this.#lastFinished = this.#runtime;
      this.#runtime = null;
      this.#accumulator = 0;
      this.#animElapsed = 0;
      return false;
    }
    return true;
  }

  /** Итог последнего воспроизведённого удара; `null`, если ещё не было. */
  getAnimationResult(): BilliardsState | null {
    return this.#lastFinished;
  }

  /**
   * Id забитых шаров из последнего отрисованного состояния — общий список (для
   * служебных нужд). Разбивка по игрокам — `getPocketedByPlayer`.
   */
  getPocketedIds(): readonly number[] {
    const state = this.#lastFinished ?? this.#runtime ?? this.#lastState;
    if (!state) return [];
    return state.balls
      .filter((b) => !b.active && b.id > 0)
      .map((b) => b.id)
      .sort((a, b) => a - b);
  }

  /** Сбросить рантайм анимации и предпросмотр (рестарт/снятие окружения). */
  resetRuntime(): void {
    this.#runtime = null;
    this.#lastFinished = null;
    this.#turnPhase = "preparing";
    this.#turnHandoff = null;
    this.#lastState = null;
    this.#accumulator = 0;
    this.#animElapsed = 0;
    this.#preview.reset();
    // Прицел и сила участников не сбрасываются: это их память хода, а не рантайм.
  }

  /** Переключить отрисовку прицела на отдельный холст (overlay). */
  setOverlayAim(on: boolean): void {
    this.#overlayAim = on;
  }

  /**
   * Нарисовать прицел на отдельном холсте: линия, предпросмотр и стрелки. Прицел
   * берётся из текущего участника (свой или соперника) — отрисовка одна для всех.
   * Вызывается каждый кадр; расчёт линии кэшируется по состоянию, углу и силе.
   */
  drawAimOverlay(
    ctx: CanvasRenderingContext2D,
    size: { readonly width: number; readonly height: number },
    dpr: number,
  ): void {
    const state = this.#lastState;
    if (!state || this.#runtime || this.#turnPhase !== "preparing") {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      return;
    }
    const shown = this.#shownState(state);
    const local = this.isCurrentLocal();
    // Прицел текущего участника; при перемещении битка скрыт (только локальный ход).
    const aim =
      this.#moving ? null : (this.#currentAim() ?? aimAngleToTarget(shown) ?? DEFAULT_AIM_ANGLE);
    const preview =
      aim === null ? null : this.#preview.frame(shown, aim, this.#currentPower(), this.#geometry);
    drawAimOverlay(ctx, size, dpr, shown, {
      aim,
      aimPale: !local,
      preview: preview?.current ?? undefined,
      previousPreview: preview?.previous ?? undefined,
      arrows: this.canMove() && local && !this.#moving,
      hover: this.#cueHover,
      blink: this.#blink,
      insets: this.getInsets(),
      geometry: this.#geometry,
      modeKey: this.#mode.id,
    });
  }

  /** Идёт ли воспроизведение удара. */
  isAnimating(): boolean {
    return this.#runtime !== null;
  }

  /** Задать угол прицела текущего участника (`null` — убрать). */
  setAim(angle: number | null): void {
    aimLog("setAim", { a: angle === null ? null : Math.round(angle * 1000) / 1000 });
    const id = this.#currentId();
    if (id === null) return;
    this.setParticipantAim(id, angle);
  }

  /** Текущий угол прицела (текущего участника). */
  getAim(): number | null {
    return this.#currentAim();
  }

  /** Сила текущего участника 0..1. */
  getPreviewPower(): number {
    return this.#currentPower();
  }

  /** Битка нет на столе в текущем состоянии (скрач), режим размещения ещё не начат. */
  #rawNeedsPlacementIn(state: BilliardsState): boolean {
    return !state.balls.some((b) => b.id === 0 && b.active);
  }

  #rawNeedsPlacement(): boolean {
    const state = this.#runtime ?? this.#lastState ?? this.#lastFinished;
    if (!state) return false;
    return this.#rawNeedsPlacementIn(state);
  }

  /**
   * Ход начинается с установки битка (скрач): битка нет на столе. Пока постановка
   * не сделана, шар показывается на стартовой точке — как в начале партии.
   */
  needsCuePlacement(): boolean {
    // Биток появляется только на подготовке (CONTEXT «Цикл хода»): между
    // ударами поле не трогаем. Право позиционировать задаёт разбор правил —
    // после фола оно есть, даже если биток остался на столе.
    if (this.#turnPhase !== "preparing") return false;
    return this.#prepAllowsPlacement() || this.#rawNeedsPlacement();
  }

  /** Право подготовки текущего хода из состояния (`prep.canPlaceCue`). */
  #prepAllowsPlacement(): boolean {
    const state = this.#lastState ?? this.#lastFinished;
    return state?.prep?.canPlaceCue === true;
  }

  /** Действующая точка битка: явная постановка или стартовая, если ждём постановку. */
  #effectivePlacement(): CuePlacement | null {
    const cue = this.currentParticipant()?.cue;
    if (cue) return cue;
    if (!this.needsCuePlacement()) return null;
    const state = this.#lastState ?? this.#lastFinished;
    if (!state) return { x: HEAD_SPOT.x, y: HEAD_SPOT.y };
    // Биток на столе после фола — двигаем с текущего места; отсутствует —
    // появляется на стартовой точке (пятно или рядом без пересечений).
    const ball = state.balls.find((b) => b.id === 0 && b.active);
    if (ball) return { x: ball.x, y: ball.y };
    return cueBallInHandPosition(state.balls, this.#mode.id);
  }

  /**
   * Правая граница постановки битка, мм. Свежая партия (биток на столе) — кухня;
   * режим «с руки» после скрача (битка нет) — весь стол. Одна функция на все
   * места, чтобы показ, старт удара и клик не расходились.
   */
  #placementMax(state: BilliardsState): number {
    // Только начальное разбитие ограничено кухней. После фола `ballInHand`
    // разрешает весь стол, даже если биток остался на сукне.
    return state.ballInHand ? this.#geometry.length - this.#ballRadius : HEAD_SPOT.x;
  }

  /** Размеры поля и радиус шара активного режима. */
  #field(): Playfield {
    return { length: this.#geometry.length, width: this.#geometry.width, radius: this.#ballRadius };
  }

  /**
   * Состояние с действующим битком. Результат кэшируется по (состояние,
   * позиция, граница), чтобы между кадрами объект не менялся и preview не
   * сбрасывался по идентичности.
   */
  #shownState(state: BilliardsState): BilliardsState {
    const placement = this.#effectivePlacement();
    if (!placement) return state;
    const maxX = this.#placementMax(state);
    const cache = this.#placedCueCache;
    if (
      cache &&
      cache.state === state &&
      cache.x === placement.x &&
      cache.y === placement.y &&
      cache.maxX === maxX
    ) {
      return cache.result;
    }
    const result = withPlacedCue(state, placement.x, placement.y, maxX, this.#field());
    this.#placedCueCache = { state, x: placement.x, y: placement.y, maxX, result };
    return result;
  }

  /** Можно ли ставить/таскать биток: свежая партия, скрач или начатое размещение. */
  canPlaceCue(): boolean {
    // Только на подготовке хода: во время реплея и передачи хода поле не трогаем
    // (CONTEXT «Цикл хода»).
    if (this.#turnPhase !== "preparing") return false;
    const allowed =
      this.#canPlace || this.#placing || this.#prepAllowsPlacement() || this.#rawNeedsPlacement();
    return allowed && !this.#runtime;
  }

  /** Поставить биток в точку (локальный ввод: только когда постановка разрешена). */
  setCuePlacement(x: number, y: number): void {
    if (!this.canPlaceCue()) return;
    const p = this.currentParticipant();
    if (!p) return;
    p.cue = { x, y };
    this.#placing = true;
  }

  /**
   * Записать позицию битка участника без локального гейта: данные сетевого
   * соперника уже проверены на его стороне, и при чужом ходе локальный
   * `canPlaceCue()` их бы отбросил. Показ идёт через `#effectivePlacement`.
   */
  setParticipantCue(id: string, x: number, y: number): void {
    const p = this.#participants.get(id);
    if (!p) return;
    p.cue = { x, y };
  }

  /** Текущая постановка битка (`null`, если не поставлен). */
  getCuePlacement(): CuePlacement | null {
    return this.currentParticipant()?.cue ?? null;
  }

  /** Доступно ли перемещение битка (сейчас — только перед первым ударом). */
  canMove(): boolean {
    return this.canPlaceCue();
  }

  /** Начать перетаскивание битка (прицел скрывается). */
  startMove(): void {
    if (!this.canMove()) return;
    this.#moving = true;
    this.#preview.cancelPending();
  }

  /** Закончить перетаскивание (прицел возвращается к цели). */
  endMove(): void {
    this.#moving = false;
  }

  /** Идёт ли перетаскивание битка. */
  isMoving(): boolean {
    return this.#moving;
  }

  /** Наведение курсора на биток — стрелки ярче. */
  setCueHover(hover: boolean): void {
    this.#cueHover = hover;
  }

  /** Фаза мигания стрелок (0..1) — задаёт UI. */
  setBlink(phase: number): void {
    this.#blink = phase;
  }

  /** Сила текущего участника (0..1) — задаёт источник ввода. */
  setPreviewPower(power: number): void {
    aimLog("power", { p: Math.round(power * 1000) / 1000 });
    const id = this.#currentId();
    if (id === null) return;
    this.setParticipantPower(id, power);
  }

  /** Имя игрока для плашки перехода и экрана результата. */
  playerName(playerId: string): string {
    return this.#names[playerId] ?? playerId;
  }

  /**
   * Подпись группы игрока для панели: «Сплошные 1–7» / «Полосатые 9–15».
   * `null` — стол открыт, группы не назначены, показывать нечего.
   */
  playerGroupLabel(playerId: string, from?: BilliardsState): string | null {
    const state = from ?? this.#lastState ?? this.#lastFinished;
    const group = state?.groups?.[playerId] ?? null;
    if (group === null) return null;
    return group === "solid" ? "Сплошные 1–7" : "Полосатые 9–15";
  }

  /**
   * Забитые шары по игрокам — для панели (`BallsRow`). Разбивка по назначенным
   * группам; при открытом столе (групп нет) атрибуции нет и забитые показываются
   * у игрока, чей ход. Биток и 8 никому не приписываются.
   */
  getPocketedByPlayer(playerId: string, from?: BilliardsState): readonly number[] {
    const state = from ?? this.#runtime ?? this.#lastState ?? this.#lastFinished;
    if (!state) return [];
    const potted = state.balls.filter((b) => !b.active && b.id !== 0 && b.id !== 8).map((b) => b.id);
    if (potted.length === 0) return [];
    const group = state.groups?.[playerId] ?? null;
    if (group === null) return state.order[state.turn] === playerId ? potted : [];
    return potted.filter((id) => kindOf(id) === group);
  }

  /**
   * Настройки партии: правила режима и сложность ИИ. Шкала «авто» персистится
   * вместе с настройками (пер-игровой механизм, без нового ключа `game/<id>`).
   */
  override serializeSettings(): unknown {
    return {
      rules: this.#rules,
      difficulty: this.#difficulty,
      scale: this.#difficultyState.scale,
    };
  }

  override applySettings(settings: unknown): void {
    if (typeof settings !== "object" || settings === null) return;
    const data = settings as Record<string, unknown>;
    const rules = data.rules;
    // Мусор игнорируем: партия должна стартовать в любом случае.
    if (rules === "simple" || rules === "tournament") this.#rules = rules;
    this.#applyDifficultyValue(data.difficulty);
    const scale = data.scale;
    if (typeof scale === "number" && Number.isFinite(scale)) {
      this.#difficultyState = { ...this.#difficultyState, scale: clampScale(scale) };
    }
  }

  /** Идёт ли уточнение предпросмотра (нужно продолжить кадры). */
  hasPendingPreview(): boolean {
    return this.#preview.hasPending();
  }

  /** Запас под собственные панели игры (стороны в пикселях кадра). */
  setPanelInsets(insets: Partial<FitInsets>): void {
    this.#panelInsets = { ...this.#panelInsets, ...insets };
  }

  /** Угол прицела по умолчанию: на целевой шар (или `null`). */
  defaultAim(): number | null {
    const state = this.#runtime ?? this.#lastState ?? this.#lastFinished;
    if (!state) return null;
    return aimAngleToTarget(this.#shownState(state));
  }

  /** Позиция битка (мм) для наведения; `null`, если битка нет. */
  getCuePosition(): { x: number; y: number } | null {
    const state = this.#runtime ?? this.#lastState ?? this.#lastFinished;
    if (!state) return null;
    const cue = this.#shownState(state).balls.find((b) => b.id === 0 && b.active);
    return cue ? { x: cue.x, y: cue.y } : null;
  }

  override attachEnvironment(environment: GameEnvironment): void {
    const { setup, ui } = environment.game;
    // Зоны игры: их место резервируем в рендере сами (холст на весь экран).
    this.#ui = ui;
    this.#dialogs = environment.game.dialogs;
    // Правила из формы — в состояние новой партии (CONTEXT п.4).
    this.#unsubscribe.push(
      setup.on("rules", "change", (value) => {
        if (value === "simple" || value === "tournament") this.#rules = value;
      }),
    );
    // Сложность ИИ: контролл преднастройки, значение попадает в игру на старте.
    this.#unsubscribe.push(
      setup.on("difficulty", "change", (value) => {
        this.#applyDifficultyValue(value);
      }),
    );
    this.#unsubscribe.push(
      setup.on("start-hotseat", "press", () => {
        void this.#start(environment, { humans: 2, computers: 0 });
      }),
    );
    this.#unsubscribe.push(
      setup.on("start-vs-computer", "press", () => {
        void this.#start(environment, { humans: 1, computers: 1 });
      }),
    );
    // Сеть: только лобби и запуск (обмен ударами — подфаза 02-d).
    this.#unsubscribe.push(
      setup.on("start-host", "press", () => {
        void this.#startNetwork(environment, "host");
      }),
    );
    this.#unsubscribe.push(
      setup.on("start-join", "press", () => {
        void this.#startNetwork(environment, "join");
      }),
    );
  }

  override detachEnvironment(): void {
    // Закрытие экрана преднастроек снимает только подписки на её сигналы.
    // Рантайм партии (#lastState, участники) и зоны (#ui) не трогаем: detach
    // прилетает после запуска, когда отрисовка уже идёт на этом же объекте.
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
  }

  /**
   * Итог партии: **игра сама решает**, что она закончена (её `applyMove` вернул
   * `finished`), и сама просит платформу показать окно. Промис — ответ игрока;
   * закрыли иначе, чем кнопкой, — отказ. Флагов нет: новая партия доигрывается
   * заново. Итоговые данные (счёт, победитель) — в подфазе 02-b; победителя
   * несёт состояние партии и `MoveResult.winnerId`.
   */
  async #showResult(state: BilliardsState): Promise<void> {
    const dialogs = this.#dialogs;
    if (!dialogs) return;
    const winner = state.winner;
    const name = winner === null ? "" : (this.#names[winner] ?? winner);
    // Причина по правилам: легальная 8 — победа забившего, неправильная 8 в
    // турнирных правилах — победа соперника (простые правила партию не
    // завершают, такого результата в них не бывает).
    const reason =
      state.finishReason === "foulOnEight" ? "неправильно забил 8" : "забил 8";
    try {
      const answer = await dialogs.show({
        title: "Партия окончена",
        message: winner === null ? "Партия сыграна" : `Победил ${name} (${reason})`,
        actions: [
          { label: "Ещё раз", value: "rematch", variant: "primary" },
          { label: "В меню", value: "menu", variant: "secondary" },
        ],
      });
      if (answer.value === "rematch") dialogs.rematch();
      else dialogs.exitToMenu();
    } catch {
      /* Окно закрыли иначе (выход через меню, смена сессии) — решать нечего. */
    }
  }

  async #start(
    environment: GameEnvironment,
    options: { humans: number; computers: number },
  ): Promise<void> {
    if (this.#starting) return;
    this.#starting = true;
    try {
      // Выбранная сложность — из формы преднастройки (образец tic-tac).
      this.#applyDifficultyValue(environment.game.setup.getValue("difficulty"));
      const players = await environment.lobby.defaultPlayers(options);
      this.setRoster(players);
      await environment.launch(players);
    } catch {
      /* Запуск не удался — экран преднастройки остаётся; игра не падает. */
    } finally {
      this.#starting = false;
    }
  }

  /** Сетевой запуск: лобби платформы (создание или присоединение). */
  async #startNetwork(environment: GameEnvironment, kind: "host" | "join"): Promise<void> {
    if (this.#starting) return;
    this.#starting = true;
    try {
      const players =
        kind === "host"
          ? await environment.lobby.showHost()
          : await environment.lobby.showClient();
      if (players === null) return;
      this.setRoster(players);
      await environment.launch(players);
    } catch {
      /* Лобби закрыли или рукопожатие не удалось — экран преднастройки остаётся. */
    } finally {
      this.#starting = false;
    }
  }
}

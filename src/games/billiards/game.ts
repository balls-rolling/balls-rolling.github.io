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
import type { PlayerPanelSchema } from "@/core/game";
import type { UiZones } from "@/core/ui-zones";
import { BALL_RADIUS, HEAD_SPOT, MAX_SHOT_SECONDS, PHYS_DT, TABLE_WIDTH } from "./constants";
import { applyShot, isAtRest, isValidShot, step, strike, type Shot } from "./physics";
import { aimAngleToTarget } from "./aim";
import {
  computeFit,
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
} from "./state";

/** Преднастройка: пока одна кнопка запуска схемы. */
const setupForm: FormSchema = {
  id: "billiards-setup",
  nodes: [
    {
      type: "group",
      id: "billiards-start",
      label: "Схема",
      frame: true,
      children: [
        {
          type: "control",
          control: {
            id: "run",
            kind: "button",
            label: "Запустить схему",
            signals: ["press"],
            variant: "primary",
          },
        },
      ],
    },
  ],
};

/** Разобрать ход-удар из непрозрачного `Move`; мусор — `null`. */
function parseShot(move: Move): Shot | null {
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

/** Вернуть состояние с битком в заданной точке; x ограничен стартовой линией. */
function withPlacedCue(state: BilliardsState, x: number, y: number): BilliardsState {
  const cx = Math.min(Math.max(x, BALL_RADIUS), HEAD_SPOT.x);
  const cy = Math.min(Math.max(y, BALL_RADIUS), TABLE_WIDTH - BALL_RADIUS);
  return {
    ...state,
    balls: state.balls.map((b) => (b.id === 0 ? { ...b, x: cx, y: cy, vx: 0, vy: 0 } : b)),
  };
}

/** Максимум шагов физики на кадр анимации (защита от «спирали смерти»). */
const MAX_STEPS_PER_FRAME = 16;

/** Бильярд. На фазе 02 показывает схему стола и шаров. */
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
  /** Угол наведения; `null` — прицела нет. Не входит в состояние. */
  #aim: number | null = null;
  /** Поставленный биток (до первого удара); `null` — на головном пятне. */
  #cuePlacement: CuePlacement | null = null;
  /** Можно ли ещё ставить биток (свежая партия, ни одного удара). */
  #canPlace = true;
  /** Идёт перетаскивание битка (прицел скрыт). */
  #moving = false;
  /** Курсор наведён на биток (стрелки ярче). */
  #cueHover = false;
  /** Фаза мигания стрелок 0..1. */
  #blink = 0;
  /** Запас под собственные панели игры (боковые/нижняя), задаёт UI. */
  #panelInsets: FitInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  /** Зоны интерфейса игры: их место игра резервирует в рендере сама. */
  #ui: UiZones | null = null;

  override getSetupForm(): FormSchema {
    return setupForm;
  }

  override getViewOptions(): GameViewOptions {
    // Бильярд: стол фиксирован целиком — ни зума, ни панорамы, ни сетки.
    // Панель участников — системная; счёт и шары в ней нужны.
    return { zoom: false, pan: false, grid: false, playersStats: true };
  }

  override getPlayerPanel(): PlayerPanelSchema {
    // Слоты панели игрока: бонусы в строке с именем, забитые шары — внизу.
    // Данных пока нет (правила 05+) — виджеты рисуют места.
    const widget = (id: string, token: string): FormNode => ({
      type: "control",
      control: { id, kind: "widget", label: token, value: token },
    });
    return {
      nameRow: [widget("panel-bonus", "billiards.bonus")],
      bottomRow: [widget("panel-balls", "billiards.balls")],
    };
  }

  createInitialState(playerIds: readonly string[]): GameState {
    return createInitialState(playerIds);
  }

  applyMove(state: GameState, _playerId: string, move: Move): MoveResult {
    // Правила и переход хода — не здесь (фазы режимов). Ход = удар до покоя.
    const shot = parseShot(move);
    if (!shot) {
      return { accepted: false, state, finished: this.isFinished(state) };
    }
    let base = state as BilliardsState;
    if (typeof shot.cueY === "number" || typeof shot.cueX === "number") {
      const cue = base.balls.find((b) => b.id === 0);
      base = withPlacedCue(base, shot.cueX ?? cue?.x ?? HEAD_SPOT.x, shot.cueY ?? cue?.y ?? 0);
    }
    this.#canPlace = false;
    this.#cuePlacement = null;
    const next = applyShot(base, shot);
    const finished = this.isFinished(next);
    // Победителя бильярд не знает: правила режимов (и очки) — фаза 05+.
    // Показываем факт окончания, не выдумывая имя.
    if (finished) void this.#showResult();
    return { accepted: true, state: next, finished };
  }

  chooseMove(_state: GameState, _playerId: string): Move | null {
    return null;
  }

  nextPlayer(state: GameState, _playerId: string): string | null {
    const billiards = state as BilliardsState;
    if (billiards.order.length === 0) return null;
    return billiards.order[(billiards.turn + 1) % billiards.order.length] ?? null;
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
    if (state !== null) this.#canPlace = false;
    return state;
  }

  draw(state: GameState, frame: GameRenderFrame): void {
    const insets = this.getInsets();
    if (this.#runtime) {
      // Во время реплея прицел не рисуется, но запас под панели сохраняется —
      // иначе стол на кадр «прыгает» в увеличенный масштаб.
      drawBilliards(this.#runtime, frame, { aim: null, insets });
      return;
    }
    this.#lastState = state as BilliardsState;
    // Поставленный биток рисуется на новом месте (слот установки), состояние не трогаем.
    const shown = this.#cuePlacement
      ? withPlacedCue(this.#lastState, this.#cuePlacement.x, this.#cuePlacement.y)
      : this.#lastState;
    // В покое прицел виден сразу и смотрит в целевой шар; при перемещении — скрыт.
    const aim = this.#moving ? null : (this.#aim ?? aimAngleToTarget(shown) ?? DEFAULT_AIM_ANGLE);
    drawBilliards(shown, frame, {
      aim,
      arrows: this.canMove() && !this.#moving,
      hover: this.#cueHover,
      blink: this.#blink,
      insets,
    });
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
    const placed =
      typeof shot.cueY === "number" || typeof shot.cueX === "number"
        ? (() => {
            const cue = base.balls.find((b) => b.id === 0);
            return withPlacedCue(
              base,
              shot.cueX ?? cue?.x ?? HEAD_SPOT.x,
              shot.cueY ?? cue?.y ?? 0,
            );
          })()
        : base;
    this.#lastFinished = null;
    this.#runtime = strike(placed, shot);
    this.#accumulator = 0;
    this.#animElapsed = 0;
    this.#aim = null; // прицел снимаем на время удара
    this.#cuePlacement = null; // биток поставлен — слот установки больше не нужен
    this.#canPlace = false;
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
      this.#runtime = step(this.#runtime);
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

  /** Сбросить весь рантайм анимации и прицел (рестарт/снятие окружения). */
  resetRuntime(): void {
    this.#runtime = null;
    this.#lastFinished = null;
    this.#lastState = null;
    this.#accumulator = 0;
    this.#animElapsed = 0;
    this.#aim = null;
  }

  /** Идёт ли воспроизведение удара. */
  isAnimating(): boolean {
    return this.#runtime !== null;
  }

  /** Задать угол прицела (`null` — убрать). */
  setAim(angle: number | null): void {
    this.#aim = angle;
  }

  /** Текущий угол прицела. */
  getAim(): number | null {
    return this.#aim;
  }

  /** Можно ли ещё ставить биток (свежая партия, ни одного удара). */
  canPlaceCue(): boolean {
    return this.#canPlace && !this.#runtime;
  }

  /** Поставить биток в точку «кухни» (позади стартовой линии). */
  setCuePlacement(x: number, y: number): void {
    if (!this.canPlaceCue()) return;
    this.#cuePlacement = { x, y };
  }

  /** Текущая постановка битка (`null`, если не поставлен). */
  getCuePlacement(): CuePlacement | null {
    return this.#cuePlacement;
  }

  /** Доступно ли перемещение битка (сейчас — только перед первым ударом). */
  canMove(): boolean {
    return this.canPlaceCue();
  }

  /** Начать перетаскивание битка (прицел скрывается). */
  startMove(): void {
    if (!this.canMove()) return;
    this.#moving = true;
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

  /** Запас под собственные панели игры (стороны в пикселях кадра). */
  setPanelInsets(insets: Partial<FitInsets>): void {
    this.#panelInsets = { ...this.#panelInsets, ...insets };
  }

  /** Угол прицела по умолчанию: на целевой шар (или `null`). */
  defaultAim(): number | null {
    const state = this.#runtime ?? this.#lastState;
    if (!state) return null;
    const shown = this.#cuePlacement
      ? withPlacedCue(state, this.#cuePlacement.x, this.#cuePlacement.y)
      : state;
    return aimAngleToTarget(shown);
  }

  /** Позиция битка (мм) для наведения; `null`, если битка нет. */
  getCuePosition(): { x: number; y: number } | null {
    const state = this.#runtime ?? this.#lastState;
    if (!state) return null;
    const placed = this.#cuePlacement
      ? withPlacedCue(state, this.#cuePlacement.x, this.#cuePlacement.y)
      : state;
    const cue = placed.balls.find((b) => b.id === 0 && b.active);
    return cue ? { x: cue.x, y: cue.y } : null;
  }

  override attachEnvironment(environment: GameEnvironment): void {
    const { setup, ui } = environment.game;
    // Зоны игры: их место резервируем в рендере сами (холст на весь экран).
    this.#ui = ui;
    this.#dialogs = environment.game.dialogs;
    this.#unsubscribe.push(
      setup.on("run", "press", () => {
        void this.#start(environment);
      }),
    );
  }

  override detachEnvironment(): void {
    // Закрытие экрана преднастроек снимает только подписки на её сигналы.
    // Рантайм партии (#lastState, #aim) и зоны (#ui) не трогаем: detach
    // прилетает после запуска, когда отрисовка уже идёт на этом же объекте.
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
  }

  /**
   * Итог партии: **игра сама решает**, что она закончена (её `applyMove` вернул
   * `finished`), и сама просит платформу показать окно. Промис — ответ игрока;
   * закрыли иначе, чем кнопкой, — отказ. Флагов нет: новая партия доигрывается
   * заново. Итоговые данные (счёт, победитель) придут с правилами режимов
   * (05+); здесь только факт окончания.
   */
  async #showResult(): Promise<void> {
    const dialogs = this.#dialogs;
    if (!dialogs) return;
    try {
      const answer = await dialogs.show({
        title: "Партия окончена",
        message: "Партия сыграна",
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

  async #start(environment: GameEnvironment): Promise<void> {
    try {
      const players = await environment.lobby.defaultPlayers({ humans: 1 });
      await environment.launch(players);
    } catch {
      /* Запуск не удался — экран преднастройки остаётся; игра не падает. */
    }
  }
}

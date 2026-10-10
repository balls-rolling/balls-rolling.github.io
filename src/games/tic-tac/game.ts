// Адаптер крестиков-ноликов над базовым `Game`: правила и очередь хода целиком
// в игре, ядро их не разбирает. Рендер и UI — фаза 07.
import {
  Game,
  type Dialogs,
  type GameEnvironment,
  type GameRenderFrame,
  type GameState,
  type Move,
  type MoveResult,
} from "@/core/game";
import type { FormHandle, FormSchema } from "@/core/form";
import { definePropertySchema, type PlayerInit } from "@/core/player";
import { chooseMove as chooseBrainMove } from "./brain";
import { canPlace, findWin, key, type Cell } from "./rules";

/** Варианты уровня ИИ — общие для схемы свойств и формы преднастройки. */
const LEVEL_OPTIONS = [
  { value: "0", label: "Новичок" },
  { value: "1", label: "Лёгкий" },
  { value: "2", label: "Средний" },
  { value: "3", label: "Сложный" },
  { value: "4", label: "Мастер" },
] as const;

/** Схема игровых свойств: уровень ИИ — пример игровой настройки. */
const propertySchema = definePropertySchema([
  {
    key: "level",
    label: "Уровень ИИ",
    control: {
      id: "level",
      kind: "select",
      label: "Уровень ИИ",
      value: "2",
      options: LEVEL_OPTIONS,
      signals: ["change"],
    },
    isValid: (value) => typeof value === "string" && ["0", "1", "2", "3", "4"].includes(value),
  },
]);

/** Преднастройка: режим и сложность. Кнопки запускает игра в `attachEnvironment`. */
const setupForm: FormSchema = {
  id: "tic-tac-toe-setup",
  nodes: [
    {
      type: "group",
      id: "tt-mode",
      label: "Режим",
      frame: true,
      children: [
        {
          type: "control",
          control: {
            id: "vs-computer",
            kind: "button",
            label: "С компьютером",
            icon: "users",
            signals: ["press"],
          },
        },
        {
          type: "control",
          control: {
            id: "hotseat",
            kind: "button",
            label: "Двое за экраном",
            icon: "users",
            signals: ["press"],
          },
        },
      ],
    },
    {
      type: "group",
      id: "tt-level",
      label: "Сложность",
      frame: true,
      children: [
        {
          type: "control",
          control: {
            id: "level",
            kind: "select",
            label: "Уровень ИИ",
            value: "2",
            options: LEVEL_OPTIONS,
            signals: ["change"],
          },
        },
      ],
    },
    {
      type: "group",
      id: "tt-network",
      label: "Сеть",
      frame: true,
      orientation: "horizontal",
      children: [
        {
          type: "control",
          control: {
            id: "host",
            kind: "button",
            label: "Создать",
            icon: "plus",
            signals: ["press"],
          },
        },
        {
          type: "control",
          control: {
            id: "join",
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

/** Состояние партии: камни по игрокам, их глифы и признак конца. */
interface TicTacToeState extends GameState {
  readonly order: readonly string[];
  readonly sets: Readonly<Record<string, ReadonlySet<string>>>;
  readonly glyphs: Readonly<Record<string, string>>;
  readonly total: number;
  readonly finished: boolean;
  readonly winnerId: string | null;
  readonly lastMove: Cell | null;
  readonly winLine: readonly Cell[] | null;
}

export class TicTacToeGame extends Game {
  readonly id = "tic-tac-toe";
  readonly label = "Крестики-нолики";

  /** Уровень ИИ (0..4). Настраивается формой преднастройки (фаза 07). */
  level = 2;
  /** Пропускать немедленную победу (рычаг для тестов/слабого ИИ); демо его не включает. */
  missWin = false;

  /** Отписки от сигналов формы: снимаются в `detachEnvironment`. */
  #unsubscribe: Array<() => void> = [];
  /** Идёт сетевое рукопожатие: повторные нажатия игнорируем. */
  #networkPending = false;
  /** Инструмент платформы «показать окно». В демо окружения нет — итога нет. */
  #dialogs: Dialogs | null = null;
  /** Имена игроков: их игра знает при запуске, в состоянии партии имён нет. */
  #names = new Map<string, string>();

  override getPropertySchema() {
    return propertySchema;
  }

  override getSetupForm(): FormSchema {
    return setupForm;
  }

  /** Демо — два компьютера. Средний уровень: партия должна завершаться. */
  override getDemoPlayers(): readonly PlayerInit[] {
    this.level = 2;
    this.missWin = false;
    return [
      { id: "ai-1", name: "Компьютер 1", agent: "computer", transport: "local" },
      { id: "ai-2", name: "Компьютер 2", agent: "computer", transport: "local" },
    ];
  }

  override attachEnvironment(environment: GameEnvironment): void {
    const { setup } = environment.game;
    this.#dialogs = environment.game.dialogs;
    this.#unsubscribe.push(
      setup.on("vs-computer", "press", () => {
        void this.#start(environment, setup, { humans: 1, computers: 1 });
      }),
      setup.on("hotseat", "press", () => {
        void this.#start(environment, setup, { humans: 2, computers: 0 });
      }),
      setup.on("host", "press", () => {
        void this.#launchNetwork(environment, "host");
      }),
      setup.on("join", "press", () => {
        void this.#launchNetwork(environment, "join");
      }),
    );
  }

  override detachEnvironment(): void {
    // Закрытие экрана преднастроек снимает только подписки на его сигналы.
    // Инструмент итога не трогаем: партия идёт уже сейчас, а detach прилетает
    // сразу после запуска — сбросил бы инструмент до конца партии.
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
  }

  /** Сетевая партия: лобби собирает состав и транспорт, затем запуск. */
  async #launchNetwork(environment: GameEnvironment, kind: "host" | "join"): Promise<void> {
    if (this.#networkPending) return;
    this.#networkPending = true;
    try {
      const players =
        kind === "host" ? await environment.lobby.showHost() : await environment.lobby.showClient();
      if (players) await environment.launch(players);
    } catch {
      /* Сетевое рукопожатие не удалось — экран лобби сообщит; игра не падает. */
    } finally {
      this.#networkPending = false;
    }
  }

  async #start(
    environment: GameEnvironment,
    setup: FormHandle,
    roster: { humans: number; computers: number },
  ): Promise<void> {
    this.level = clampLevel(Number(setup.getValue("level") ?? 2));
    const players = await environment.lobby.defaultPlayers(roster);
    this.#names = new Map(players.map((p) => [p.id, p.name]));
    await environment.launch(players);
  }

  /**
   * Итог партии: **игра сама решает**, что она закончена (её `applyMove`
   * вернул победу), и сама просит платформу показать окно. Промис — это ответ
   * игрока; окно закрыли иначе, чем кнопкой, — отказ, и это не ошибка.
   * Никаких флагов: новая партия просто доигрывается заново.
   */
  async #showResult(winnerId: string | null): Promise<void> {
    const dialogs = this.#dialogs;
    if (!dialogs) return;
    const name = winnerId ? this.#names.get(winnerId) : null;
    try {
      const answer = await dialogs.show({
        title: "Партия окончена",
        message: name ? `Победил ${name}` : "Ничья",
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

  createInitialState(playerIds: readonly string[]): GameState {
    const sets: Record<string, ReadonlySet<string>> = {};
    const glyphs: Record<string, string> = {};
    playerIds.forEach((id, index) => {
      sets[id] = new Set<string>();
      glyphs[id] = index % 2 === 0 ? "X" : "O";
    });
    return {
      order: [...playerIds],
      sets,
      glyphs,
      total: 0,
      finished: false,
      winnerId: null,
      lastMove: null,
      winLine: null,
    } satisfies TicTacToeState;
  }

  applyMove(state: GameState, playerId: string, move: Move): MoveResult {
    const current = state as TicTacToeState;
    const x = move.x;
    const y = move.y;
    const reject: MoveResult = { accepted: false, state, finished: false };

    if (typeof x !== "number" || typeof y !== "number") return reject;
    if (current.finished) return reject;
    if (!current.order.includes(playerId)) return reject;
    if (!canPlace(Object.values(current.sets), x, y)) return reject;

    const placed = new Set(current.sets[playerId]);
    placed.add(key(x, y));
    const sets = { ...current.sets, [playerId]: placed };
    const line = findWin(placed, x, y);
    const finished = line !== null;
    const next: TicTacToeState = {
      ...current,
      sets,
      total: current.total + 1,
      finished,
      winnerId: finished ? playerId : null,
      lastMove: { x, y },
      winLine: line,
    };
    if (finished) void this.#showResult(playerId);
    return { accepted: true, state: next, finished, winnerId: next.winnerId };
  }

  chooseMove(state: GameState, playerId: string): Move | null {
    const current = state as TicTacToeState;
    if (current.finished) return null;

    const own = current.sets[playerId] ?? new Set<string>();
    const opp = new Set<string>();
    for (const id of current.order) {
      if (id === playerId) continue;
      for (const stone of current.sets[id] ?? []) opp.add(stone);
    }

    const cell = chooseBrainMove(own, opp, this.level, { missWin: this.missWin });
    return { x: cell.x, y: cell.y };
  }

  nextPlayer(state: GameState, playerId: string): string | null {
    const current = state as TicTacToeState;
    if (current.finished) return null;
    const index = current.order.indexOf(playerId);
    if (index < 0 || current.order.length === 0) return null;
    return current.order[(index + 1) % current.order.length] ?? null;
  }

  isFinished(state: GameState): boolean {
    return (state as TicTacToeState).finished;
  }

  /**
   * Состояние крестиков-ноликов в переносимые plain-данные. Наборы камней —
   * `Set` — не переживают `JSON.stringify`, поэтому раскладываются в массивы
   * строк. Остальные поля копируются как есть.
   */
  override serializeState(state: GameState): unknown {
    const s = state as TicTacToeState;
    const sets: Record<string, string[]> = {};
    for (const [id, stones] of Object.entries(s.sets)) sets[id] = [...stones];
    return {
      order: [...s.order],
      sets,
      glyphs: { ...s.glyphs },
      total: s.total,
      finished: s.finished,
      winnerId: s.winnerId,
      lastMove: s.lastMove === null ? null : { x: s.lastMove.x, y: s.lastMove.y },
      winLine: s.winLine === null ? null : s.winLine.map((c) => ({ x: c.x, y: c.y })),
    };
  }

  /**
   * Восстановить состояние из `serializeState`. Форма строго проверяется,
   * `Set` собирается заново; при любом несоответствии возвращается `null`
   * (исключения наружу не летят — сохранение отбрасывает вызывающий).
   */
  override deserializeState(data: unknown): GameState | null {
    if (!isRecord(data)) return null;
    const { order, sets, glyphs, total, finished, winnerId, lastMove, winLine } = data;
    if (!isStringArray(order)) return null;
    if (!isStringArrayRecord(sets)) return null;
    if (!isStringRecord(glyphs)) return null;
    if (typeof total !== "number") return null;
    if (typeof finished !== "boolean") return null;
    if (winnerId !== null && typeof winnerId !== "string") return null;

    let last: Cell | null = null;
    if (lastMove !== null) {
      if (!isCell(lastMove)) return null;
      last = lastMove;
    }

    let line: readonly Cell[] | null = null;
    if (winLine !== null) {
      if (!Array.isArray(winLine) || !winLine.every(isCell)) return null;
      line = winLine;
    }

    const rebuilt: Record<string, ReadonlySet<string>> = {};
    for (const [id, stones] of Object.entries(sets)) rebuilt[id] = new Set(stones);

    return {
      order: [...order],
      sets: rebuilt,
      glyphs: { ...glyphs },
      total,
      finished,
      winnerId,
      lastMove: last,
      winLine: line === null ? null : line.map((c) => ({ x: c.x, y: c.y })),
    } satisfies TicTacToeState;
  }

  /** Настройки крестиков-ноликов: уровень ИИ. */
  override serializeSettings(): unknown {
    return { level: this.level };
  }

  /** Применить настройки; `level` клампится в 0..4, иные данные игнорируются. */
  override applySettings(data: unknown): void {
    if (!isRecord(data)) return;
    const level = data.level;
    if (typeof level !== "number") return;
    this.level = clampLevel(level);
  }

  /** Нарисовать камни, линию победы и метку последнего хода. */
  draw(state: GameState, frame: GameRenderFrame): void {
    const s = state as TicTacToeState;
    const colors = frame.colors;
    const ctx = frame.ctx;
    const scale = frame.camera.scale;
    const radius = Math.max(3, scale * 0.3);
    const winKeys = new Set((s.winLine ?? []).map((c) => key(c.x, c.y)));
    ctx.lineCap = "round";

    for (const id of s.order) {
      const side = s.glyphs[id] ?? "X";
      for (const cellKey of s.sets[id] ?? []) {
        const [x, y] = cellKey.split(",").map(Number);
        if (x === undefined || y === undefined) continue;
        const center = frame.toScreen({ x: x + 0.5, y: y + 0.5 });
        const isWin = winKeys.has(cellKey);
        ctx.strokeStyle = side === "X" ? colors.x : colors.o;
        ctx.lineWidth = isWin ? Math.max(3, scale * 0.12) : Math.max(2, scale * 0.07);
        ctx.beginPath();
        if (side === "X") {
          ctx.moveTo(center.x - radius, center.y - radius);
          ctx.lineTo(center.x + radius, center.y + radius);
          ctx.moveTo(center.x + radius, center.y - radius);
          ctx.lineTo(center.x - radius, center.y + radius);
        } else {
          ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        }
        ctx.stroke();
        if (isWin) {
          ctx.fillStyle = side === "X" ? colors.x : colors.o;
          ctx.beginPath();
          ctx.arc(center.x, center.y - radius - 4, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const last = s.lastMove;
    if (last) {
      const center = frame.toScreen({ x: last.x + 0.5, y: last.y + 0.5 });
      ctx.fillStyle = colors.grid;
      ctx.beginPath();
      ctx.arc(center.x, center.y + radius + 5, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Уровень ИИ в допустимом диапазоне 0..4. */
function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return 2;
  return Math.min(4, Math.max(0, Math.trunc(value)));
}

/** Значение — непустой объект-запись (не массив, не null). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Значение — массив строк. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Значение — объект, все значения которого — массивы строк. */
function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
  return isRecord(value) && Object.values(value).every(isStringArray);
}

/** Значение — объект, все значения которого — строки. */
function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

/** Значение — координата клетки `{x, y}` с числами. */
function isCell(value: unknown): value is Cell {
  if (!isRecord(value)) return false;
  return typeof value.x === "number" && typeof value.y === "number";
}

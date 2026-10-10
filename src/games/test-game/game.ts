import {
  Game,
  type GameEnvironment,
  type GameState,
  type Move,
  type MoveResult,
} from "@/core/game";
import { definePropertySchema } from "@/core/player";
import type { FormNode, FormSchema } from "@/core/form";
import type { BoardColors, GameRenderFrame } from "@/core/game/render";
import type { UiLayoutSchema } from "@/core/ui-zones";

// Тестовая игра: не для прода, а чтобы проверять платформу по-настоящему — через
// реестр, сессию и игровые свойства, как любая другая игра.
//
// Правила намеренно тривиальны: ходы по очереди, побеждает первый, кто сделал
// три хода. Смысл не в правилах, а в том, что через неё дёргаются все механизмы
// ядра.

/** Сколько ходов нужно для победы. */
const TARGET_MOVES = 3;

interface TestState extends GameState {
  readonly order: readonly string[];
  readonly moves: Readonly<Record<string, number>>;
  readonly total: number;
}

/** Тестовая кнопка для зон и панелей: проверяет, что контролл доходит до слота. */
function testButton(id: string, label: string, variant?: "secondary"): FormNode {
  return {
    type: "control",
    control: { id, kind: "button", label, ...(variant ? { variant } : {}), signals: ["press"] },
  };
}

/** Строка настроечного листа: подпись слева и образцы справа (x — начало образцов). */
interface TestRow {
  readonly label: string;
  readonly paint: (ctx: CanvasRenderingContext2D, x: number, cy: number, c: BoardColors) => void;
}

/** Строки листа: окружности, квадраты, линии, текст, цвета токенов. */
const TEST_ROWS: readonly TestRow[] = [
  {
    label: "Окружности (r)",
    paint: (ctx, x, cy, c) => {
      [2, 4, 8, 16, 24].forEach((r, i) => {
        const cx = x + 20 + i * 64;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = c.x;
        ctx.stroke();
        ctx.fillStyle = c.x;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(r), cx, cy + 34);
        ctx.textAlign = "left";
      });
    },
  },
  {
    label: "Квадраты (сторона)",
    paint: (ctx, x, cy, c) => {
      [8, 16, 32, 48].forEach((s, i) => {
        const cx = x + 20 + i * 64;
        ctx.strokeStyle = c.o;
        ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);
        ctx.fillStyle = c.x;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(s), cx, cy + 34);
        ctx.textAlign = "left";
      });
    },
  },
  {
    label: "Линии (толщина, пунктир)",
    paint: (ctx, x, cy, c) => {
      ctx.strokeStyle = c.x;
      [1, 2, 4, 6].forEach((w, i) => {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x + 20, cy - 24 + i * 16);
        ctx.lineTo(x + 180, cy - 24 + i * 16);
        ctx.stroke();
      });
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x + 220, cy - 24);
      ctx.lineTo(x + 220, cy + 24);
      ctx.stroke();
      ctx.setLineDash([]);
    },
  },
  {
    label: "Текст (кегль)",
    paint: (ctx, x, cy, c) => {
      ctx.fillStyle = c.x;
      let cursor = x + 20;
      [12, 16, 24].forEach((s) => {
        ctx.font = `${s}px sans-serif`;
        const text = `Aa Бб ${s}`;
        ctx.fillText(text, cursor, cy);
        cursor += ctx.measureText(text).width + 24;
      });
    },
  },
  {
    label: "Цвета (токены)",
    paint: (ctx, x, cy, c) => {
      const swatches: Array<[string, string]> = [
        ["bg", c.bg],
        ["grid", c.grid],
        ["x", c.x],
        ["o", c.o],
      ];
      swatches.forEach(([name, color], i) => {
        const sx = x + 20 + i * 90;
        ctx.fillStyle = color;
        ctx.fillRect(sx, cy - 16, 56, 32);
        ctx.strokeStyle = c.x;
        ctx.strokeRect(sx, cy - 16, 56, 32);
        ctx.fillStyle = c.x;
        ctx.font = "11px sans-serif";
        ctx.fillText(name, sx, cy + 30);
      });
    },
  },
];

/** Схема игровых свойств: проверка механизма игровых настроек. */
const propertySchema = definePropertySchema([
  {
    key: "testLevel",
    label: "Тестовый уровень",
    control: {
      id: "testLevel",
      kind: "number",
      label: "Тестовый уровень",
      value: 0,
      signals: ["change"],
    },
    isValid: (value) => typeof value === "number" && value >= 0 && value <= 3,
    normalize: (value) => Math.trunc(value as number),
  },
]);

/**
 * Преднастройка игры: декларативная схема, рендер — дело UI-слоя.
 * Кнопки объявляет игра, а что делать на их нажатие — решает она же в
 * `attachEnvironment`. Никаких флагов «нужна сеть»: есть кнопки лобби.
 */
const setupForm: FormSchema = {
  id: "test-game-setup",
  nodes: [
    {
      type: "group",
      id: "t-modes",
      label: "Режим",
      frame: true,
      children: [
        {
          type: "control",
          control: { id: "solo", kind: "button", label: "Один", icon: "play", signals: ["press"] },
        },
        {
          type: "control",
          control: {
            id: "versus",
            kind: "button",
            label: "С компьютером",
            icon: "users",
            signals: ["press"],
          },
        },
      ],
    },
    {
      type: "group",
      id: "t-network",
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
    {
      type: "text",
      id: "t-note",
      text: "Тестовая игра: проверяет меню, лобби и запуск сессии. В прод не идёт.",
      multiline: true,
    },
  ],
};

export class TestGame extends Game {
  readonly id = "test-game";
  readonly label = "Тестовая игра";

  /** Отписки от сигналов формы: снимаются в `detachEnvironment`. */
  #unsubscribe: Array<() => void> = [];

  createInitialState(playerIds: readonly string[]): GameState {
    const moves: Record<string, number> = {};
    for (const id of playerIds) moves[id] = 0;
    return { order: [...playerIds], moves, total: 0 } satisfies TestState;
  }

  applyMove(state: GameState, playerId: string, move: Move): MoveResult {
    const current = state as TestState;
    if (typeof move.step !== "number") {
      return { accepted: false, state, finished: false };
    }

    const moves = { ...current.moves, [playerId]: (current.moves[playerId] ?? 0) + 1 };
    const next: TestState = { ...current, moves, total: current.total + 1 };

    const finished = moves[playerId]! >= TARGET_MOVES;
    return {
      accepted: true,
      state: next,
      finished,
      winnerId: finished ? playerId : null,
    };
  }

  chooseMove(): Move {
    return { step: 1 };
  }

  nextPlayer(state: GameState, playerId: string): string {
    const { order } = state as TestState;
    return order[(order.indexOf(playerId) + 1) % order.length]!;
  }

  isFinished(state: GameState): boolean {
    return (
      (state as TestState).total > 0 &&
      Object.values((state as TestState).moves).some((n) => n >= TARGET_MOVES)
    );
  }

  override getPropertySchema() {
    return propertySchema;
  }

  override getSetupForm(): FormSchema {
    return setupForm;
  }

  /**
   * Тестовая зона: платформа — обычная игра, поэтому каркас зон проверяется
   * здесь же (верхняя зона с кнопкой-сигналом и подписью). В прод не идёт.
   */
  override getUiLayout(): UiLayoutSchema {
    return {
      zones: {
        top: {
          nodes: [
            {
              type: "control",
              control: {
                id: "zone-note",
                kind: "button",
                label: "Зона сверху",
                variant: "secondary",
                signals: ["press"],
              },
            },
            { type: "text", id: "zone-hint", text: "Проверка зон платформы" },
            testButton("top-2", "Кнопка 2"),
            testButton("top-3", "Кнопка 3"),
          ],
        },
        bottom: {
          nodes: [
            testButton("bottom-1", "Низ 1"),
            testButton("bottom-2", "Низ 2", "secondary"),
            {
              type: "control",
              control: {
                id: "bottom-number",
                kind: "number",
                label: "Число",
                value: 5,
                signals: ["change"],
              },
            },
          ],
        },
        left: {
          nodes: [testButton("left-1", "Л1"), testButton("left-2", "Л2")],
        },
        right: {
          nodes: [testButton("right-1", "П1"), testButton("right-2", "П2", "secondary")],
        },
      },
    };
  }

  /** Тестовое поле: без сетки, зума и панорамы — фиксированный настроечный лист. */
  override getViewOptions() {
    return { zoom: false, pan: false, grid: false, playersPanel: true, playersStats: false };
  }

  /** Слоты системной панели игрока: тестовые контроллы в строке имени и внизу. */
  override getPlayerPanel() {
    return {
      nameRow: [testButton("panel-bonus", "+1")],
      bottomRow: [
        { type: "text" as const, id: "panel-bottom-text", text: "Нижняя строка" },
        testButton("panel-bottom-btn", "Тест"),
      ],
    };
  }

  /**
   * Настроечный лист вместо сетки: рамка с габаритами, линейки, образцы фигур,
   * линий, текста и цветов из токенов темы. Рисуется в CSS-px (dpr уже в ctx).
   */
  override draw(_state: GameState, frame: GameRenderFrame): void {
    const { ctx, size, colors } = frame;
    const W = size.width;
    const H = size.height;
    const M = 56; // отступ листа от краёв поля
    const x0 = M;
    const y0 = M;
    const x1 = W - M;
    const y1 = H - M;

    ctx.save();
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    // Рамка листа и линейки с шагом 50 px (подпись — каждые 100 px).
    ctx.strokeStyle = colors.x;
    ctx.fillStyle = colors.x;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (let x = x0; x <= x1; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, y0 - 8);
      ctx.lineTo(x, y0);
      ctx.stroke();
      if ((x - x0) % 100 === 0) ctx.fillText(String(x - x0), x + 2, y0 - 18);
    }
    ctx.textBaseline = "middle";
    for (let y = y0; y <= y1; y += 50) {
      ctx.beginPath();
      ctx.moveTo(x0 - 8, y);
      ctx.lineTo(x0, y);
      ctx.stroke();
      if ((y - y0) % 100 === 0) {
        ctx.textAlign = "right";
        ctx.fillText(String(y - y0), x0 - 12, y);
        ctx.textAlign = "left";
      }
    }
    ctx.textAlign = "center";
    ctx.font = "14px sans-serif";
    ctx.fillText(`${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} px`, W / 2, y0 + 20);
    ctx.textAlign = "left";

    // Таблица образцов: слева подпись строки, справа образцы.
    const rowsTop = y0 + 40;
    const labelW = 150;
    const rowH = (y1 - rowsTop - 16) / TEST_ROWS.length;
    TEST_ROWS.forEach((row, i) => {
      const ry = rowsTop + i * rowH;
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 8, ry + 4, x1 - x0 - 16, rowH - 8);
      ctx.fillStyle = colors.x;
      ctx.font = "13px sans-serif";
      ctx.fillText(row.label, x0 + 18, ry + rowH / 2);
      row.paint(ctx, x0 + 8 + labelW, ry + rowH / 2, colors);
    });
    ctx.restore();
  }

  /**
   * Игра подписывается на сигналы своей формы и сама решает, что делать:
   * локальный запуск или лобби. Платформа лишь предоставляет окружение.
   */
  override attachEnvironment(environment: GameEnvironment): void {
    const { setup } = environment.game;

    this.#unsubscribe.push(
      setup.on("solo", "press", () => {
        void this.#launchLocal(environment, { humans: 1, computers: 0 });
      }),
      setup.on("versus", "press", () => {
        void this.#launchLocal(environment, { humans: 1, computers: 1 });
      }),
      setup.on("host", "press", () => {
        void this.#launchHost(environment);
      }),
      setup.on("join", "press", () => {
        // Сетевое лобби появится в фазе 10; отказ не должен ронять игру.
        environment.lobby.showClient().catch(() => {});
      }),
    );
  }

  override detachEnvironment(): void {
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
  }

  async #launchLocal(
    environment: GameEnvironment,
    options: { humans: number; computers: number },
  ): Promise<void> {
    const players = await environment.lobby.defaultPlayers(options);
    await environment.launch(players);
  }

  async #launchHost(environment: GameEnvironment): Promise<void> {
    const players = await environment.lobby.showHost({ maxPlayers: 4, allowComputer: true });
    if (players) await environment.launch(players);
  }
}

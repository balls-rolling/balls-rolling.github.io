// Адаптер крестиков-ноликов над базовым `Game`: правила и очередь хода целиком
// в игре, ядро их не разбирает. Рендер и UI — фаза 07.
import {
  Game,
  type GameEnvironment,
  type GameRenderFrame,
  type GameState,
  type Move,
  type MoveResult,
} from "@/core/game";
import type { FormHandle, FormSchema } from "@/core/form";
import { definePropertySchema } from "@/core/player";
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
  /** Пропускать победу — для демо ИИ против ИИ (фаза 08). */
  missWin = false;

  /** Отписки от сигналов формы: снимаются в `detachEnvironment`. */
  #unsubscribe: Array<() => void> = [];

  override getPropertySchema() {
    return propertySchema;
  }

  override getSetupForm(): FormSchema {
    return setupForm;
  }

  override attachEnvironment(environment: GameEnvironment): void {
    const { setup } = environment.game;
    this.#unsubscribe.push(
      setup.on("vs-computer", "press", () => {
        void this.#start(environment, setup);
      }),
    );
  }

  override detachEnvironment(): void {
    for (const off of this.#unsubscribe) off();
    this.#unsubscribe = [];
  }

  async #start(environment: GameEnvironment, setup: FormHandle): Promise<void> {
    this.level = clampLevel(Number(setup.getValue("level") ?? 2));
    const players = await environment.lobby.defaultPlayers({ humans: 1, computers: 1 });
    await environment.launch(players);
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

// Адаптер крестиков-ноликов над базовым `Game`: правила и очередь хода целиком
// в игре, ядро их не разбирает. Рендер и UI — фаза 07.
import { Game, type GameState, type Move, type MoveResult } from "@/core/game";
import { chooseMove as chooseBrainMove } from "./brain";
import { canPlace, findWin, key } from "./rules";

/** Состояние партии: камни по игрокам, их глифы и признак конца. */
interface TicTacToeState extends GameState {
  readonly order: readonly string[];
  readonly sets: Readonly<Record<string, ReadonlySet<string>>>;
  readonly glyphs: Readonly<Record<string, string>>;
  readonly total: number;
  readonly finished: boolean;
  readonly winnerId: string | null;
}

export class TicTacToeGame extends Game {
  readonly id = "tic-tac-toe";
  readonly label = "Крестики-нолики";

  /** Уровень ИИ (0..4). Настраивается формой преднастройки (фаза 07). */
  level = 2;
  /** Пропускать победу — для демо ИИ против ИИ (фаза 08). */
  missWin = false;

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
}

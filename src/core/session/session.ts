import { Player, type PlayerInit } from "../player";
import type { Game, GameState, Move } from "../game";
import type { SessionOptions, SessionSnapshot, SessionState } from "./types";

// Сессия — контроллер партии. Владеет игроками, состоянием, очередью и
// жизненным циклом, но не знает ни правил конкретной игры (они в `Game`), ни
// UI, ни Vue.
//
// Наружу: `subscribe` и `snapshot`. Прямых вызовов UI нет — это замена
// `ui.board?.setView(...)` и реестра `registerUI` из исходной реализации.

/** Задержка перед ходом компьютера по умолчанию, мс. */
const DEFAULT_COMPUTER_DELAY_MS = 500;

export interface SessionDeps {
  readonly game: Game;
  readonly players: readonly PlayerInit[];
  readonly options?: SessionOptions;
  /** Задержка хода компьютера. Параметр существует ради тестов. */
  readonly computerDelayMs?: number;
}

type Listener = (snapshot: SessionSnapshot) => void;

export class Session {
  readonly #game: Game;
  readonly #playerList: readonly Player[];
  readonly #isDemo: boolean;
  readonly #computerDelayMs: number;

  readonly #listeners = new Set<Listener>();
  #destroyedFlag = false;

  #status: SessionState = "idle";
  #gameState: GameState;
  #currentPlayerId: string | null = null;
  #winnerId: string | null = null;
  #revision = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;

  // Снимок пересобирается только на изменение и до следующего изменения
  // возвращается тем же объектом: так подписчик может сравнивать ссылки.
  #snapshot: SessionSnapshot;

  constructor(deps: SessionDeps) {
    this.#game = deps.game;
    this.#isDemo = deps.options?.demo ?? false;
    this.#computerDelayMs = deps.computerDelayMs ?? DEFAULT_COMPUTER_DELAY_MS;

    const schema = this.#game.getPropertySchema();
    this.#playerList = deps.players.map((init) => new Player(init, schema));

    this.#gameState = this.#game.createInitialState(this.#playerList.map((p) => p.id));
    this.#snapshot = this.#buildSnapshot();
  }

  get isDemo(): boolean {
    return this.#isDemo;
  }

  snapshot(): SessionSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Начать партию. */
  start(): void {
    if (this.#destroyedFlag) return;
    this.#reset();
    this.#status = "running";
    this.#currentPlayerId = this.#playerList[0]?.id ?? null;
    this.#changed();
    this.#scheduleComputer();
  }

  /** Начать заново: состояние партии обнуляется. */
  restart(): void {
    this.start();
  }

  /**
   * Переименовать игрока. Имя — общее свойство любого игрока, и менять его можно
   * в разгар партии: в сетевой игре имя соперника приходит уже после старта.
   */
  renamePlayer(playerId: string, name: string): boolean {
    if (this.#destroyedFlag) return false;
    const player = this.#player(playerId);
    if (!player) return false;

    player.name = name;
    this.#changed();
    return true;
  }

  /**
   * Ход за игрока. Возвращает false, если ход не принят: не тот игрок, партия не
   * идёт или игра отклонила ход.
   */
  makeMove(playerId: string, move: Move): boolean {
    if (this.#destroyedFlag || this.#status !== "running") return false;
    if (playerId !== this.#currentPlayerId) return false;

    const result = this.#game.applyMove(this.#gameState, playerId, move);
    if (!result.accepted) return false;

    this.#gameState = result.state;
    this.#clearTimer();

    if (result.finished) {
      this.#status = "finished";
      this.#winnerId = result.winnerId ?? null;
      this.#currentPlayerId = null;
      this.#changed();
      return true;
    }

    this.#currentPlayerId = this.#game.nextPlayer(this.#gameState, playerId);
    this.#changed();
    this.#scheduleComputer();
    return true;
  }

  destroy(): void {
    this.#destroyedFlag = true;
    this.#clearTimer();
    this.#listeners.clear();
  }

  #reset(): void {
    this.#clearTimer();
    this.#gameState = this.#game.createInitialState(this.#playerList.map((p) => p.id));
    this.#winnerId = null;
    this.#status = "idle";
  }

  #player(id: string | null): Player | undefined {
    return this.#playerList.find((p) => p.id === id);
  }

  /** Ход компьютера планирует сессия: очередь её, а выбор хода — игры. */
  #scheduleComputer(): void {
    if (this.#destroyedFlag || this.#status !== "running") return;
    const current = this.#player(this.#currentPlayerId);
    if (!current || current.agent !== "computer") return;

    const expectedId = current.id;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      // Пока ждали, партия могла закончиться или ход уйти другому игроку.
      if (this.#destroyedFlag || this.#status !== "running") return;
      if (this.#currentPlayerId !== expectedId) return;

      const move = this.#game.chooseMove(this.#gameState, expectedId);
      if (move) this.makeMove(expectedId, move);
    }, this.#computerDelayMs);
  }

  #clearTimer(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  #changed(): void {
    this.#revision += 1;
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener(this.#snapshot);
  }

  #buildSnapshot(): SessionSnapshot {
    return {
      state: this.#status,
      isDemo: this.#isDemo,
      players: this.#playerList.map((p) => p.snapshot()),
      currentPlayerId: this.#currentPlayerId,
      winnerId: this.#winnerId,
      revision: this.#revision,
    };
  }
}

import { describe, expect, it } from "vitest";
import { Game, type GameState, type Move, type MoveResult } from "../game";
import { GameSaves } from "../saves";
import { Session } from "../session";
import { MemoryBackend } from "../storage/backends";
import { createStore } from "../storage";
import { Platform } from "./platform";

// Полный локальный цикл: сыграли локальную партию, сохранили снимок, «перезагрузили
// страницу» (новые экземпляры хранилища и платформы над тем же бэкендом) и
// продолжили. Игра хранит состояние в `Set` — сериализация силами игры обязана
// не потерять его через JSON-конверт хранилища.

interface SetState extends GameState {
  readonly order: readonly string[];
  readonly sets: Readonly<Record<string, ReadonlySet<string>>>;
  readonly total: number;
  readonly finished: boolean;
  readonly winnerId: string | null;
}

class SetGame extends Game {
  readonly id = "set-game";
  readonly label = "Set game";
  settingsValue = 2;

  createInitialState(playerIds: readonly string[]): GameState {
    const sets: Record<string, ReadonlySet<string>> = {};
    for (const id of playerIds) sets[id] = new Set<string>();
    return { order: [...playerIds], sets, total: 0, finished: false, winnerId: null };
  }

  applyMove(state: GameState, playerId: string, move: Move): MoveResult {
    const current = state as SetState;
    const cell = move.cell;
    if (typeof cell !== "string" || current.finished) {
      return { accepted: false, state, finished: false };
    }
    for (const cells of Object.values(current.sets)) {
      if (cells.has(cell)) return { accepted: false, state, finished: false };
    }

    const placed = new Set(current.sets[playerId]);
    placed.add(cell);
    const total = current.total + 1;
    const finished = total >= 3;
    const next: SetState = {
      ...current,
      sets: { ...current.sets, [playerId]: placed },
      total,
      finished,
      winnerId: finished ? playerId : null,
    };
    return { accepted: true, state: next, finished, winnerId: next.winnerId };
  }

  chooseMove(): Move | null {
    return null;
  }

  nextPlayer(state: GameState, playerId: string): string | null {
    const current = state as SetState;
    if (current.finished) return null;
    const index = current.order.indexOf(playerId);
    return current.order[(index + 1) % current.order.length] ?? null;
  }

  isFinished(state: GameState): boolean {
    return (state as SetState).finished;
  }

  override serializeState(state: GameState): unknown {
    const current = state as SetState;
    const sets: Record<string, string[]> = {};
    for (const [id, cells] of Object.entries(current.sets)) sets[id] = [...cells];
    return { ...current, sets };
  }

  override deserializeState(data: unknown): GameState | null {
    if (typeof data !== "object" || data === null) return null;
    const raw = data as {
      order?: unknown;
      sets?: unknown;
      total?: unknown;
      finished?: unknown;
      winnerId?: unknown;
    };
    if (!Array.isArray(raw.order) || !raw.order.every((id) => typeof id === "string")) return null;
    if (typeof raw.sets !== "object" || raw.sets === null) return null;

    const sets: Record<string, ReadonlySet<string>> = {};
    for (const id of raw.order) {
      const cells = (raw.sets as Record<string, unknown>)[id];
      if (!Array.isArray(cells) || !cells.every((cell) => typeof cell === "string")) return null;
      sets[id] = new Set(cells);
    }
    return {
      order: [...raw.order],
      sets,
      total: typeof raw.total === "number" ? raw.total : 0,
      finished: raw.finished === true,
      winnerId: typeof raw.winnerId === "string" ? raw.winnerId : null,
    };
  }

  override serializeSettings(): unknown {
    return { value: this.settingsValue };
  }

  override applySettings(data: unknown): void {
    if (
      typeof data === "object" &&
      data !== null &&
      typeof (data as { value?: unknown }).value === "number"
    ) {
      this.settingsValue = (data as { value: number }).value;
    }
  }
}

describe("локальный цикл сохранения и восстановления", () => {
  it("сохраняет партию, восстанавливает из того же хранилища и удаляет снимок при завершении", async () => {
    const backend = new MemoryBackend();
    const makePlatform = (): Platform =>
      new Platform(createStore(backend), new GameSaves(createStore(backend)));

    const platformBefore = makePlatform();
    const gameBefore = new SetGame();
    gameBefore.settingsValue = 7;

    const session = new Session({
      game: gameBefore,
      players: [
        { id: "p1", name: "Аня", agent: "human", transport: "local" },
        { id: "p2", name: "Боря", agent: "human", transport: "local" },
      ],
    });
    session.start();
    expect(session.makeMove("p1", { cell: "a" })).toBe(true);
    await platformBefore.saveGameSnapshot(
      gameBefore.id,
      gameBefore.serializeSettings(),
      session.save(),
    );
    session.destroy();

    // «Перезагрузка»: новые экземпляры платформы и игры над тем же бэкендом.
    const platformAfter = makePlatform();
    const gameAfter = new SetGame();
    const resumed = await platformAfter.resumeSession(gameAfter);

    expect(resumed).not.toBeNull();
    const snapshot = resumed!.snapshot();
    expect(snapshot.state).toBe("running");
    expect(snapshot.currentPlayerId).toBe("p2");
    expect(snapshot.players.map((player) => player.name)).toEqual(["Аня", "Боря"]);
    expect(gameAfter.settingsValue).toBe(7);

    // Состояние игры восстановлено вместе с `Set`-ами.
    const restoredState = resumed!.save().gameState as { sets: Record<string, string[]> };
    expect(restoredState.sets).toEqual({ p1: ["a"], p2: [] });

    // Партию можно продолжить до конца.
    expect(resumed!.makeMove("p2", { cell: "b" })).toBe(true);
    expect(resumed!.makeMove("p1", { cell: "c" })).toBe(true);
    expect(resumed!.snapshot().state).toBe("finished");

    // Завершение: снимок сессии удаляется, настройки игры остаются.
    await platformAfter.removeSessionSave(gameAfter.id);
    expect(await platformAfter.hasSavedSession(gameAfter.id)).toBe(false);
    expect(await platformAfter.resumeSession(new SetGame())).toBeNull();

    const node = await new GameSaves(createStore(backend)).load(gameAfter.id);
    expect(node?.settings).toEqual({ value: 7 });
    expect(node?.session).toBeNull();

    resumed!.destroy();
  });
});

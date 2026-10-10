import { describe, expect, it, vi } from "vitest";
import { Game, type GameState, type Move, type MoveResult } from "@/core/game";
import type { PlayerInit } from "@/core/player";
import { Session } from "@/core/session";
import { createUiZones } from "@/core/ui-zones";
import { createGameEnvironment } from "./environment";

// Проверка склейки: запуск сетевой партии хостом обязан записывать снимок через
// `attachSessionSave`, иначе после аварии на главном не будет «Продолжить».

class StubGame extends Game {
  readonly id = "tic-tac-toe";
  readonly label = "Крестики";
  createInitialState(playerIds: readonly string[]): GameState {
    return { order: [...playerIds] };
  }
  applyMove(state: GameState, _p: string, move: Move): MoveResult {
    if (typeof move.x !== "number" || typeof move.y !== "number") {
      return { accepted: false, state, finished: false };
    }
    return { accepted: true, state, finished: false };
  }
  chooseMove(): Move | null {
    return null;
  }
  nextPlayer(state: GameState, playerId: string): string {
    const order = (state as { order: readonly string[] }).order;
    return order[(order.indexOf(playerId) + 1) % order.length]!;
  }
  isFinished(): boolean {
    return false;
  }
  serializeSettings(): unknown {
    return { level: 3 };
  }
}

function makeEnv() {
  const game = new StubGame();
  const platform = {
    createSessionFor: (g: Game, players: readonly PlayerInit[]) =>
      new Session({ game: g, players }),
    loadGlobalSettings: vi.fn(async () => ({ name: "Игрок", lastGameId: "", themeMode: "system" })),
    saveGlobalSettings: vi.fn(async () => {}),
    saveGameSnapshot: vi.fn(async () => {}),
    removeSessionSave: vi.fn(async () => {}),
  };
  const sessionHost = { set: vi.fn(), clear: vi.fn() };
  const env = createGameEnvironment({
    entry: { id: "tic-tac-toe", label: "Крестики", entry: async () => game },
    game,
    setup: {} as never,
    ui: createUiZones({ zones: {} }),
    lobby: {} as never,
    sessionHost: sessionHost as never,
    platform: platform as never,
    dialog: { close: vi.fn() } as never,
    onExitToMenu: vi.fn(),
    resultScreen: {} as never,
  });
  return { env, platform };
}

describe("createGameEnvironment.launch", () => {
  it("у хоста сетевой партии сохраняет снимок (главное покажет «Продолжить»)", async () => {
    const { env, platform } = makeEnv();

    await env.launch([
      { id: "p1", name: "Хост", agent: "human", transport: "local" },
      { id: "p2", name: "Гость", agent: "human", transport: "remote" },
    ]);

    expect(platform.saveGameSnapshot).toHaveBeenCalledTimes(1);
    expect(platform.saveGameSnapshot).toHaveBeenCalledWith(
      "tic-tac-toe",
      { level: 3 },
      expect.anything(),
    );
  });
});

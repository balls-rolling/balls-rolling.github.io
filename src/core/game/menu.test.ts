import { describe, expect, it } from "vitest";
import { Game } from "./game";
import type { ExitCustomization, ExitRequest, GameMenuItem } from "./menu";
import type { GameState, Move, MoveResult } from "./move";

class MenuGame extends Game {
  readonly id = "menu";
  readonly label = "Меню-игра";

  createInitialState(): GameState {
    return {};
  }

  applyMove(state: GameState): MoveResult {
    return { accepted: true, state, finished: false };
  }

  chooseMove(): Move | null {
    return null;
  }

  nextPlayer(): string | null {
    return null;
  }

  isFinished(): boolean {
    return false;
  }

  override getGameMenu(): readonly GameMenuItem[] {
    return [{ id: "rules", label: "Правила", icon: "list" }];
  }

  override onExitRequested(_request: ExitRequest): ExitCustomization | null {
    return { message: "Точно?", extraAction: { value: "ai", label: "Выйти, оставив ИИ" } };
  }
}

describe("интерфейс меню и выхода", () => {
  it("игра объявляет пункты меню", () => {
    const game = new MenuGame();
    expect(game.getGameMenu().map((item) => item.id)).toEqual(["rules"]);
  });

  it("игра настраивает диалог выхода", () => {
    const game = new MenuGame();
    const customization = game.onExitRequested({ multiplayer: true, playerCount: 2 });
    expect(customization?.extraAction?.value).toBe("ai");
  });

  it("по умолчанию пунктов и настроек нет, действия безопасны", () => {
    const base = new (class extends Game {
      readonly id = "base";
      readonly label = "База";
      createInitialState(): GameState {
        return {};
      }
      applyMove(state: GameState): MoveResult {
        return { accepted: true, state, finished: false };
      }
      chooseMove(): Move | null {
        return null;
      }
      nextPlayer(): string | null {
        return null;
      }
      isFinished(): boolean {
        return false;
      }
    })();

    expect(base.getGameMenu()).toEqual([]);
    expect(base.onExitRequested({ multiplayer: false, playerCount: 1 })).toBeNull();
    expect(() => base.onGameMenuAction("x")).not.toThrow();
    expect(() => base.onExitResolved("exit")).not.toThrow();
  });
});

import { describe, expect, it, vi } from "vitest";
import type { Platform } from "@/core/platform";
import { loadSavedGames, removeSavedGames } from "./saved-games";

// Координатор списка проверяется без Vue: платформа подменяется заглушкой.

function stubPlatform(
  saved: readonly string[],
  games: readonly { id: string; label: string }[],
): { platform: Platform; clearSavedGames: ReturnType<typeof vi.fn> } {
  const clearSavedGames = vi.fn(async () => {});
  const platform = {
    listSavedGames: vi.fn(async () => [...saved]),
    listGames: vi.fn(() => games),
    clearSavedGames,
  };
  return { platform: platform as unknown as Platform, clearSavedGames };
}

describe("loadSavedGames", () => {
  it("сопоставляет id с названием игры и сортирует по названию", async () => {
    const { platform } = stubPlatform(
      ["tic-tac-toe", "unknown-id"],
      [
        { id: "tic-tac-toe", label: "Крестики-нолики" },
        { id: "checkers", label: "Шашки" },
      ],
    );

    await expect(loadSavedGames(platform)).resolves.toEqual([
      { id: "tic-tac-toe", label: "Крестики-нолики" },
      { id: "unknown-id", label: "unknown-id" },
    ]);
  });
});

describe("removeSavedGames", () => {
  it("удаляет только переданные игры", async () => {
    const { platform, clearSavedGames } = stubPlatform([], []);

    await removeSavedGames(platform, ["a"]);

    expect(clearSavedGames).toHaveBeenCalledWith(["a"]);
  });
});

import { describe, expect, it } from "vitest";
import { listGames } from "@/core/game";

// Реестр игр собирается сборщиком через `import.meta.glob`: новая игра
// подхватывается без правок ядра. Тест держит этот контракт — если glob
// сломается, список игр опустеет молча.

describe("реестр игр", () => {
  it("находит игры настоящим путём через glob", () => {
    const ids = listGames().map((game) => game.id);

    expect(ids).toContain("tic-tac-toe");
    expect(ids).toContain("billiards");
  });

  it("игра из реестра поднимается отложенно и совпадает по id", async () => {
    const entry = listGames().find((game) => game.id === "tic-tac-toe");
    expect(entry).toBeDefined();

    await expect(entry!.entry()).resolves.toMatchObject({ id: "tic-tac-toe" });
  });
});

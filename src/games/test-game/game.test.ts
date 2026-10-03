import { describe, expect, it } from "vitest";
import { listGames } from "@/core/game";
import { Player } from "@/core/player";
import { TestGame } from "./game";

const players = ["p1", "p2"];

describe("TestGame", () => {
  it("начинает с нулевых счётчиков", () => {
    const game = new TestGame();
    const state = game.createInitialState(players);

    expect(state).toMatchObject({ order: players, moves: { p1: 0, p2: 0 }, total: 0 });
  });

  it("принимает ход и переходит к следующему игроку", () => {
    const game = new TestGame();
    const start = game.createInitialState(players);

    const result = game.applyMove(start, "p1", { step: 1 });

    expect(result.accepted).toBe(true);
    expect(game.nextPlayer(result.state, "p1")).toBe("p2");
    expect(game.nextPlayer(result.state, "p2")).toBe("p1");
  });

  it("отклоняет ход неверной формы, не меняя состояние", () => {
    const game = new TestGame();
    const start = game.createInitialState(players);

    const result = game.applyMove(start, "p1", { что_то_не_то: true });

    expect(result.accepted).toBe(false);
    expect(result.state).toBe(start);
  });

  it("завершается, когда игрок сделал нужное число ходов", () => {
    const game = new TestGame();
    let state = game.createInitialState(players);

    for (let i = 0; i < 3; i++) state = game.applyMove(state, "p1", { step: 1 }).state;
    const final = game.applyMove(state, "p1", { step: 1 });

    expect(final.finished).toBe(true);
    expect(final.winnerId).toBe("p1");
    expect(game.isFinished(final.state)).toBe(true);
  });

  it("объявляет игровую схему свойств", () => {
    const game = new TestGame();
    const schema = game.getPropertySchema();

    expect(schema.specs.map((s) => s.key)).toContain("testLevel");
  });

  it("игровое свойство проверяется и нормализуется", () => {
    const game = new TestGame();
    const player = new Player(
      { id: "p1", name: "Игрок", agent: "human", transport: "local" },
      game.getPropertySchema(),
    );

    expect(player.setProperty("testLevel", 2.7)).toBe(true);
    expect(player.getProperty("testLevel")).toBe(2);

    expect(player.setProperty("testLevel", 99)).toBe(false);
  });

  it("объявляет преднастройку декларативной схемой", () => {
    const game = new TestGame();
    const form = game.getSetupForm();

    expect(form.controls.length).toBeGreaterThan(0);
    // Схема — данные, а не компонент: значения должны быть сериализуемы.
    expect(() => JSON.stringify(form)).not.toThrow();
  });
});

describe("реестр игр", () => {
  it("находит test-game настоящим путём через glob", () => {
    const games = listGames();

    expect(games.map((g) => g.id)).toContain("test-game");
  });

  it("игра из реестра поднимается отложенно", async () => {
    const entry = listGames().find((g) => g.id === "test-game");

    expect(entry).toBeDefined();
    await expect(entry!.entry()).resolves.toBeInstanceOf(TestGame);
  });
});

import { describe, expect, it } from "vitest";
import { TicTacToeGame } from "./game";
import { key } from "./rules";

function freshGame(): TicTacToeGame {
  return new TicTacToeGame();
}

function move(
  game: TicTacToeGame,
  state: ReturnType<TicTacToeGame["createInitialState"]>,
  id: string,
  x: number,
  y: number,
) {
  return game.applyMove(state, id, { x, y });
}

describe("TicTacToeGame", () => {
  it("начальное состояние: пустые наборы, глифы X/O", () => {
    const state = freshGame().createInitialState(["p1", "p2"]) as {
      sets: Record<string, Set<string>>;
      glyphs: Record<string, string>;
      total: number;
    };
    expect(state.sets.p1.size).toBe(0);
    expect(state.sets.p2.size).toBe(0);
    expect(state.glyphs).toEqual({ p1: "X", p2: "O" });
    expect(state.total).toBe(0);
  });

  it("партия 5 в ряд завершается победой", () => {
    const game = freshGame();
    let state = game.createInitialState(["p1", "p2"]);
    for (let x = 0; x < 4; x += 1) {
      const result = move(game, state, "p1", x, 0);
      expect(result.accepted).toBe(true);
      expect(result.finished).toBe(false);
      state = result.state;
    }
    const win = move(game, state, "p1", 4, 0);
    expect(win.accepted).toBe(true);
    expect(win.finished).toBe(true);
    expect(win.winnerId).toBe("p1");
    expect(game.isFinished(win.state)).toBe(true);
  });

  it("nextPlayer чередует и не даёт ход после конца", () => {
    const game = freshGame();
    let state = game.createInitialState(["p1", "p2"]);
    expect(game.nextPlayer(state, "p1")).toBe("p2");
    expect(game.nextPlayer(state, "p2")).toBe("p1");

    for (let x = 0; x < 5; x += 1) state = move(game, state, "p1", x, 0).state;
    expect(game.nextPlayer(state, "p1")).toBeNull();
  });

  it("занятая клетка и ход после конца отклоняются без мутации", () => {
    const game = freshGame();
    let state = game.createInitialState(["p1", "p2"]);
    state = move(game, state, "p1", 0, 0).state;

    const occupied = move(game, state, "p2", 0, 0);
    expect(occupied.accepted).toBe(false);
    expect(occupied.state).toBe(state);

    const unknown = move(game, state, "nobody", 5, 5);
    expect(unknown.accepted).toBe(false);

    let finished = state;
    for (let x = 1; x < 5; x += 1) finished = move(game, finished, "p1", x, 0).state;
    const afterEnd = move(game, finished, "p2", 10, 10);
    expect(afterEnd.accepted).toBe(false);
    expect(afterEnd.state).toBe(finished);
  });

  it("chooseMove берёт победу, missWin — пропускает", () => {
    const game = freshGame();
    let state = game.createInitialState(["p1", "p2"]);
    for (let x = 0; x < 4; x += 1) state = move(game, state, "p1", x, 0).state;

    const win = game.chooseMove(state, "p1");
    expect(win).not.toBeNull();
    expect((win!.x === 4 && win!.y === 0) || (win!.x === -1 && win!.y === 0)).toBe(true);

    game.missWin = true;
    let took = 0;
    for (let i = 0; i < 20; i += 1) {
      const m = game.chooseMove(state, "p1");
      if (m && ((m.x === 4 && m.y === 0) || (m.x === -1 && m.y === 0))) took += 1;
    }
    expect(took).toBe(0);
  });

  it("chooseMove не предлагает занятую клетку и молчит после конца", () => {
    const game = freshGame();
    let state = game.createInitialState(["p1", "p2"]);
    state = move(game, state, "p1", 0, 0).state;
    const m = game.chooseMove(state, "p2");
    expect(m).not.toBeNull();
    const cell = m as unknown as { x: number; y: number };
    expect(key(cell.x, cell.y)).not.toBe(key(0, 0));

    let finished = game.createInitialState(["p1", "p2"]);
    for (let x = 0; x < 5; x += 1) finished = move(game, finished, "p1", x, 0).state;
    expect(game.chooseMove(finished, "p2")).toBeNull();
  });

  it("отклоняет нечисловые координаты и неизвестного игрока в nextPlayer", () => {
    const game = freshGame();
    const state = game.createInitialState(["p1", "p2"]);
    expect(game.applyMove(state, "p1", { x: "0", y: 0 }).accepted).toBe(false);
    expect(game.applyMove(state, "p1", { x: 0.5, y: 0 }).accepted).toBe(false);
    expect(game.nextPlayer(state, "nobody")).toBeNull();
  });
});

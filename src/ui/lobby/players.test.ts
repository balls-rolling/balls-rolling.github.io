import { describe, expect, it } from "vitest";
import { defaultPlayers, nextComputerId, nextHumanId } from "./players";

describe("defaultPlayers", () => {
  it("один человек по умолчанию, с именем из настроек", () => {
    const players = defaultPlayers({ name: "Вадим" });

    expect(players).toEqual([{ id: "p1", name: "Вадим", agent: "human", transport: "local" }]);
  });

  it("двое людей", () => {
    const players = defaultPlayers({ name: "Вадим", humans: 2 });

    expect(players.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(players.every((p) => p.agent === "human")).toBe(true);
  });

  it("человек и компьютер", () => {
    const players = defaultPlayers({ name: "Вадим", humans: 1, computers: 1 });

    expect(players.map((p) => p.id)).toEqual(["p1", "c1"]);
    expect(players[1]!.agent).toBe("computer");
  });

  it("универсально на больше двух игроков", () => {
    const players = defaultPlayers({ name: "Вадим", humans: 3, computers: 2 });

    expect(players.length).toBe(5);
    expect(players.map((p) => p.agent)).toEqual([
      "human",
      "human",
      "human",
      "computer",
      "computer",
    ]);
  });

  it("лимит ограничивает состав", () => {
    const players = defaultPlayers({ name: "Вадим", humans: 4, computers: 4, maxPlayers: 3 });

    expect(players.length).toBe(3);
  });

  it("идентификаторы детерминированы и уникальны", () => {
    const first = defaultPlayers({ name: "Вадим", humans: 2, computers: 2 });
    const second = defaultPlayers({ name: "Вадим", humans: 2, computers: 2 });

    expect(first.map((p) => p.id)).toEqual(second.map((p) => p.id));
    expect(new Set(first.map((p) => p.id)).size).toBe(first.length);
  });

  it("все игроки локальные в этой фазе", () => {
    const players = defaultPlayers({ name: "Вадим", humans: 1, computers: 1 });

    expect(players.every((p) => p.transport === "local")).toBe(true);
  });
});

describe("следующий идентификатор", () => {
  it("находит свободный номер человека", () => {
    const players = defaultPlayers({ name: "Вадим", humans: 2 });
    expect(nextHumanId(players)).toBe("p3");
  });

  it("находит свободный номер компьютера", () => {
    const players = defaultPlayers({ name: "Вадим", humans: 1, computers: 2 });
    expect(nextComputerId(players)).toBe("c3");
  });

  it("заполняет дырку в нумерации", () => {
    const players = defaultPlayers({ name: "Вадим", humans: 3 });
    const withoutSecond = players.filter((p) => p.id !== "p2");

    expect(nextHumanId(withoutSecond)).toBe("p2");
  });
});

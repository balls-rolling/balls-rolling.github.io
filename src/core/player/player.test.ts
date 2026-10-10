import { describe, expect, it } from "vitest";
import { Player, type PlayerInit } from "./player";
import { definePropertySchema } from "./schema";

const schema = definePropertySchema([
  {
    key: "rating",
    label: "Рейтинг",
    control: { id: "rating", kind: "number", label: "Рейтинг", value: 0 },
    isValid: (value) => typeof value === "number" && value >= 0,
  },
  {
    key: "glyph",
    label: "Знак",
    control: { id: "glyph", kind: "text", label: "Знак", value: "X" },
    isValid: (value) => value === "X" || value === "O",
    normalize: (value) => String(value).toUpperCase(),
  },
]);

function makePlayer(overrides: Partial<PlayerInit> = {}) {
  return new Player(
    { id: "p1", name: "Игрок", agent: "human", transport: "local", ...overrides },
    schema,
  );
}

describe("Player", () => {
  it("хранит общее имя напрямую", () => {
    const player = makePlayer();
    expect(player.name).toBe("Игрок");

    player.name = "Гость";
    expect(player.snapshot().name).toBe("Гость");
  });

  it("пишет и читает игровое свойство по схеме", () => {
    const player = makePlayer();

    expect(player.setProperty("rating", 42)).toBe(true);
    expect(player.getProperty("rating")).toBe(42);
  });

  it("отклоняет значение, не прошедшее проверку", () => {
    const player = makePlayer();

    expect(player.setProperty("rating", -5)).toBe(false);
    expect(player.getProperty("rating")).toBeUndefined();
  });

  it("отклоняет свойство, которого нет в схеме", () => {
    const player = makePlayer();

    expect(player.setProperty("чужое", 1)).toBe(false);
  });

  it("применяет нормализацию", () => {
    const player = makePlayer();

    expect(player.setProperty("glyph", "x")).toBe(true);
    expect(player.getProperty("glyph")).toBe("X");
  });

  it("разделяет агента и транспорт", () => {
    const human = makePlayer();
    const computer = makePlayer({ agent: "computer", transport: "remote" });

    expect(human.agent).toBe("human");
    expect(human.transport).toBe("local");
    expect(computer.agent).toBe("computer");
    expect(computer.transport).toBe("remote");
  });

  it("снимок не даёт менять состояние напрямую", () => {
    const player = makePlayer();
    player.setProperty("rating", 10);

    const snapshot = player.snapshot();
    (snapshot.properties as Record<string, unknown>).rating = 999;

    expect(player.getProperty("rating")).toBe(10);
  });

  it("восстанавливает игровые свойства из снимка", () => {
    const player = new Player(
      { id: "p1", name: "Игрок", agent: "human", transport: "local" },
      schema,
      { rating: 7, glyph: "o" },
    );

    expect(player.getProperty("rating")).toBe(7);
    // Нормализация применяется и при восстановлении.
    expect(player.getProperty("glyph")).toBe("O");
  });

  it("молча отбрасывает невалидные и чужие свойства снимка", () => {
    const player = new Player(
      { id: "p1", name: "Игрок", agent: "human", transport: "local" },
      schema,
      { rating: -1, чужое: 1 },
    );

    expect(player.getProperty("rating")).toBeUndefined();
    expect(player.getProperty("чужое")).toBeUndefined();
  });
});

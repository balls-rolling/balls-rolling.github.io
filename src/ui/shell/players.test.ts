import { describe, expect, it } from "vitest";
import { playerSides, initialOf } from "./players";

const people = [
  { id: "p1", name: "Первый" },
  { id: "p2", name: "Второй" },
];

describe("playerSides", () => {
  it("двое: слева хост, справа гость; текущий помечен", () => {
    expect(playerSides(people, "p2")).toEqual({
      left: { id: "p1", name: "Первый", isCurrent: false },
      right: { id: "p2", name: "Второй", isCurrent: true },
    });
  });

  it("один игрок: правой стороны нет", () => {
    expect(playerSides([people[0]!], "p1")).toEqual({
      left: { id: "p1", name: "Первый", isCurrent: true },
      right: null,
    });
  });

  it("пустой состав и отсутствие хода не падают", () => {
    expect(playerSides([], null)).toEqual({ left: null, right: null });
  });
});

describe("initialOf", () => {
  it("берёт первую букву имени", () => {
    expect(initialOf("Игрок")).toBe("И");
    expect(initialOf("  maya ")).toBe("M");
  });

  it("пустое имя — «?»", () => {
    expect(initialOf("")).toBe("?");
    expect(initialOf("   ")).toBe("?");
  });
});

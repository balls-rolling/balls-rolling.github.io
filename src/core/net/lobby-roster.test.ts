import { describe, expect, it } from "vitest";
import { LobbyRoster } from "./lobby-roster";
import type { LobbyPlayer } from "./lobby-protocol";

describe("LobbyRoster", () => {
  it("хост первый; add выдаёт последовательные id", () => {
    const roster = new LobbyRoster("Хост");
    expect(roster.list()).toEqual([{ id: "p1", name: "Хост" }]);

    const second = roster.add("Гость");
    const third = roster.add("Ещё");
    expect([second, third]).toEqual(["p2", "p3"]);
    expect(roster.list().map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("remove убирает гостя, но не хоста; id не переиспользуются", () => {
    const roster = new LobbyRoster("Хост");
    roster.add("Гость");
    expect(roster.remove("p1")).toBe(false);
    expect(roster.remove("p2")).toBe(true);
    expect(roster.remove("p2")).toBe(false);

    const next = roster.add("Новый");
    expect(next).toBe("p3"); // не p2 — id не переиспользуется
    expect(roster.has("p2")).toBe(false);
    expect(roster.has("p3")).toBe(true);
  });

  it("list возвращает копию, имена обрезаются", () => {
    const roster = new LobbyRoster("х".repeat(60));
    roster.add("y".repeat(60));
    const list = roster.list() as { id: string; name: string }[];
    expect(list[0]!.name).toBe("х".repeat(40));
    expect(list[1]!.name).toBe("y".repeat(40));

    list[0]!.name = "изменено"; // копия не влияет на реестр
    expect(roster.list()[0]!.name).toBe("х".repeat(40));
  });

  it("без preset — обычный режим: admit/isComplete выключены, состав не менять", () => {
    const roster = new LobbyRoster("Хост");
    expect(roster.isPreset).toBe(false);
    expect(roster.preset).toBeNull();
    expect(roster.admit("p2")).toBe(false);
    expect(roster.isComplete()).toBe(false);
    expect(roster.disconnect("p2")).toBe(false);

    expect(roster.add("Гость")).toBe("p2");
    expect(roster.list().map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(roster.remove("p2")).toBe(true);
    expect(roster.list().map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("LobbyRoster preset", () => {
  const preset: readonly LobbyPlayer[] = [
    { id: "p1", name: "Хост" },
    { id: "p2", name: "Гость" },
  ];

  it("isPreset и состав берутся из preset, list — копия", () => {
    const roster = new LobbyRoster("Не важно", preset);
    expect(roster.isPreset).toBe(true);
    expect(roster.list()).toEqual([...preset]);
    expect(roster.preset).toEqual([...preset]);

    const list = roster.list() as { id: string; name: string }[];
    list[0]!.name = "изменено";
    expect(roster.list()[0]!.name).toBe("Хост"); // копия не влияет
  });

  it("admit допускает ожидаемого однократно; чужой и хост — отказ", () => {
    const roster = new LobbyRoster("Хост", preset);
    expect(roster.admit("p3")).toBe(false); // чужой id
    expect(roster.admit("p1")).toBe(false); // хост
    expect(roster.admit("p2")).toBe(true);
    expect(roster.admit("p2")).toBe(false); // повторный
  });

  it("isComplete только после всех; disconnect делает состав неполным", () => {
    const roster = new LobbyRoster("Хост", preset);
    expect(roster.isComplete()).toBe(false); // не подключился никто

    expect(roster.admit("p2")).toBe(true);
    expect(roster.isComplete()).toBe(true);

    expect(roster.disconnect("p2")).toBe(true);
    expect(roster.isComplete()).toBe(false);
    expect(roster.list()).toEqual([...preset]); // состав сохранён

    expect(roster.disconnect("p1")).toBe(false); // хоста не трогаем
    expect(roster.isComplete()).toBe(false);
  });

  it("add в preset-режиме не создаёт новых", () => {
    const roster = new LobbyRoster("Хост", preset);
    expect(roster.add("Лишний")).toBeNull();
    expect(roster.list()).toEqual([...preset]);
  });

  it("remove в preset-режиме не ломает состав — только снимает участие", () => {
    const roster = new LobbyRoster("Хост", preset);
    roster.admit("p2");

    expect(roster.remove("p1")).toBe(false);
    expect(roster.remove("p2")).toBe(true);
    expect(roster.isComplete()).toBe(false);
    expect(roster.list()).toEqual([...preset]); // состав не изменился
  });
});

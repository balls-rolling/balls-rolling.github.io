import { describe, expect, it } from "vitest";
import { applyNetMessage, type NetApi } from "./protocol";

function api(): NetApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setPeerName: (name, playerId) =>
      calls.push(playerId === undefined ? `hello:${name}` : `hello:${name}:${playerId}`),
    remoteMove: (x, y) => calls.push(`move:${x},${y}`),
    remoteSurrender: () => calls.push("surrender"),
    applyRemoteState: () => calls.push("sync"),
    peerLeft: () => calls.push("bye"),
  };
}

describe("протокол net", () => {
  it("hello передаёт имя с обрезкой", () => {
    const a = api();
    expect(applyNetMessage({ t: "hello", name: "Игрок" }, a)).toBe(true);
    expect(a.calls).toEqual(["hello:Игрок"]);

    applyNetMessage({ t: "hello", name: "x".repeat(60) }, a);
    expect(a.calls[1]).toBe(`hello:${"x".repeat(40)}`);
  });

  it("hello с id пробрасывает playerId, без id — не передаёт", () => {
    const a = api();
    expect(applyNetMessage({ t: "hello", name: "Игрок", playerId: "p1" }, a)).toBe(true);
    expect(applyNetMessage({ t: "hello", name: "Игрок" }, a)).toBe(true);
    expect(applyNetMessage({ t: "hello", name: "Игрок", playerId: "z".repeat(60) }, a)).toBe(true);
    expect(a.calls).toEqual(["hello:Игрок:p1", "hello:Игрок", `hello:Игрок:${"z".repeat(40)}`]);
  });

  it("move, surrender, bye диспетчеризуются", () => {
    const a = api();
    expect(applyNetMessage({ t: "move", x: 3, y: -2 }, a)).toBe(true);
    expect(applyNetMessage({ t: "surrender" }, a)).toBe(true);
    expect(applyNetMessage({ t: "bye" }, a)).toBe(true);
    expect(a.calls).toEqual(["move:3,-2", "surrender", "bye"]);
  });

  it("sync передаёт снимок состояния", () => {
    const a = api();
    const save = { state: "running" };
    expect(applyNetMessage({ t: "sync", save }, a)).toBe(true);
    expect(a.calls).toEqual(["sync"]);
    // Отсутствие save допустимо: диспетчер лишь пробрасывает значение.
    expect(applyNetMessage({ t: "sync" }, a)).toBe(true);
    expect(a.calls).toEqual(["sync", "sync"]);
  });

  it("мусор отвергается молча", () => {
    const a = api();
    const bad = [
      null,
      "строка",
      42,
      {},
      { t: "unknown" },
      { t: "hello" },
      { t: "hello", name: 5 },
      { t: "hello", name: "x", playerId: 5 },
      { t: "move", x: 1.5, y: 0 },
      { t: "move", x: "1", y: 0 },
      { t: "move", x: 1 },
    ];
    for (const message of bad) expect(applyNetMessage(message, a)).toBe(false);
    expect(a.calls).toEqual([]);
  });
});

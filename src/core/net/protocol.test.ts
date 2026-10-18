import { describe, expect, it } from "vitest";
import { applyNetMessage, type NetApi } from "./protocol";

function api(): NetApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setPeerName: (name, playerId) =>
      calls.push(playerId === undefined ? `hello:${name}` : `hello:${name}:${playerId}`),
    remoteMove: (move, meta) =>
      calls.push(`move:${JSON.stringify(move)}:${meta.seq ?? ""}:${meta.hash ?? ""}`),
    remotePrep: (prep) => calls.push(`prep:${JSON.stringify(prep)}`),
    remoteShot: (move, seq) => calls.push(`shot:${JSON.stringify(move)}:${seq ?? ""}`),
    remoteSurrender: () => calls.push("surrender"),
    applyRemoteState: (_save, settings) =>
      calls.push(settings === undefined ? "sync" : "sync+settings"),
    requestResync: () => calls.push("resync"),
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

  it("move несёт непрозрачный payload игры и метаданные", () => {
    const a = api();
    expect(applyNetMessage({ t: "move", m: { x: 3, y: -2 } }, a)).toBe(true);
    expect(a.calls).toEqual([`move:${JSON.stringify({ x: 3, y: -2 })}::`]);

    applyNetMessage({ t: "move", m: { angle: 1.5, power: 0.5 }, seq: 4, hash: 99 }, a);
    expect(a.calls[1]).toBe(`move:${JSON.stringify({ angle: 1.5, power: 0.5 })}:4:99`);
  });

  it("surrender, bye, resync диспетчеризуются", () => {
    const a = api();
    expect(applyNetMessage({ t: "surrender" }, a)).toBe(true);
    expect(applyNetMessage({ t: "resync" }, a)).toBe(true);
    expect(applyNetMessage({ t: "bye" }, a)).toBe(true);
    expect(a.calls).toEqual(["surrender", "resync", "bye"]);
  });

  it("prep несёт непрозрачный кадр подготовки, shot — payload и seq (02-e)", () => {
    const a = api();
    const prep = { angle: 1.2, power: 0.5, cue: { x: 1, y: 2 } };
    expect(applyNetMessage({ t: "prep", p: prep }, a)).toBe(true);
    expect(a.calls).toEqual([`prep:${JSON.stringify(prep)}`]);

    expect(applyNetMessage({ t: "shot", m: { angle: 1, power: 0.4 }, seq: 3 }, a)).toBe(true);
    expect(a.calls[1]).toBe(`shot:${JSON.stringify({ angle: 1, power: 0.4 })}:3`);
    // seq необязателен: диспетчер лишь пробрасывает значение.
    expect(applyNetMessage({ t: "shot", m: { angle: 0, power: 1 } }, a)).toBe(true);
    expect(a.calls[2]).toBe(`shot:${JSON.stringify({ angle: 0, power: 1 })}:`);
  });

  it("sync передаёт снимок и настройки", () => {
    const a = api();
    const save = { state: "running" };
    expect(applyNetMessage({ t: "sync", save }, a)).toBe(true);
    expect(a.calls).toEqual(["sync"]);
    // Отсутствие save допустимо: диспетчер лишь пробрасывает значение.
    expect(applyNetMessage({ t: "sync" }, a)).toBe(true);
    expect(a.calls).toEqual(["sync", "sync"]);
    // Настройки партии — необязательная добавка 02-d.
    expect(applyNetMessage({ t: "sync", save, settings: { rules: "simple" } }, a)).toBe(true);
    expect(a.calls[2]).toBe("sync+settings");
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
      { t: "move" },
      { t: "move", m: 5 },
      { t: "move", m: [1, 2] },
      { t: "move", m: null },
      { t: "move", m: {}, seq: 1.5 },
      { t: "move", m: {}, seq: -1 },
      { t: "move", m: {}, hash: "9" },
      { t: "prep" },
      { t: "prep", p: 5 },
      { t: "prep", p: null },
      { t: "prep", p: [1, 2] },
      { t: "shot" },
      { t: "shot", m: 5 },
      { t: "shot", m: null },
      { t: "shot", m: [1, 2] },
      { t: "shot", m: {}, seq: -1 },
    ];
    for (const message of bad) expect(applyNetMessage(message, a)).toBe(false);
    expect(a.calls).toEqual([]);
  });
});

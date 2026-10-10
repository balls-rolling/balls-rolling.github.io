import { describe, expect, it } from "vitest";
import { applyLobbyMessage, type LobbyApi } from "./lobby-protocol";

function api(): LobbyApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    join: (name, id) => calls.push(id === undefined ? `join:${name}` : `join:${name}:${id}`),
    players: (players) =>
      calls.push(`players:${players.map((p) => `${p.id}=${p.name}`).join(",")}`),
    kick: (id) => calls.push(`kick:${id}`),
    start: (players) => calls.push(`start:${players.map((p) => p.id).join(",")}`),
    leave: (id) => calls.push(`leave:${id}`),
    rematchOffer: () => calls.push("rematch-offer"),
    rematchAccept: () => calls.push("rematch-accept"),
    rematchDecline: () => calls.push("rematch-decline"),
  };
}

describe("протокол лобби", () => {
  it("join/leave/kick с обрезкой", () => {
    const a = api();
    expect(applyLobbyMessage({ t: "join", name: "Игрок" }, a)).toBe(true);
    expect(applyLobbyMessage({ t: "leave", id: "p2" }, a)).toBe(true);
    expect(applyLobbyMessage({ t: "kick", id: "p3" }, a)).toBe(true);
    applyLobbyMessage({ t: "join", name: "y".repeat(60) }, a);
    expect(a.calls).toEqual(["join:Игрок", "leave:p2", "kick:p3", `join:${"y".repeat(40)}`]);
  });

  it("join с id пробрасывает id, без id — не передаёт", () => {
    const a = api();
    expect(applyLobbyMessage({ t: "join", name: "Гость", id: "p2" }, a)).toBe(true);
    expect(applyLobbyMessage({ t: "join", name: "Гость" }, a)).toBe(true);
    expect(applyLobbyMessage({ t: "join", name: "Гость", id: "w".repeat(60) }, a)).toBe(true);
    expect(a.calls).toEqual(["join:Гость:p2", "join:Гость", `join:Гость:${"w".repeat(40)}`]);
  });

  it("players/start принимают массив игроков", () => {
    const a = api();
    const players = [
      { id: "p1", name: "Хост" },
      { id: "p2", name: "Гость" },
    ];
    expect(applyLobbyMessage({ t: "players", players }, a)).toBe(true);
    expect(applyLobbyMessage({ t: "start", players }, a)).toBe(true);
    expect(a.calls).toEqual(["players:p1=Хост,p2=Гость", "start:p1,p2"]);
  });

  it("rematch-сообщения", () => {
    const a = api();
    expect(applyLobbyMessage({ t: "rematch-offer" }, a)).toBe(true);
    expect(applyLobbyMessage({ t: "rematch-accept" }, a)).toBe(true);
    expect(applyLobbyMessage({ t: "rematch-decline" }, a)).toBe(true);
    expect(a.calls).toEqual(["rematch-offer", "rematch-accept", "rematch-decline"]);
  });

  it("мусор отвергается", () => {
    const a = api();
    const bad = [
      null,
      "строка",
      42,
      {},
      { t: "unknown" },
      { t: "join" },
      { t: "join", name: 5 },
      { t: "join", name: "x", id: 5 },
      { t: "players" },
      { t: "players", players: "нет" },
      { t: "players", players: [{ id: "p1" }] },
      { t: "start", players: [null] },
      { t: "kick" },
      { t: "leave", id: 1 },
    ];
    for (const message of bad) expect(applyLobbyMessage(message, a)).toBe(false);
    expect(a.calls).toEqual([]);
  });
});

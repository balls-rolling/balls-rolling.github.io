import { describe, expect, it } from "vitest";
import { Game, type GameState, type Move, type MoveResult } from "@/core/game";
import { Session } from "@/core/session";
import { applyNetMessage, type NetApi } from "./protocol";
import { decodeInvite, encodeInvite, type Invite } from "./codec";
import { LocalTransport } from "./local-transport";

// Заглушка: ход принимается по числовым координатам, очередь — по кругу.
class StubGame extends Game {
  readonly id = "stub";
  readonly label = "Заглушка";

  createInitialState(playerIds: readonly string[]): GameState {
    return { order: [...playerIds] };
  }

  applyMove(state: GameState, _playerId: string, move: Move): MoveResult {
    if (typeof move.x !== "number" || typeof move.y !== "number") {
      return { accepted: false, state, finished: false };
    }
    return { accepted: true, state, finished: false };
  }

  chooseMove(): Move | null {
    return null;
  }

  nextPlayer(state: GameState, playerId: string): string {
    const order = (state as { order: readonly string[] }).order;
    return order[(order.indexOf(playerId) + 1) % order.length]!;
  }

  isFinished(): boolean {
    return false;
  }
}

describe("сетевой слой ядра", () => {
  it("применяет сетевые сообщения к настоящей сессии", () => {
    const session = new Session({
      game: new StubGame(),
      players: [
        { id: "p1", name: "Хост", agent: "human", transport: "local" },
        { id: "p2", name: "Гость", agent: "human", transport: "remote" },
      ],
    });
    session.start();

    let peerLeft = false;
    const api: NetApi = {
      setPeerName: (name) => session.renamePlayer("p2", name),
      remoteMove: (x, y) => session.makeMove("p2", { x, y }),
      remoteSurrender: () => session.concede("p2"),
      applyRemoteState: () => {},
      peerLeft: () => {
        peerLeft = true;
      },
    };

    // Хост ходит первым, затем ход переходит к удалённому гостю.
    expect(session.makeMove("p1", { x: 0, y: 0 })).toBe(true);
    expect(applyNetMessage({ t: "move", x: 1, y: 1 }, api)).toBe(true);
    expect(session.snapshot().currentPlayerId).toBe("p1");

    expect(applyNetMessage({ t: "hello", name: "Соперник" }, api)).toBe(true);
    expect(session.snapshot().players.find((p) => p.id === "p2")?.name).toBe("Соперник");

    expect(applyNetMessage({ t: "bye" }, api)).toBe(true);
    expect(peerLeft).toBe(true);

    expect(applyNetMessage({ t: "surrender" }, api)).toBe(true);
    expect(session.snapshot().state).toBe("finished");
    expect(session.snapshot().winnerId).toBe("p1");

    session.destroy();
  });

  it("кодек приглашения работает с локальным транспортом и метаданными", async () => {
    const transport = new LocalTransport();
    expect(transport.state).toBe("open");

    const invite: Invite = {
      v: 1,
      game: "tic-tac-toe",
      role: "host",
      name: "Хост",
      sdp: { type: "offer", sdp: "v=0\r\n" },
    };
    const decoded = await decodeInvite(await encodeInvite(invite), {
      games: ["tic-tac-toe"],
      version: 1,
      expectedRole: "host",
    });
    expect(decoded).toEqual(invite);
  });
});

import { describe, expect, it } from "vitest";
import { Game, type GameEntry, type GameState, type Move, type MoveResult } from "@/core/game";
import type { NetMessage, Transport, TransportState } from "@/core/net";
import { Platform } from "@/core/platform";
import { GameSaves } from "@/core/saves";
import { Session, type PlayerSave, type SessionSave } from "@/core/session";
import { createStore } from "@/core/storage";
import { MemoryBackend } from "@/core/storage/backends";
import { createNetLink } from "@/ui/net/link";
import {
  resumeNetworkGuest,
  resumeNetworkHost,
  type ResumeNetworkDeps,
} from "@/ui/resume-net-game";
import { createSessionHost } from "@/ui/session-host";

// Сквозной 12-b на FakeTransport: хост помнит партию и после переподключения
// отдаёт гостю состояние (`sync`), гость подключается заново и принимает его.

class FakeTransport implements Transport {
  state: TransportState = "open";
  peer!: FakeTransport;
  readonly #onMessage = new Set<(message: NetMessage) => void>();
  readonly #onState = new Set<(state: TransportState) => void>();

  send(message: NetMessage): void {
    for (const listener of this.peer.#onMessage) listener(message);
  }
  onMessage(listener: (message: NetMessage) => void): () => void {
    this.#onMessage.add(listener);
    return () => this.#onMessage.delete(listener);
  }
  onState(listener: (state: TransportState) => void): () => void {
    this.#onState.add(listener);
    return () => this.#onState.delete(listener);
  }
  close(): void {
    this.state = "closed";
    for (const listener of this.#onState) listener("closed");
  }
}

function pairedTransports(): [FakeTransport, FakeTransport] {
  const host = new FakeTransport();
  const guest = new FakeTransport();
  host.peer = guest;
  guest.peer = host;
  return [host, guest];
}

interface NetState extends GameState {
  readonly order: readonly string[];
  readonly moves: readonly { x: number; y: number; by: string }[];
}

/** Минимальная игра с локальной сериализацией состояния. */
class NetGame extends Game {
  readonly id = "net-game";
  readonly label = "Net game";

  createInitialState(playerIds: readonly string[]): GameState {
    return { order: [...playerIds], moves: [] };
  }
  applyMove(state: GameState, playerId: string, move: Move): MoveResult {
    const current = state as NetState;
    const x = move.x;
    const y = move.y;
    if (typeof x !== "number" || typeof y !== "number") {
      return { accepted: false, state, finished: false };
    }
    return {
      accepted: true,
      state: { order: current.order, moves: [...current.moves, { x, y, by: playerId }] },
      finished: false,
    };
  }
  chooseMove(): Move | null {
    return null;
  }
  nextPlayer(state: GameState, playerId: string): string | null {
    const current = state as NetState;
    const index = current.order.indexOf(playerId);
    return current.order[(index + 1) % current.order.length] ?? null;
  }
  isFinished(): boolean {
    return false;
  }
  serializeState(state: GameState): unknown {
    return { ...(state as NetState) };
  }
  deserializeState(data: unknown): GameState | null {
    if (typeof data !== "object" || data === null) return null;
    const raw = data as { order?: unknown; moves?: unknown };
    if (!Array.isArray(raw.order) || !Array.isArray(raw.moves)) return null;
    return { order: raw.order as string[], moves: raw.moves as NetState["moves"] };
  }
}

function player(id: string, name: string, transport: "local" | "remote"): PlayerSave {
  return { id, name, agent: "human", transport, properties: {} };
}

function hostSave(gameState: unknown): SessionSave {
  return {
    players: [player("p1", "Хост", "local"), player("p2", "Гость", "remote")],
    currentPlayerId: "p2",
    winnerId: null,
    state: "running",
    gameState,
  };
}

const noopDialog = { close: () => {} } as unknown as ResumeNetworkDeps["dialog"];

describe("сетевое восстановление: хост помнит, гость принимает состояние (12-b)", () => {
  it("после переподключения гость получает состояние хоста", async () => {
    const hostBackend = new MemoryBackend();
    const guestBackend = new MemoryBackend();
    const hostPlatform = new Platform(
      createStore(hostBackend),
      new GameSaves(createStore(hostBackend)),
    );
    const guestPlatform = new Platform(
      createStore(guestBackend),
      new GameSaves(createStore(guestBackend)),
    );

    // Хост помнит партию с одним ходом; у гостя сохранения нет.
    const hostGame0 = new NetGame();
    const playedState = hostGame0.applyMove(hostGame0.createInitialState(["p1", "p2"]), "p1", {
      x: 0,
      y: 0,
    }).state;
    await hostPlatform.saveGameSnapshot("net-game", { level: 2 }, hostSave(playedState));
    expect(await guestPlatform.hasSavedSession("net-game")).toBe(false);

    const [hostTransport, guestTransport] = pairedTransports();
    const hostLink = createNetLink();
    const guestLink = createNetLink();
    const hostHost = createSessionHost();
    const guestHost = createSessionHost();

    const hostDeps: ResumeNetworkDeps = {
      platform: hostPlatform,
      sessionHost: hostHost,
      dialog: noopDialog,
      netLink: hostLink,
      restoreLobby: {
        showHostRestore: async () => ({
          transport: hostTransport,
          ownPlayerId: "p1",
          remotePlayerId: "p2",
          ownName: "Хост",
        }),
        showClientRestore: async () => null,
      },
    };
    const guestDeps: ResumeNetworkDeps = {
      platform: guestPlatform,
      sessionHost: guestHost,
      dialog: noopDialog,
      netLink: guestLink,
      restoreLobby: {
        showHostRestore: async () => null,
        showClientRestore: async () => ({
          transport: guestTransport,
          ownPlayerId: "p2",
          remotePlayerId: "p1",
          ownName: "Гость",
        }),
      },
    };

    const hostEntry = {
      id: "net-game",
      label: "Net game",
      entry: async () => new NetGame(),
    } as GameEntry;
    const guestEntry = {
      id: "net-game",
      label: "Net game",
      entry: async () => new NetGame(),
    } as GameEntry;

    expect(await resumeNetworkHost(hostEntry, hostDeps)).toBe(true);
    // Гость подключается заново и получает состояние по `sync` (через `hello`).
    expect(await resumeNetworkGuest(guestEntry, "offer", guestDeps)).toBe(true);

    const guestSession = guestHost.session.value as Session;
    expect(guestSession.snapshot().state).toBe("running");
    expect(guestSession.save().gameState).toEqual({
      order: ["p1", "p2"],
      moves: [{ x: 0, y: 0, by: "p1" }],
    });
    expect(guestSession.snapshot().currentPlayerId).toBe("p2");

    const hostSession = hostHost.session.value as Session;
    hostSession.destroy();
    guestSession.destroy();
  });
});

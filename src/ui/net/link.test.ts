import { describe, expect, it } from "vitest";
import { Game, type GameState, type Move, type MoveResult } from "@/core/game";
import type { MessageListener, StateListener, Transport, TransportState } from "@/core/net";
import { Session } from "@/core/session";
import { createNetLink } from "./link";

class FakeTransport implements Transport {
  state: TransportState = "connecting";
  readonly sent: unknown[] = [];
  readonly #messages = new Set<MessageListener>();
  readonly #states = new Set<StateListener>();

  send(message: unknown): void {
    this.sent.push(message);
  }
  onMessage(listener: MessageListener): () => void {
    this.#messages.add(listener);
    return () => this.#messages.delete(listener);
  }
  onState(listener: StateListener): () => void {
    this.#states.add(listener);
    return () => this.#states.delete(listener);
  }
  close(): void {
    this.state = "closed";
    for (const listener of this.#states) listener("closed");
  }
  open(): void {
    this.state = "open";
    for (const listener of this.#states) listener("open");
  }
  emit(message: unknown): void {
    for (const listener of this.#messages) listener(message);
  }
}

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

function makeSession(): Session {
  const session = new Session({
    game: new StubGame(),
    players: [
      { id: "p1", name: "Хост", agent: "human", transport: "local" },
      { id: "p2", name: "Гость", agent: "human", transport: "remote" },
    ],
  });
  session.start();
  return session;
}

describe("NetLink", () => {
  it("шлёт hello, ходы, переименование и сдачу", () => {
    const session = makeSession();
    const transport = new FakeTransport();
    const link = createNetLink();
    link.configure({ transport, remotePlayerId: "p2", ownName: "Хост" });

    link.attach(session);
    expect(transport.sent).toContainEqual({ t: "hello", name: "Хост" });

    // До открытия канала ход не уходит.
    expect(link.sendMove({ x: 1, y: 2 })).toBe(false);

    transport.open();
    expect(link.status.value).toBe("open");

    expect(session.makeMove("p1", { x: 0, y: 0 })).toBe(true);
    expect(link.sendMove({ x: 5, y: 5 })).toBe(true);
    expect(transport.sent).toContainEqual({ t: "move", x: 5, y: 5 });

    // Входящий ход удалённого игрока.
    transport.emit({ t: "move", x: 1, y: 1 });
    expect(session.snapshot().currentPlayerId).toBe("p1");

    transport.emit({ t: "hello", name: "Соперник" });
    expect(session.snapshot().players.find((p) => p.id === "p2")?.name).toBe("Соперник");

    transport.emit({ t: "bye" });
    expect(link.peerLeft.value).toBe(true);

    transport.emit({ t: "surrender" });
    expect(session.snapshot().state).toBe("finished");
    expect(session.snapshot().winnerId).toBe("p1");

    link.detach();
    expect(transport.sent).toContainEqual({ t: "bye" });
    expect(transport.state).toBe("closed");
    expect(link.transport.value).toBeNull();

    session.destroy();
  });

  it("attach не делает ничего без конфигурации", () => {
    const session = makeSession();
    const link = createNetLink();
    expect(() => link.attach(session)).not.toThrow();
    expect(link.transport.value).toBeNull();
    session.destroy();
  });

  it("шлёт playerId, когда ownPlayerId задан", () => {
    const session = makeSession();
    const transport = new FakeTransport();
    const link = createNetLink();
    link.configure({
      transport,
      remotePlayerId: "p2",
      ownName: "Хост",
      ownPlayerId: "p1",
    });

    link.attach(session);
    expect(transport.sent).toContainEqual({
      t: "hello",
      name: "Хост",
      playerId: "p1",
    });

    link.detach();
    session.destroy();
  });

  it("повторный configure сохраняет ownPlayerId", () => {
    const session = makeSession();
    const first = new FakeTransport();
    const link = createNetLink();
    link.configure({
      transport: first,
      remotePlayerId: "p2",
      ownName: "Хост",
      ownPlayerId: "p1",
    });
    link.attach(session);

    const second = new FakeTransport();
    link.configure({
      transport: second,
      remotePlayerId: "p2",
      ownName: "Хост",
      ownPlayerId: "p1",
    });
    link.attach(session);
    expect(second.sent).toContainEqual({
      t: "hello",
      name: "Хост",
      playerId: "p1",
    });

    link.detach();
    session.destroy();
  });

  it("принимает совпадающий playerId и переименовывает", () => {
    const session = makeSession();
    const transport = new FakeTransport();
    const link = createNetLink();
    link.configure({
      transport,
      remotePlayerId: "p2",
      ownName: "Хост",
      ownPlayerId: "p1",
    });
    link.attach(session);

    transport.emit({ t: "hello", name: "Соперник", playerId: "p2" });
    expect(link.peerLeft.value).toBe(false);
    expect(session.snapshot().players.find((p) => p.id === "p2")?.name).toBe("Соперник");

    link.detach();
    session.destroy();
  });

  it("несовпадающий playerId: peerLeft и имя не меняется", () => {
    const session = makeSession();
    const transport = new FakeTransport();
    const link = createNetLink();
    link.configure({
      transport,
      remotePlayerId: "p2",
      ownName: "Хост",
      ownPlayerId: "p1",
    });
    link.attach(session);

    transport.emit({ t: "hello", name: "Чужой", playerId: "p3" });
    expect(link.peerLeft.value).toBe(true);
    expect(session.snapshot().players.find((p) => p.id === "p2")?.name).toBe("Гость");

    link.detach();
    session.destroy();
  });

  it("hello без playerId — мягкое переименование, как раньше", () => {
    const session = makeSession();
    const transport = new FakeTransport();
    const link = createNetLink();
    link.configure({
      transport,
      remotePlayerId: "p2",
      ownName: "Хост",
      ownPlayerId: "p1",
    });
    link.attach(session);

    transport.emit({ t: "hello", name: "Соперник" });
    expect(link.peerLeft.value).toBe(false);
    expect(session.snapshot().players.find((p) => p.id === "p2")?.name).toBe("Соперник");

    link.detach();
    session.destroy();
  });
});

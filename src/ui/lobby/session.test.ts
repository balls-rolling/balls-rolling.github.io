import { describe, expect, it, vi } from "vitest";
import type {
  LobbyPlayer,
  MessageListener,
  StateListener,
  Transport,
  TransportState,
} from "@/core/net";
import { GuestLobbySession, HostLobbySession } from "./session";

class FakeTransport implements Transport {
  peer!: FakeTransport;
  state: TransportState = "open";
  readonly #messages = new Set<MessageListener>();
  readonly #states = new Set<StateListener>();

  send(message: unknown): void {
    for (const listener of this.peer.#messages) listener(message);
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
}

function pair(): [FakeTransport, FakeTransport] {
  const host = new FakeTransport();
  const guest = new FakeTransport();
  host.peer = guest;
  guest.peer = host;
  return [host, guest];
}

describe("сессии лобби", () => {
  it("join → состав у обеих сторон; kick → гость уведомлён", () => {
    const [hostT, guestT] = pair();
    const hostPlayers = vi.fn();
    const guestPlayers = vi.fn();
    const kicked = vi.fn();

    const host = new HostLobbySession("Хост", hostT, {
      players: hostPlayers,
      rematchOffer: vi.fn(),
      rematchAccept: vi.fn(),
      rematchDecline: vi.fn(),
    });
    const guest = new GuestLobbySession("Гость", guestT, {
      players: guestPlayers,
      start: vi.fn(),
      kicked,
      rematchOffer: vi.fn(),
      rematchAccept: vi.fn(),
      rematchDecline: vi.fn(),
    });

    guest.join();
    expect(host.roster.list()).toEqual([
      { id: "p1", name: "Хост" },
      { id: "p2", name: "Гость" },
    ]);
    expect(hostPlayers).toHaveBeenLastCalledWith(host.roster.list());
    expect(guestPlayers).toHaveBeenLastCalledWith(host.roster.list());

    host.kick("p2");
    expect(kicked).toHaveBeenCalledTimes(1);
    expect(host.roster.list()).toEqual([{ id: "p1", name: "Хост" }]);

    host.dispose();
    guest.dispose();
  });

  it("start рассылает состав и запускает гостя", () => {
    const [hostT, guestT] = pair();
    const started = vi.fn();
    const host = new HostLobbySession("Хост", hostT, {
      players: vi.fn(),
      rematchOffer: vi.fn(),
      rematchAccept: vi.fn(),
      rematchDecline: vi.fn(),
    });
    const guest = new GuestLobbySession("Гость", guestT, {
      players: vi.fn(),
      start: started,
      kicked: vi.fn(),
      rematchOffer: vi.fn(),
      rematchAccept: vi.fn(),
      rematchDecline: vi.fn(),
    });

    guest.join();
    host.start();

    expect(started).toHaveBeenCalledTimes(1);
    expect(started.mock.calls[0]![0]).toEqual([
      { id: "p1", name: "Хост" },
      { id: "p2", name: "Гость" },
    ]);

    host.dispose();
    guest.dispose();
  });

  it("обрыв канала убирает удалённого игрока у хоста", () => {
    const [hostT, guestT] = pair();
    const host = new HostLobbySession("Хост", hostT, {
      players: vi.fn(),
      rematchOffer: vi.fn(),
      rematchAccept: vi.fn(),
      rematchDecline: vi.fn(),
    });
    const guest = new GuestLobbySession("Гость", guestT, {
      players: vi.fn(),
      start: vi.fn(),
      kicked: vi.fn(),
      rematchOffer: vi.fn(),
      rematchAccept: vi.fn(),
      rematchDecline: vi.fn(),
    });
    guest.join();
    expect(host.roster.list()).toHaveLength(2);

    guest.leave(); // закрывает канал гостя
    hostT.state = "closed";
    // Хост узнаёт о закрытии через собственный onState (симулируем).
    // В реальном WebRTC pc.connectionState придёт как closed/failed.
    expect(host.roster.list()).toHaveLength(2); // до события
    hostT.close();
    expect(host.roster.list()).toHaveLength(1);

    host.dispose();
    guest.dispose();
  });
});

const PRESET: readonly LobbyPlayer[] = [
  { id: "p1", name: "Хост" },
  { id: "p2", name: "Гость" },
];

const PRESET_HOST_CALLBACKS = {
  players: vi.fn(),
  rematchOffer: vi.fn(),
  rematchAccept: vi.fn(),
  rematchDecline: vi.fn(),
};

const PRESET_GUEST_CALLBACKS = {
  players: vi.fn(),
  start: vi.fn(),
  kicked: vi.fn(),
  rematchOffer: vi.fn(),
  rematchAccept: vi.fn(),
  rematchDecline: vi.fn(),
};

describe("сессии лобби — режим восстановления (preset)", () => {
  it("гость допускается по id, canStart растёт по мере готовности", () => {
    const [hostT, guestT] = pair();
    const hostPlayers = vi.fn();
    const host = new HostLobbySession(
      "Хост",
      hostT,
      { ...PRESET_HOST_CALLBACKS, players: hostPlayers },
      { preset: PRESET },
    );
    const guest = new GuestLobbySession("Гость", guestT, PRESET_GUEST_CALLBACKS, {
      playerId: "p2",
    });

    expect(host.canStart).toBe(false);
    guest.join();
    expect(host.canStart).toBe(true);
    // Состав задан снимком — не меняется, но рассылается сторонам.
    expect(host.roster.list()).toEqual(PRESET);
    expect(hostPlayers).toHaveBeenLastCalledWith(PRESET);

    host.dispose();
    guest.dispose();
  });

  it("чужой id игнорируется, готовность не наступает", () => {
    const [hostT, guestT] = pair();
    const host = new HostLobbySession("Хост", hostT, PRESET_HOST_CALLBACKS, {
      preset: PRESET,
    });
    const stranger = new GuestLobbySession("Чужой", guestT, PRESET_GUEST_CALLBACKS, {
      playerId: "p3",
    });

    stranger.join();
    expect(host.canStart).toBe(false);
    expect(host.roster.list()).toEqual(PRESET);

    host.dispose();
    stranger.dispose();
  });

  it("обрыв канала сбрасывает готовность и сохраняет состав", () => {
    const [hostT, guestT] = pair();
    const host = new HostLobbySession("Хост", hostT, PRESET_HOST_CALLBACKS, {
      preset: PRESET,
    });
    const guest = new GuestLobbySession("Гость", guestT, PRESET_GUEST_CALLBACKS, {
      playerId: "p2",
    });

    guest.join();
    expect(host.canStart).toBe(true);

    guest.leave();
    hostT.close();
    expect(host.canStart).toBe(false);
    // Партия не теряется: состав из снимка на месте.
    expect(host.roster.list()).toEqual(PRESET);

    host.dispose();
    guest.dispose();
  });

  it("повторный допуск того же id не меняет готовность", () => {
    const [hostT, guestT] = pair();
    const host = new HostLobbySession("Хост", hostT, PRESET_HOST_CALLBACKS, {
      preset: PRESET,
    });
    const guest = new GuestLobbySession("Гость", guestT, PRESET_GUEST_CALLBACKS, {
      playerId: "p2",
    });

    guest.join();
    guest.join();
    expect(host.canStart).toBe(true);
    expect(host.roster.list()).toEqual(PRESET);

    host.dispose();
    guest.dispose();
  });
});

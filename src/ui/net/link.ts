import { shallowRef, type InjectionKey, type ShallowRef } from "vue";
import type { Move } from "@/core/game";
import { applyNetMessage, type Transport, type TransportState } from "@/core/net";
import type { Session } from "@/core/session";

// Мост между сессией и сетью. Сессия транспортно-агностична (принцип 7a):
// исходящие ходы отправляет UI-адаптер, входящие — применяет к сессии здесь.

export interface NetLinkConfig {
  readonly transport: Transport;
  readonly remotePlayerId: string;
  readonly ownName: string;
  // Идентичность для сверки при восстановлении партии (фаза 12-b).
  // Отсутствие поля — мягкий режим, как в фазе 11.
  readonly ownPlayerId?: string;
  // Хост отдаёт снимок своей партии, чтобы прислать его гостю при переподключении
  // (12-b, D14). У гостя поля нет.
  readonly outgoingState?: () => unknown;
}

export interface NetLink {
  readonly transport: ShallowRef<Transport | null>;
  readonly status: ShallowRef<TransportState>;
  readonly peerLeft: ShallowRef<boolean>;
  configure(config: NetLinkConfig): void;
  attach(session: Session): void;
  sendMove(move: Move): boolean;
  /** Отправить гостю снимок партии (хост). `false` — канал не готов. */
  sendState(save: unknown): boolean;
  detach(): void;
}

export const netLinkKey: InjectionKey<NetLink> = Symbol("net-link");

export function createNetLink(): NetLink {
  const transport = shallowRef<Transport | null>(null);
  const status = shallowRef<TransportState>("idle");
  const peerLeft = shallowRef(false);

  let config: NetLinkConfig | null = null;
  let attachedSession: Session | null = null;
  let offMessage: (() => void) | null = null;
  let offState: (() => void) | null = null;

  function unsubscribe(): void {
    offMessage?.();
    offState?.();
    offMessage = null;
    offState = null;
    attachedSession = null;
  }

  function cleanup(): void {
    if (config?.transport.state === "open") config.transport.send({ t: "bye" });
    unsubscribe();
    peerLeft.value = false;
    status.value = "idle";
    config?.transport.close();
    config = null;
    transport.value = null;
  }

  function configure(next: NetLinkConfig): void {
    cleanup();
    config = next;
    transport.value = next.transport;
  }

  function attach(session: Session): void {
    if (!config) return;
    if (attachedSession === session) return;
    unsubscribe();
    attachedSession = session;

    const active = config;
    offMessage = active.transport.onMessage((message) => {
      applyNetMessage(message, {
        setPeerName: (name, playerId) => {
          // Сверка личности (фаза 12-b): если id известен и пришёл чужой —
          // считаем, что подключился не тот игрок, имя не применяем.
          if (playerId !== undefined && playerId !== active.remotePlayerId) {
            peerLeft.value = true;
            return;
          }
          session.renamePlayer(active.remotePlayerId, name);
          // Хост: получив hello гостя, отдаём ему актуальное состояние партии.
          sendStateIfHost();
        },
        remoteMove: (x, y) => session.makeMove(active.remotePlayerId, { x, y }),
        remoteSurrender: () => session.concede(active.remotePlayerId),
        applyRemoteState: (save) => {
          session.adoptState(save);
        },
        peerLeft: () => {
          peerLeft.value = true;
        },
      });
    });
    offState = active.transport.onState((state) => {
      status.value = state;
      // Канал открылся — если это хост, состояние можно отдать сразу.
      if (state === "open") sendStateIfHost();
    });
    status.value = active.transport.state;
    active.transport.send(
      active.ownPlayerId !== undefined
        ? { t: "hello", name: active.ownName, playerId: active.ownPlayerId }
        : { t: "hello", name: active.ownName },
    );
  }

  /** Хост (есть `outgoingState`) отправляет гостю снимок партии. */
  function sendStateIfHost(): void {
    if (!config?.outgoingState) return;
    if (config.transport.state !== "open") return;
    config.transport.send({ t: "sync", save: config.outgoingState() });
  }

  function sendState(save: unknown): boolean {
    if (!config || config.transport.state !== "open") return false;
    config.transport.send({ t: "sync", save });
    return true;
  }

  function sendMove(move: Move): boolean {
    if (!config || config.transport.state !== "open") return false;
    config.transport.send({ t: "move", x: move.x, y: move.y });
    return true;
  }

  return {
    transport,
    status,
    peerLeft,
    configure,
    attach,
    sendMove,
    sendState,
    detach: () => cleanup(),
  };
}

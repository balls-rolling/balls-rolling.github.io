import { shallowRef, type InjectionKey, type ShallowRef } from "vue";
import type { Move } from "@/core/game";
import {
  applyNetMessage,
  type MoveMeta,
  type Transport,
  type TransportState,
} from "@/core/net";
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
  // (12-b, D14) и при рассинхроне (02-d). У гостя поля нет.
  readonly outgoingState?: () => unknown;
}

/**
 * Хуки игры поверх платформенного моста (02-d). Без них работают умолчания:
 * входящий ход применяется через `session.makeMove`, снимок — через
 * `session.adoptState` (крестики-нолики и прочие игры).
 */
export interface NetLinkGameHooks {
  /**
   * Входящий ход игры. `true` — игра обработала сама (например, играет реплеем
   * и применит позже); `false` — фолбэк на `session.makeMove`.
   */
  onRemoteMove?(move: Move, meta: MoveMeta): boolean;
  /** Живой кадр подготовки соперника (02-e): игра хранит его как слот вида. */
  onRemotePrep?(prep: unknown): void;
  /**
   * Сигнал старта удара (02-e): игра запускает свой реплей тем же путём, но не
   * применяет удар до авторитетного результата. `true` — обработано.
   */
  onRemoteShot?(move: Move, seq?: number): boolean;
  /** Снимок хоста принят: игра сбрасывает рантайм анимации. */
  onStateAdopted?(settings: unknown): void;
}

export interface NetLink {
  readonly transport: ShallowRef<Transport | null>;
  readonly status: ShallowRef<TransportState>;
  readonly peerLeft: ShallowRef<boolean>;
  configure(config: NetLinkConfig): void;
  attach(session: Session): void;
  sendMove(move: Move, meta?: MoveMeta): boolean;
  /** Отправить живой кадр подготовки сопернику (02-e). `false` — канал не готов. */
  sendPrep(prep: unknown): boolean;
  /** Отправить сигнал старта удара с `seq` будущего хода (02-e). */
  sendShot(move: Move, seq: number): boolean;
  /** Отправить гостю снимок партии (хост). `false` — канал не готов. */
  sendState(save: unknown): boolean;
  /** Попросить у хоста снимок при рассинхроне. `false` — канал не готов. */
  requestResync(): boolean;
  /**
   * Игра сообщает, что партнёр не отвечает (таймаут 5+5, 02-e): выставляем тот
   * же признак обрыва, что при явном `bye`, — дальше работает `NetRecovery`.
   */
  signalPeerUnresponsive(): void;
  /** Хуки игры (реплей входящего хода, сброс рантайма при снимке). */
  setGameHooks(hooks: NetLinkGameHooks | null): void;
  /** Хост: задать источник снимка после `configure` (02-d). */
  setOutgoingState(provider: (() => unknown) | null): void;
  /** Хост: задать источник настроек партии для `sync` (02-d). */
  setOutgoingSettings(provider: (() => unknown) | null): void;
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
  let hooks: NetLinkGameHooks | null = null;
  let outgoingState: (() => unknown) | null = null;
  let outgoingSettings: (() => unknown) | null = null;

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
    outgoingState = null;
    outgoingSettings = null;
  }

  function configure(next: NetLinkConfig): void {
    cleanup();
    config = next;
    transport.value = next.transport;
    outgoingState = next.outgoingState ?? null;
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
        remoteMove: (move, meta) => {
          // Игра с реплеем обрабатывает ход сама; остальные — применяют сразу.
          if (hooks?.onRemoteMove?.(move, meta)) return;
          session.makeMove(active.remotePlayerId, move);
        },
        remotePrep: (prep) => {
          hooks?.onRemotePrep?.(prep);
        },
        remoteShot: (move, seq) => {
          hooks?.onRemoteShot?.(move, seq);
        },
        remoteSurrender: () => session.concede(active.remotePlayerId),
        applyRemoteState: (save, settings) => {
          if (session.adoptState(save)) hooks?.onStateAdopted?.(settings);
        },
        requestResync: () => sendStateIfHost(),
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

  /** Хост (есть источник снимка) отправляет гостю состояние партии. */
  function sendStateIfHost(): void {
    if (!outgoingState) return;
    if (config?.transport.state !== "open") return;
    const settings = outgoingSettings?.();
    config.transport.send(
      settings === undefined
        ? { t: "sync", save: outgoingState() }
        : { t: "sync", save: outgoingState(), settings },
    );
  }

  function sendState(save: unknown): boolean {
    if (!config || config.transport.state !== "open") return false;
    config.transport.send({ t: "sync", save });
    return true;
  }

  function requestResync(): boolean {
    if (!config || config.transport.state !== "open") return false;
    config.transport.send({ t: "resync" });
    return true;
  }

  function sendMove(move: Move, meta?: MoveMeta): boolean {
    if (!config || config.transport.state !== "open") return false;
    config.transport.send({
      t: "move",
      m: move,
      ...(meta?.seq !== undefined ? { seq: meta.seq } : {}),
      ...(meta?.hash !== undefined ? { hash: meta.hash } : {}),
    });
    return true;
  }

  function sendPrep(prep: unknown): boolean {
    if (!config || config.transport.state !== "open") return false;
    config.transport.send({ t: "prep", p: prep });
    return true;
  }

  function sendShot(move: Move, seq: number): boolean {
    if (!config || config.transport.state !== "open") return false;
    config.transport.send({ t: "shot", m: move, seq });
    return true;
  }

  return {
    transport,
    status,
    peerLeft,
    configure,
    attach,
    sendMove,
    sendPrep,
    sendShot,
    sendState,
    requestResync,
    signalPeerUnresponsive: () => {
      // Тот же признак, что при `bye`: дальше решает `NetRecovery`.
      peerLeft.value = true;
    },
    setGameHooks: (next) => {
      hooks = next;
    },
    setOutgoingState: (provider) => {
      outgoingState = provider;
    },
    setOutgoingSettings: (provider) => {
      outgoingSettings = provider;
    },
    detach: () => {
      cleanup();
      // Хуки принадлежат игре: снимаем их только при явном отсоединении.
      hooks = null;
    },
  };
}

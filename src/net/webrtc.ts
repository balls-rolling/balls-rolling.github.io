import type { MessageListener, StateListener, Transport, TransportState } from "@/core/net";

// WebRTC-транспорт: ручной обмен SDP, без trickle и сигналинг-сервера.
// Порт `net/rtc.js`: один код в каждую сторону, мягкое ожидание ICE, гость
// отдаёт ответ сразу после сбора ICE (ждать открытия канала нельзя — дедлок).
// Слой знает только SDP; метаданные приглашения клеит UI.

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const ICE_TIMEOUT_MS = 4000;

/**
 * Мягкое ожидание сбора ICE: null-кандидат, `complete` или таймаут. Никогда не
 * бросает — отсутствие `complete` не должно убивать обмен.
 */
function waitIce(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (): void => {
      if (done) return;
      done = true;
      if (timer !== null) clearTimeout(timer);
      pc.removeEventListener("icecandidate", onCandidate);
      pc.removeEventListener("icegatheringstatechange", onState);
      resolve();
    };
    const onCandidate = (event: RTCPeerConnectionIceEvent): void => {
      if (!event.candidate) finish();
    };
    const onState = (): void => {
      if (pc.iceGatheringState === "complete") finish();
    };
    pc.addEventListener("icecandidate", onCandidate);
    pc.addEventListener("icegatheringstatechange", onState);
    timer = setTimeout(finish, ICE_TIMEOUT_MS);
  });
}

class WebRtcTransport implements Transport {
  #state: TransportState = "connecting";
  readonly #messages = new Set<MessageListener>();
  readonly #states = new Set<StateListener>();
  readonly #queue: string[] = [];
  readonly #pc: RTCPeerConnection;
  #dc: RTCDataChannel | null = null;

  constructor(pc: RTCPeerConnection) {
    this.#pc = pc;
    // `open` ставим только по открытию канала данных: `connectionState`
    // "connected" может опередить `dc.open`, и тогда `send` потерял бы сообщение.
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.#setState("failed");
      } else if (pc.connectionState === "closed") {
        this.#setState("closed");
      }
    });
    // ICE-состояние дублирует сбои и часто срабатывает быстрее; `disconnected`
    // считаем обрывом, чтобы оставшиеся игроки получили уведомление (12-b).
    pc.addEventListener("iceconnectionstatechange", () => {
      const ice = pc.iceConnectionState;
      if (ice === "failed" || ice === "disconnected") this.#setState("failed");
    });
  }

  get state(): TransportState {
    return this.#state;
  }

  /** Подключить канал данных. У гостя он приходит событием `datachannel` позже. */
  setChannel(dc: RTCDataChannel): void {
    this.#dc = dc;
    dc.addEventListener("open", () => {
      this.#setState("open");
      for (const data of this.#queue.splice(0)) dc.send(data);
    });
    dc.addEventListener("close", () => this.#setState("closed"));
    dc.addEventListener("error", () => this.#setState("failed"));
    dc.addEventListener("message", (event) => {
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return; // мусор игнорируем
      }
      for (const listener of this.#messages) listener(message);
    });
  }

  send(message: unknown): void {
    const data = JSON.stringify(message);
    if (this.#dc && this.#dc.readyState === "open") {
      this.#dc.send(data);
      return;
    }
    // Канал ещё не открыт — не теряем первые сообщения (hello, первый ход).
    if (this.#state === "connecting" || this.#state === "idle") {
      this.#queue.push(data);
    }
  }

  onMessage(listener: MessageListener): () => void {
    this.#messages.add(listener);
    return () => {
      this.#messages.delete(listener);
    };
  }

  onState(listener: StateListener): () => void {
    this.#states.add(listener);
    return () => {
      this.#states.delete(listener);
    };
  }

  close(): void {
    this.#queue.length = 0;
    this.#dc?.close();
    this.#pc.close();
    this.#setState("closed");
  }

  #setState(state: TransportState): void {
    if (this.#state === state) return;
    this.#state = state;
    for (const listener of this.#states) listener(state);
  }
}

export interface HostHandle {
  readonly transport: Transport;
  readonly description: RTCSessionDescriptionInit;
  accept(description: RTCSessionDescriptionInit): Promise<void>;
}

export interface GuestHandle {
  readonly transport: Transport;
  readonly description: RTCSessionDescriptionInit;
}

/** Хост: создаёт offer, ждёт ICE; `accept` принимает ответ гостя. */
export async function startHost(): Promise<HostHandle> {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const transport = new WebRtcTransport(pc);
  transport.setChannel(pc.createDataChannel("game", { ordered: true }));

  await pc.setLocalDescription(await pc.createOffer());
  await waitIce(pc);

  return {
    transport,
    description: pc.localDescription!,
    accept: async (description) => {
      await pc.setRemoteDescription(description);
    },
  };
}

/** Гость: принимает offer и отдаёт answer сразу; канал открывается позже сам. */
export async function startGuest(offer: RTCSessionDescriptionInit): Promise<GuestHandle> {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const transport = new WebRtcTransport(pc);
  pc.addEventListener("datachannel", (event) => transport.setChannel(event.channel));

  await pc.setRemoteDescription(offer);
  await pc.setLocalDescription(await pc.createAnswer());
  await waitIce(pc);

  // Ответ возвращаем, не дожидаясь открытия канала: иначе дедлок (хост примет
  // answer только после того, как мы его отдадим).
  return { transport, description: pc.localDescription! };
}

import type { MessageListener, StateListener, Transport, TransportState } from "./transport";

// Локальный канал: соперник на той же машине, отдельного провода нет. Класс
// существует ради единого интерфейса `Transport` (хот-сит, ИИ, демо) и тестов.

export class LocalTransport implements Transport {
  #state: TransportState = "open";
  readonly #messages = new Set<MessageListener>();
  readonly #states = new Set<StateListener>();

  get state(): TransportState {
    return this.#state;
  }

  /** Локальному сопернику слать некуда: сообщение молча не доставляется. */
  send(_message: unknown): void {
    /* локальный канал ничего не передаёт */
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
    if (this.#state === "closed") return;
    this.#state = "closed";
    for (const listener of this.#states) listener("closed");
    this.#messages.clear();
  }
}

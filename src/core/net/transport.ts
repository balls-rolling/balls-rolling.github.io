// Абстракция канала связи. Игра и сессия не знают, локальная партия или сетевая:
// им доступен только этот интерфейс. Реализации — локальный канал (соперник на
// той же машине) и WebRTC (удалённый). Ни DOM, ни Vue здесь нет — ядро остаётся
// тестируемым в node.

/** Состояние канала. */
export type TransportState = "idle" | "connecting" | "open" | "closed" | "failed";

/** Слушатель входящего сообщения. */
export type MessageListener = (message: unknown) => void;

/** Слушатель смены состояния. */
export type StateListener = (state: TransportState) => void;

/**
 * Канал обмена сообщениями. `send` не бросает; отписки, возвращаемые
 * `onMessage`/`onState`, снимают слушателя.
 */
export interface Transport {
  readonly state: TransportState;
  send(message: unknown): void;
  onMessage(listener: MessageListener): () => void;
  onState(listener: StateListener): () => void;
  close(): void;
}

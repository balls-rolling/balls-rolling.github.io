import type { LobbyPlayer } from "@/core/net";

// Состояние экрана лобби и его события. Оркестратор ведёт состояние реактивно и
// передаёт сюда; компонент только отображает и дёргает колбэки.

export interface LobbyViewState {
  role: "host" | "guest";
  players: LobbyPlayer[];
  /** Ссылка-приглашение (хост). */
  inviteLink: string;
  /** Ответный код (гость). */
  answerCode: string;
  /** Идёт подготовка (сбор ICE) — показываем спиннер. */
  preparing: boolean;
  /** Гость уже подключился (в лобби ожидания). */
  joined: boolean;
  busy: boolean;
  error: string;
  /** Режим восстановления партии (12-b): другой заголовок и правила экрана. */
  restore?: boolean;
  /** Готовность старта в восстановлении (хост): все ожидаемые допущены. */
  canStart?: boolean;
  /** Текстовое ожидание гостя в восстановлении (вместо ответного кода). */
  waiting?: string;
}

export interface LobbyViewCallbacks {
  onKick?(id: string): void;
  onStart?(): void;
  onAnswer?(code: string): void;
  onJoin?(code: string): void;
  onLeave?(): void;
  onScan?(text: string): void;
}

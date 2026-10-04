// Интерфейс игрового меню и выхода. Игра объявляет пункты меню и настраивает
// системный диалог выхода; сами действия выполняет платформа, а игру уведомляет.
// Здесь только типы и данные — ни Vue, ни UI.

/** Пункт игрового меню, объявленный игрой. */
export interface GameMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
}

/** Контекст запроса на выход, который получает игра. */
export interface ExitRequest {
  /** В партии больше одного игрока. */
  readonly multiplayer: boolean;
  readonly playerCount: number;
}

/**
 * Настройка системного диалога выхода. Игра не заменяет диалог, а может
 * подменить текст, добавить строку к заголовку и/или дополнительную кнопку.
 */
export interface ExitCustomization {
  /** Свой текст вместо стандартного. */
  readonly message?: string;
  /** Дополнительная строка к системному заголовку. */
  readonly titleNote?: string;
  /** Дополнительная кнопка: `value` вернётся в `onExitResolved`. */
  readonly extraAction?: {
    readonly value: string;
    readonly label: string;
  };
}

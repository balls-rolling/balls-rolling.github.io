import type { SessionSave } from "../session";

// Формат сохранений. Узел партии лежит под одним ключом `game/<id>`: настройки
// игры и снимок сессии хранятся раздельно (D4), чтобы можно было перезаписать
// снимок, не теряя настройки, и наоборот.

/** Текущая версия сохранённого снимка сессии. Растёт при смене формата. */
export const SAVE_VERSION = 1;

/**
 * Снимок сессии вместе с версией формата. Версия лежит в payload, а не в
 * конверте `storage` (решение 5 плана): конверт общий для всего хранилища и
 * его менять нельзя.
 */
export interface StoredSession {
  readonly v: number;
  readonly data: SessionSave;
}

/**
 * Узел партии: настройки игры (непрозрачны для хранилища) и снимок сессии.
 * Любое из полей может отсутствовать.
 */
export interface GameSaveNode {
  readonly settings: unknown | null;
  readonly session: StoredSession | null;
}

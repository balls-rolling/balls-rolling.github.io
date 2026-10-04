import type { FormHandle } from "../form";
import type { PlayerInit } from "../player";
import type { SessionSnapshot } from "../session";
import type { Move } from "./move";

// Контракты окружения игры. Платформа предоставляет игре этот интерфейс; игра
// зовёт его методы из обработчиков сигналов своей формы.
//
// Здесь только типы и данные: ни Vue, ни UI, ни конкретных игр. Файл не должен
// импортировать `core/platform` — платформа импортирует игру, и вышел бы цикл.

/**
 * Доступ к активной сессии. Игра не получает сам `Session`: только то, что ей
 * действительно нужно, чтобы её UI мог читать состояние и делать ходы.
 */
export interface SessionAccess {
  snapshot(): SessionSnapshot;
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;
  renamePlayer(playerId: string, name: string): boolean;
  makeMove(playerId: string, move: Move): boolean;
}

/**
 * Ограничения состава. Платформа про «двоих» не знает: лимит — параметр.
 * Роль хост/клиент сюда не входит — она принадлежит лобби, а не игроку.
 */
export interface LobbyOptions {
  readonly maxPlayers?: number;
  readonly allowComputer?: boolean;
}

/** Опции локального состава по умолчанию. */
export interface LocalPlayersOptions extends LobbyOptions {
  readonly humans?: number;
  readonly computers?: number;
}

/**
 * Лобби: собирает состав игроков **до** создания сессии и отдаёт плейн-данные
 * `PlayerInit[]` — ровно вход `Platform.createSession`. Живые объекты создаются
 * только на запуске.
 *
 * Серверная и клиентская половины разделены. В этой фазе реализована локальная;
 * сетевая — фаза 10, интерфейс уже объявлен.
 */
export interface Lobby {
  /** Локальный состав по умолчанию: имя человека берётся из глобальных настроек. */
  defaultPlayers(options?: LocalPlayersOptions): Promise<readonly PlayerInit[]>;
  /** Серверное лобби: открыть и собрать состав. `null` — отмена. */
  showHost(options?: LobbyOptions): Promise<readonly PlayerInit[] | null>;
  /** Клиентское лобби: подключение по приглашению. `null` — отмена. */
  showClient(options?: LobbyOptions): Promise<readonly PlayerInit[] | null>;
}

/** Опции запуска. Локальные, чтобы `core/game` не зависел от ядра платформы. */
export interface LaunchOptions {
  readonly demo?: boolean;
}

/**
 * Окружение игры: то, чем игра пользуется, не зная внутренностей платформы.
 * Возможности за пределами этой фазы (`board`, `ui`) добавляются аддитивно.
 */
export interface GameEnvironment {
  readonly game: {
    readonly id: string;
    readonly label: string;
    /** Управляющий объект преднастройки: игра читает значения и слушает сигналы. */
    readonly setup: FormHandle;
  };
  readonly lobby: Lobby;
  /**
   * Запуск игры: сессия попадает в слот платформы, слои переключаются, UI
   * строится. Возвращает доступ к сессии.
   */
  launch(players: readonly PlayerInit[], options?: LaunchOptions): Promise<SessionAccess>;
}

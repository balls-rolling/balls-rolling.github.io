import type { FormNode, FormSchema } from "../form";
import type { PlayerInit, PropertySchema } from "../player";
import type { UiLayoutSchema } from "../ui-zones";
import type { GameEnvironment } from "./environment";
import type { ExitCustomization, ExitRequest, GameMenuItem } from "./menu";
import type { GameState, Move, MoveResult } from "./move";
import type { GameRenderFrame } from "./render";

// Базовый класс игры. Правила и очередь хода принадлежат игре (D3): в бильярде
// после удачного удара игрок ходит снова, и это знает только игра.
//
// Класс не знает ни о Vue, ни об UI, ни о других играх.

/** Опции вида игры: что включено в интерфейсе вокруг поля. */
export interface GameViewOptions {
  readonly zoom: boolean;
  readonly pan: boolean;
  readonly grid: boolean;
  /** Стандартная панель участников платформы. Игра может отказаться (своя). */
  readonly playersPanel?: boolean;
  /** Показывать в панели участников счёт, шары и время. По умолчанию нет. */
  readonly playersStats?: boolean;
}

/** Дефолт: всё включено — поведение игр, не переопределяющих `getViewOptions`. */
export const DEFAULT_VIEW_OPTIONS: GameViewOptions = {
  zoom: true,
  pan: true,
  grid: true,
  playersPanel: true,
  playersStats: false,
};

/** Дополнение системной панели игрока контроллами игры. */
export interface PlayerPanelSchema {
  /** Слоты в строке с именем (например, бонусы). */
  readonly nameRow?: readonly FormNode[];
  /** Нижняя строка; пусто — строки нет. */
  readonly bottomRow?: readonly FormNode[];
}

export abstract class Game {
  /** Идентификатор, стабильный между запусками. */
  abstract readonly id: string;
  /** Название для интерфейса. */
  abstract readonly label: string;

  /** Начальное состояние партии для перечисленных игроков. */
  abstract createInitialState(playerIds: readonly string[]): GameState;

  /**
   * Применить ход. Решение о допустимости полностью на игре.
   * Состояние неизменяемо: игра возвращает новое в `MoveResult.state`.
   */
  abstract applyMove(state: GameState, playerId: string, move: Move): MoveResult;

  /**
   * Выбор хода компьютером. `null` — хода нет.
   * Отдельный метод, а не флаг: задержка и момент вызова — дело `Session`,
   * а сам выбор — дело игры.
   */
  abstract chooseMove(state: GameState, playerId: string): Move | null;

  /** Чей ход следующий. Игра решает это сама. */
  abstract nextPlayer(state: GameState, playerId: string): string | null;

  abstract isFinished(state: GameState): boolean;

  /**
   * Состав демо-партии, которую игра показывает как фоновую. `null` — у игры нет
   * демо. Платформа выбирает случайную игру с непустым составом и создаёт сессию
   * с параметром демо; способ игры (ИИ vs ИИ и т.п.) следует из обычных методов.
   */
  getDemoPlayers(): readonly PlayerInit[] | null {
    return null;
  }

  /**
   * Что игре нужно от камеры поля: зум, панорама, сетка. По умолчанию всё
   * включено (поведение прежних игр). Игра с фиксированным полем выключает лишнее.
   */
  getViewOptions(): GameViewOptions {
    return DEFAULT_VIEW_OPTIONS;
  }

  /**
   * Нарисовать партию. Состояние даёт сессия — игра stateless. Контекст уже
   * настроен под dpr; координаты переводятся через `frame.toScreen`. По
   * умолчанию игра ничего не рисует.
   */
  draw(_state: GameState, _frame: GameRenderFrame): void {
    /* по умолчанию рендера нет */
  }

  /** Схема игровых свойств игрока. По умолчанию игровых свойств нет. */
  getPropertySchema(): PropertySchema {
    return { specs: [] };
  }

  /**
   * Преднастройка игры перед стартом — декларативная схема, а не Vue-компонент:
   * иначе игра впускала бы Vue в ядро. Рендер схемы — дело UI-слоя.
   *
   * `screen` — идентификатор экрана преднастройки: кнопка может открыть другое
   * меню (`Control.navigate`), платформа ведёт историю экранов и просит схему
   * заново. Без аргумента (и для любого экрана по умолчанию) игра отдаёт
   * корневую схему.
   */
  getSetupForm(_screen?: string): FormSchema {
    return { nodes: [] };
  }

  /**
   * Декларативная раскладка зон интерфейса игры (верх/низ/лево/право) — как
   * `getSetupForm`, только для игрового экрана. По умолчанию зон нет.
   */
  getUiLayout(): UiLayoutSchema {
    return { zones: {} };
  }

  /**
   * Дополнительные контроллы в системной панели игрока: слоты в строке с именем
   * и нижняя строка (по умолчанию пустая и высоты не занимает). Игра решает,
   * что показать; сторона (левый/правый) приходит контроллам отдельно.
   */
  getPlayerPanel(): PlayerPanelSchema {
    return {};
  }

  /**
   * Получить окружение. Игра переопределяет метод, чтобы подписаться на сигналы
   * своей формы и звать `launch` / лобби. По умолчанию ничего не делает:
   * игре без преднастройки окружение не нужно.
   */
  attachEnvironment(_environment: GameEnvironment): void {
    /* по умолчанию окружение не используется */
  }

  /**
   * Освободить окружение: игра отписывается от сигналов формы. Симметрично
   * `attachEnvironment`; платформа зовёт метод, когда экран преднастройки
   * снимается, чтобы подписки не остались висеть.
   */
  detachEnvironment(): void {
    /* по умолчанию окружение не использовалось */
  }

  /**
   * Пункты игрового меню, которые игра добавляет к системным. По умолчанию нет.
   * Активацию пункта игра получает в `onGameMenuAction`.
   */
  getGameMenu(): readonly GameMenuItem[] {
    return [];
  }

  /** Игра обрабатывает нажатие своего пункта меню. */
  onGameMenuAction(_id: string): void {
    /* по умолчанию пунктов нет */
  }

  /**
   * Настроить системный диалог выхода. Игра не заменяет диалог: может подменить
   * текст, добавить строку к заголовку и/или кнопку. `null` — без настроек.
   */
  onExitRequested(_request: ExitRequest): ExitCustomization | null {
    return null;
  }

  /**
   * Игра уведомляется о решении выхода: `"exit"` — системная кнопка, иначе —
   * значение дополнительной кнопки, которую игра объявила сама. Предотвратить
   * выход игра не может.
   */
  onExitResolved(_value: string): void {
    /* по умолчанию реакция не нужна */
  }

  /**
   * Превратить состояние партии в переносимые plain-данные (JSON-safe).
   *
   * ВНИМАНИЕ: значение по умолчанию возвращает `state` как есть (identity).
   * Если состояние содержит `Set`, `Map` или иные непереносимые структуры,
   * игра ОБЯЗАНА переопределить метод: иначе `JSON.stringify` молча потеряет
   * данные, а сохранение станет невосстановимым.
   */
  serializeState(state: GameState): unknown {
    return state;
  }

  /**
   * Восстановить состояние из данных, отданных `serializeState`. `null` —
   * данные непригодны (мусор, чужая версия): вызывающий отбрасывает сохранение.
   * По умолчанию принимает непустой объект как `GameState`.
   */
  deserializeState(data: unknown): GameState | null {
    if (typeof data !== "object" || data === null) return null;
    if (Object.keys(data).length === 0) return null;
    return data as GameState;
  }

  /**
   * Сериализовать игровые настройки. По умолчанию настроек нет — `null`.
   * Парные методы `serializeSettings`/`applySettings` — аддитивны: игра,
   * которой настройки не нужны, их не переопределяет.
   */
  serializeSettings(): unknown {
    return null;
  }

  /** Применить настройки, полученные из `serializeSettings`. */
  applySettings(_data: unknown): void {
    /* по умолчанию настроек нет */
  }
}

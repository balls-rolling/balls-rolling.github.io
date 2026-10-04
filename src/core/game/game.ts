import type { FormSchema } from "../form";
import type { PropertySchema } from "../player";
import type { GameEnvironment } from "./environment";
import type { ExitCustomization, ExitRequest, GameMenuItem } from "./menu";
import type { GameState, Move, MoveResult } from "./move";
import type { GameRenderFrame } from "./render";

// Базовый класс игры. Правила и очередь хода принадлежат игре (D3): в бильярде
// после удачного удара игрок ходит снова, и это знает только игра.
//
// Класс не знает ни о Vue, ни об UI, ни о других играх.

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
   */
  getSetupForm(): FormSchema {
    return { nodes: [] };
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
}

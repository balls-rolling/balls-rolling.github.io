# PLAN — Фаза 07: первая игра целиком

**Флаг тестов фазы:** y. **Статус:** выполнен — см. REPORT.md.

Цель: собрать крестики-нолики в работающую игру — рендер на Viewport, Vue-UI игры,
реестр и преднастройка, режим против компьютера. Первый щупабельный релиз.

**Инварианты:** `src/games/**` без `vue`/`@/ui`; `src/core/**` без `@/ui`;
состояние неизменяемо; UI-адаптер дёргает ядро, ядро не знает UI.

## Задачи

- **T1.** Контракт рендера `Game.draw`/`Session.draw`. `src/core/game/render.ts`
  (новый: `GameRenderFrame { ctx; camera; bounds; size; dpr; toScreen; toWorld }` на
  типах `core/viewport`), `src/core/game/game.ts` (базовый `Game.draw(_state,
  _frame): void` — no-op), `src/core/game/index.ts`, `src/core/session/session.ts`
  (`Session.draw(frame)`: `this.#game.draw(this.#gameState, frame)`),
  `src/core/session/index.ts`. tests y.
- **T2.** Токены `--board-x`, `--board-o` в `src/styles/tokens.css` (`:root` и
  `[data-theme="dark"]`), обновить комментарий. tests n.
- **T3.** Рендер крестиков-ноликов `src/games/tic-tac/game.ts` (+`game.test.ts`):
  `lastMove: {x;y}|null` в `TicTacToeState`; `draw` рисует X/O, линию победы,
  последний ход; размеры от `frame.camera.scale`. tests y.
- **T4.** Реестр игры и преднастройка `src/games/tic-tac/index.ts` (новый,
  `GameEntry { id: "tic-tac-toe", label: "Крестики-нолики", entry }`) и `game.ts`:
  `getSetupForm` (группа «Режим» — «С компьютером»; контролл `level` select 0..4),
  `getPropertySchema` (`level`), `attachEnvironment` (подписка на сигналы, запуск
  через окружение/лобби), `detachEnvironment`. tests y.
- **T5.** Сервис `boardInput` и монтирование Viewport: `src/ui/board-input.ts`
  (новый, `createBoardInput()`, `handler: ShallowRef`, ключ `boardInputKey`),
  `src/main.ts`, `src/ui/shell/LayerBoard.vue`. tests n.
- **T6.** Реестр UI игр и монтаж в слой 2: `src/ui/games/registry.ts`,
  `src/ui/games/index.ts` (новые), `src/ui/shell/LayerGameUi.vue`. tests n.
- **T7.** UI игры: `src/ui/games/tic-tac/TicTacToeUi.vue` (новый),
  `src/ui/games/index.ts` — обработчик клика, баннер хода/результата. tests n.
- **T8.** Тесты контрактов: `src/core/session/session.test.ts`,
  `src/games/tic-tac/game.test.ts`. tests y.
- **T9.** Проверка фазы: `npm test`, `npm run typecheck`, `npm run build`, браузер.
  tests y.

## Решения

| # | Решение | Обоснование | Отвергнуто |
| --- | --- | --- | --- |
| 1 | Vue-UI игры в `src/ui/games/`, реестр по id | Тест запрещает `vue` под `games/**` (D1) | Компонент в записи игры |
| 2 | `Session.draw` → `Game.draw(state, frame)` | Состояние у сессии, игра stateless (D2) | Состояние в игре |
| 3 | `boardInput` как сервис-колбэк | Платформа не знает форму хода (D3) | `{x,y}` в платформе |
| 4 | Запуск против компьютера через окружение/лобби | Образец `test-game`; лобби готово (D4) | Отдельный режим «двое» — фаза 09 |
| 5 | Рейтинг не персистим | Не блокирует релиз (D5) | Хранилище сейчас |
| 6 | Конфетти вне фазы | BACKLOG: полировка (D6) | — |

**Цена решения 3:** сервис-колбэк + снятие обработчика на размонтировании (риск
утечки покрываем снятием).

## Проверка фазы

1. `npm test` — новые тесты контрактов + архитектурный тест зелёный.
2. `npm run typecheck` (три проекта), `npm run build`.
3. Браузер: «Меню → Игры → Крестики-нолики → С компьютером»; клик → X; компьютер →
   O; баннер хода; победа 5-в-ряд; игровое меню/выход; консоль пуста.
4. `grep vue` по `src/games/tic-tac` — пусто.

## Вне объёма

Персистентность рейтинга (D5), конфетти/полировка (D6), демо (08), хот-сит (09),
сеть (10).

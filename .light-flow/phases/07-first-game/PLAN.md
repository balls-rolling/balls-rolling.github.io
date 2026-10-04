# PLAN — Фаза 07: первая игра целиком

**Флаг тестов фазы:** y.

Собрать крестики-нолики в работающую игру: рендер на Viewport, Vue-UI игры,
реестр и преднастройка, режим против компьютера. Первый щупабельный релиз.

**Инварианты:** `src/games/**` без `vue`/`@/ui`; `src/core/**` без `@/ui`;
состояние неизменяемо; UI-адаптер дёргает ядро, ядро не знает UI.

---

## Задачи

### T1. Контракт рендера: `Game.draw` / `Session.draw`
**Файлы:** `src/core/game/render.ts` (новый), `src/core/game/game.ts`,
`src/core/game/index.ts`, `src/core/session/session.ts`, `src/core/session/index.ts`.
`GameRenderFrame { ctx; camera; bounds; size; dpr; toScreen; toWorld }` на типах
`core/viewport`. Базовый `Game.draw(_state, _frame): void` — no-op. `Session.draw
(frame): void` зовёт `this.#game.draw(this.#gameState, frame)`; no-op для
idle/finished не нужен (игра сама решает). Экспорт типов.
**tests:** y (Session.draw форвардит; game.draw no-op). **Зависит:** нет.

### T2. Токены фигур
**Файл:** `src/styles/tokens.css`. `--board-x`, `--board-o` в `:root` и в
`[data-theme="dark"]`. Обновить комментарий про фигурные токены.
**tests:** n. **Зависит:** нет.

### T3. Рендер крестиков-ноликов
**Файл:** `src/games/tic-tac/game.ts` (+ `game.test.ts`).
В `TicTacToeState` добавить `lastMove: {x;y} | null`; `applyMove` пишет `lastMove`.
`draw(state, frame)`: для каждого камня — X (две линии) или O (окружность),
победная линия — толще и с маркером, последний ход — точка. Цвета из
`--board-x/--board-o` (читать через `getComputedStyle` один раз на кадр — здесь
кадр редок; допустимо) или передать из UI. Радиус и толщина — от `frame.camera.scale`.
**tests:** y (lastMove в состоянии; glyphs). **Зависит:** T1, T2.

### T4. Реестр игры и преднастройка
**Файл:** `src/games/tic-tac/index.ts` (новый); `src/games/tic-tac/game.ts`.
`index.ts` — `GameEntry { id: "tic-tac-toe", label: "Крестики-нолики", entry }`.
`getSetupForm()`: группа «Режим» — кнопка «С компьютером»; контролл `level` (select
0..4). `getPropertySchema()`: свойство `level`. `attachEnvironment`: подписка на
сигналы — читает `level` из формы, ставит `this.level`, `lobby.defaultPlayers
({humans:1,computers:1})`, `environment.launch`; `detachEnvironment` снимает
подписки (образец `test-game/game.ts:171-207`).
**tests:** y (форма и схема). **Зависит:** нет.

### T5. Сервис `boardInput` и монтирование Viewport
**Файлы:** `src/ui/board-input.ts` (новый), `src/main.ts`,
`src/ui/shell/LayerBoard.vue`.
Сервис: `createBoardInput()` с `handler: ShallowRef<((cell:{x;y})=>void)|null>`,
ключ `boardInputKey`. Provide в `main.ts`. `LayerBoard`: инъекция `sessionHost` и
`boardInput`; `<Viewport :render="renderBoard" @pick="onPick" />`; `renderBoard`
зовёт `sessionHost.session.value?.draw(frame)`; `onPick` зовёт `boardInput.handler`;
`watch` ревизии сессии → `viewportRef.draw()`.
**tests:** n. **Зависит:** T1.

### T6. Реестр UI игр и монтаж в слой 2
**Файлы:** `src/ui/games/registry.ts` (новый), `src/ui/games/index.ts` (новый),
`src/ui/shell/LayerGameUi.vue`.
Реестр «id игры → Vue-компонент» (`markRaw`, `Object.freeze`, фолбэк `null`).
`LayerGameUi`: инъекция `sessionHost`, монтирует компонент игры для
`sessionHost.game.value.id`, если игра есть.
**tests:** n. **Зависит:** T7 (нужен компонент) — фактически после T7.

### T7. UI игры: клик, баннер хода/результата
**Файл:** `src/ui/games/tic-tac/TicTacToeUi.vue` (новый), `src/ui/games/index.ts`.
Инъекции `sessionHost`, `boardInput`. На монтировании ставит обработчик `boardInput`:
если сессия идёт и текущий игрок — локальный человек, `session.makeMove(id, cell)`;
на размонтировании снимает. Реактивно из `session.snapshot()` — баннер: «Ходит
<имя>» / «Победил <имя>». Стиль на токенах/примитивах.
**tests:** n. **Зависит:** T5, T6.

### T8. Тесты новых контрактов
**Файлы:** `src/core/session/session.test.ts`,
`src/games/tic-tac/game.test.ts`.
`Session.draw` форвардит кадр в `game.draw` с актуальным состоянием (фейковая игра
с записью вызова); `TicTacToeGame.draw` не бросает на пустом кадре-заглушке и
рисует после ходов (мок `CanvasRenderingContext2D`); `lastMove` обновляется.
**tests:** y. **Зависит:** T1, T3.

### T9. Проверка фазы
`npm test`, `npm run typecheck`, `npm run build`, браузерная приёмка: запуск
«Крестики-нолики» → «С компьютером», клики ставят X, компьютер отвечает O, баннер
меняется, линия победы видна, победа/поражение фиксируются, игровое меню и выход
работают.
**tests:** y. **Зависит:** T4, T5, T6, T7, T8.

---

## Решения

| # | Решение | Обоснование | Отвергнуто / цена |
| --- | --- | --- | --- |
| 1 | Vue-UI игры в `src/ui/games/`, реестр по id | Тест запрещает `vue` под `games/**` (D1) | Компонент в записи игры — нарушение теста |
| 2 | `Session.draw` → `Game.draw(state, frame)` | Состояние у сессии; игра stateless (D2) | Состояние в игре — ломает immutability |
| 3 | `boardInput` как сервис-колбэк | Платформа не знает форму хода (D3) | `{x,y}` в платформе — протечка |
| 4 | Запуск против компьютера через окружение/лобби | Образец `test-game`; лобби готово (D4) | Отдельный режим «двое» — фаза 09 |
| 5 | Рейтинг не персистим | Не блокирует релиз (D5) | Хранилище сейчас — расширение объёма |
| 6 | Конфетти вне фазы | BACKLOG: полировка (D6) | — |

**Цена решения 3:** сервис-колбэк + снятие обработчика на размонтировании (риск
утечки — покрываем снятием).

---

## Проверка фазы

1. `npm test` — новые тесты контрактов + существующие (архитектурный тест зелёный).
2. `npm run typecheck` (три проекта), `npm run build`.
3. Браузер: путь «Меню → Игры → Крестики-нолики → С компьютером»; клик ставит X;
   компьютер отвечает O; баннер хода; победа 5-в-ряд → баннер результата;
   игровое меню/выход работают; консоль пуста.
4. `grep vue` по `src/games/tic-tac` — пусто.

---

## Вне объёма

Персистентность рейтинга (D5), конфетти/полировка (D6), демо (08), хот-сит (09),
сеть (10). Точный рендер стрелок/превью хода, подсветка наведения — по мере
надобности позже.

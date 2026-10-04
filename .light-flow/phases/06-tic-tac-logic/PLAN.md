# PLAN — Фаза 06: логика крестиков-ноликов + ИИ

**Флаг тестов фазы:** y.

Перенести `rules/engine.js`, `ai/brain.js` и математику `ai/difficulty.js` в
`src/games/tic-tac/` чистым TS без DOM, обернуть в `TicTacToeGame extends Game` и
покрыть портом тестов источника на vitest. Рендер, UI, реестр и персистентность —
вне фазы.

**Инварианты:** `src/games/**` не импортирует `vue`/`@/ui`
(`architecture.test.ts`); состояние неизменяемо (отклонённый ход возвращает ту же
ссылку `state`); адаптер реализует все абстрактные методы `Game`.

---

## Задачи

### T1. `rules.ts` — движок правил (порт `rules/engine.js`)
**Файл:** `src/games/tic-tac/rules.ts` (новый).
`WIN_LENGTH = 5`; `Cell`; `key(x, y)`; `canPlace(sets, x, y)` с приватным
`asList`; `findWin(set, x, y)` с 4 направлениями и линией ≥ 5. Поведение 1:1
`engine.js:1-64`.
**tests:** n. **Зависит:** нет.

### T2. `brain.ts` — мозг ИИ (порт `ai/brain.js`)
**Файл:** `src/games/tic-tac/brain.ts` (новый).
`ERROR_BY_LEVEL = [1, 0.25, 0.15, 0.08, 0.05]`, `RADIUS = 2`; `candidates`,
`scoreCell` (приватные `through`/`dirScore`), `chooseMove(own, opp, level=2,
opts={})` с `winningCells`, ветками «новичок», `missWin`, ошибкой по уровню.
Импорт `key`/`findWin` из `./rules`.
**tests:** n. **Зависит:** T1.

### T3. `difficulty.ts` — чистая математика сложности
**Файл:** `src/games/tic-tac/difficulty.ts` (новый).
`RatingState { rating; games; wins }`, `INITIAL_RATING`, `levelFor(rating)` =
clamp(floor(rating/25),0,4), `applyResult(state, { won, moves })` — чистая
(рост `min(15,max(3,15-moves/2))`, поражение −8, кламп 0..100). Порт математики
`difficulty.js:35-52`; `localStorage` не упоминается (персистентность — фаза 07).
**tests:** n. **Зависит:** нет.

### T4. `game.ts` — адаптер `TicTacToeGame extends Game`
**Файл:** `src/games/tic-tac/game.ts` (новый).
`TicTacToeState`: `order`, `sets`, `glyphs`, `total`, `finished`, `winnerId`.
`TicTacToeGame`: `id`/`label`; поля `level=2`, `missWin=false`;
`createInitialState` (пустые наборы, глифы X/O по порядку);
`applyMove` (отклоняет нечисловые координаты, незнакомого игрока, завершённую
партию, занятую клетку; иначе новый `sets` + `findWin` → `finished`/`winnerId`);
`chooseMove` (`null` при завершении; `own`/`opp` → `brain.chooseMove`);
`nextPlayer` (по кругу, `null` при завершении/ненайденном); `isFinished`.
Импорты только `@/core/game` и локальные `./rules`, `./brain`.
**tests:** n. **Зависит:** T1, T2.

### T5. `rules.test.ts` — порт `test/rules.test.js`
**Файл:** `src/games/tic-tac/rules.test.ts` (новый). Все проверки
`rules.test.js:11-32` в `describe`/`it`.
**tests:** y. **Зависит:** T1.

### T6. `brain.test.ts` — порт `test/ai.test.js` (без рейтинга)
**Файл:** `src/games/tic-tac/brain.test.ts` (новый). Берёт победу, блокирует 4,
`missWin` (20 итераций), кандидаты, `scoreCell > 0`.
**tests:** y. **Зависит:** T2.

### T7. `difficulty.test.ts` — порт математики рейтинга
**Файл:** `src/games/tic-tac/difficulty.test.ts` (новый). `levelFor`, рост/спад,
вес быстрой победы, клампы 0/100, счётчики; вызовы от переданного состояния.
**tests:** y. **Зависит:** T3.

### T8. `game.test.ts` — адаптер через контракт `Game`
**Файл:** `src/games/tic-tac/game.test.ts` (новый). Начальное состояние; партия
5-в-ряд через `applyMove`; чередование `nextPlayer`; отказ на занятой клетке без
мутации; `chooseMove` берёт победу / `missWin` пропускает.
**tests:** y. **Зависит:** T4.

### T9. Прогон проверок фазы
`npm test` (включая архитектурный тест) и `npm run typecheck`; устранить ошибки.
**tests:** y. **Зависит:** T5, T6, T7, T8.

---

## Решения

| # | Решение | Обоснование | Отвергнуто / цена |
| --- | --- | --- | --- |
| 1 | Порт `rules.ts` 1:1 | Источник проверен (D1) | «Переписать чище» — риск регрессий |
| 2 | Порт `brain.ts` 1:1 с `missWin` | Демо (08) опирается на `missWin` (D2) | Замена ИИ — нет причины |
| 3 | `applyResult` — чистая функция с явным состоянием | Хранилище — фаза 07, математика тестируется в node (D3) | `localStorage` в логике — дубль фолбэка |
| 4 | `Set<string>` в состоянии игры | Правила работают на ключах Set | Массивы координат — лишние преобразования |
| 5 | `level`/`missWin` — поля `TicTacToeGame` | `chooseMove(state, playerId)` не видит `Player` (D4) | Уровень в `Session` — утечка в ядро |
| 6 | `applyMove` отклоняет ходы после конца и для незнакомого игрока | Неизменяемость и предсказуемость | Молча принимать — потеря ошибок |
| 7 | Тесты — порт источника | `test/rules.test.js`, `test/ai.test.js` уже есть (D5) | Писать с нуля — дублирование |
| 8 | Без `index.ts`/`getSetupForm`/`getPropertySchema` | Реестр, форма, свойства — фаза 07 (D6) | Ранняя регистрация — расширение объёма |

**Цена решения 3:** потребитель `applyResult` (фаза 07) сам хранит `RatingState`.

---

## Проверка фазы

1. `npm test` — зелёные новые тесты и `architecture.test.ts` (в `src/games/` нет
   `vue`/`@/ui`).
2. `npm run typecheck` — без ошибок.
3. Ручная сверка: `TicTacToeGame` проводит партию 5-в-ряд только через методы
   `Game`, без DOM.
4. `chooseMove` берёт победу/блок; `missWin` пропускает.
5. `difficulty.ts` не содержит `localStorage`/`window` (grep).

---

## Вне объёма

- `Game.render`, рисование фигур, `Viewport` — фаза 07.
- Vue-UI, баннер хода, конфетти, игровое меню — фаза 07.
- Запись в реестр, `src/games/tic-tac/index.ts`, форма преднастройки,
  `attachEnvironment`, лобби — фаза 07.
- Персистентность рейтинга, `getPropertySchema` с рейтингом/уровнем — фаза 07.
- Демо (08), хот-сит (09), сеть (10).

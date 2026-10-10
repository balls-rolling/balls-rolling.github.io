# PLAN — Фаза 02 «Ядро: стол, шары, лузы + схематический тест-рендер»

**Тесты фазы: y.** Геометрия, раскладка, состояние, раунд-трип и pure-часть
рендера тестируются в `node` (vitest). Рендер-картинка проверяется визуально.
Новых npm-зависимостей нет. Платформенный код не трогаем.

**Цель:** бильярд доступен карточкой в меню платформы и рисует схему стола с
шарами и лузами; ядро геометрии чистое и покрыто тестами.

## Задачи (в порядке исполнения)

**T1. Константы (мм) и палитра шаров.** `src/games/billiards/constants.ts` +
`constants.test.ts`. Единый источник: стол 2540×1270, шар 57.15/0.163,
рейка 101.6/подушка 50.8/высота 36.3, лузы угловая 127/боковая 139.7,
облицовки 142°/104°, пятна 0.25/0.5/0.75·L; `BallColorSpec`/`BALL_COLORS`
(16 hex), цвета сцены (сукно/борт/луза/разметка), `DEFAULT_SEED`. Готово: тест
доказывает `L===2W`, `W/D≈22.2`, `SIDE>CORNER` рты, 16 валидных цветов.
Зависит: нет. tests: y.

**T2. Геометрия стола и луз.** `geometry.ts` + `geometry.test.ts`. Координаты в
мм, начало — угол поля, `x` вдоль длины, `y` вдоль ширины. Типы `Point`,
`Segment`, `PocketSpec`; `buildTableGeometry`, луза-выемка (нос/две облицовки/
задняя кромка, линия рта + `capturePad=BALL_R` как данные), `tableSegments()`
— ровно 24 (6 носов + 12 облицовок + 6 задних), `spots()`, `railSights()`.
Готово: тест — 6 луз (4 угловые id 0–3, 2 боковые id 4–5), 24 отрезка, рты
равны константам, пятна на 0.25/0.5/0.75·L, точки в контуре. Зависит: T1.
Параллельно T3. tests: y.

**T3. Определения шаров.** `balls.ts` + `balls.test.ts`. `BallKind`, `BallDef`,
`BALLS` (16), `isSolid/isStripe/colorOf`. Готово: id 0 — cue, 1–7 solid,
8 — eight чёрный, 9–15 stripe; радиус/масса из констант; цвета различны.
Зависит: T1. Параллельно T2. tests: y.

**T4. Детерминированная раскладка.** `rack.ts` + `rack.test.ts`. `mulberry32`
(без `Math.random`), `rackPlacements(seed)`: биток на головном пятне, треугольник
вершиной на подставке, 8-й в центре 3-го ряда, задние углы — solid+stripe по
seed, остальное Fisher–Yates. Готово: один seed → одна раскладка; 16 шаров;
позиции битка/вершины точны; нет пересечений; всё в поле. Зависит: T1, T2, T3.
tests: y.

**T5. Состояние и сериализация.** `state.ts` + `state.test.ts`.
`BallState{id,x,y,vx,vy,spin{x,y,z},active}` (спин закладываем сразу, R3),
`BilliardsState{version:1,seed,order,turn,balls,finished}`,
`createInitialState(playerIds, seed)`, чистые `serializeBilliardsState` /
`deserializeBilliardsState` со строгой валидацией (version, типы, ровно 16 шаров,
id 0–15, конечные числа); мусор → `null`. Готово: JSON-раунд-трип структурно
равен; один seed детерминирован; валидатор отбрасывает чужое. Зависит: T1–T4.
tests: y.

**T6. Схематический рендер.** `render.ts` + `render.test.ts`. Pure
`computeFit(size, padding, outerW, outerH)` (fit-contain, центрирование); 
`drawBilliards(state, frame)`: заливает весь canvas сукном (скрывая платформенную
сетку/фон), своим transform рисует рейку, сукно, 6 луз, 24 отрезка, пятна и 16
шаров (сплошной/полосатый/биток). `frame.camera`/`toScreen` не используются.
Готово: тест `computeFit` (аспект сохранён, влезает с отступами при разных
`size`); файл не импортирует Vue/DOM кроме типа `CanvasRenderingContext2D`
(проверяет `architecture.test.ts`). Зависит: T2, T3, T5. tests: y.

**T7. `BilliardsGame` + самозапуск.** `game.ts` + `game.test.ts`.
`class BilliardsGame extends Game`: `id="billiards"`, `label="Бильярд"`;
`createInitialState` → state; `applyMove` — пока всегда отклонён (нет физики);
`chooseMove` → `null`; `nextPlayer` — по `order`; `isFinished` → `state.finished`;
`serializeState`/`deserializeState` → в state; `draw` → `drawBilliards`;
`attachEnvironment` — самозапуск `launch(await lobby.defaultPlayers({humans:1}))`
под guard; `detachEnvironment` — no-op. Готово: тесты id/label, 16 шаров,
round-trip, отклонённый ход не мутирует, `attachEnvironment` с фейковым окружением
зовёт `defaultPlayers`+`launch`. Зависит: T5, T6. tests: y.

**T8. Точка входа и регистрация.** `index.ts` + `index.test.ts`.
`default GameEntry = {id:"billiards", label:"Бильярд", entry: () => Promise.resolve(new BilliardsGame())}`.
Готово: default-экспорт валиден, `await entry()` даёт `BilliardsGame`; ядро/реестр
не правились. Зависит: T7. tests: y.

**T9. Сквозная проверка фазы.** Без новых файлов. `npm test`, `npm run typecheck`,
`npm run build`; `architecture.test.ts` зелёный; открыть бильярд из меню —
карточка есть, схема рисуется (стол 2:1, 6 луз, 16 шаров, без платформенной
сетки). Визуальная проверка — скриншот/осмотр; если не удаётся — зафиксировать
как непроверенное. Зависит: T8. tests: n.

## Порядок и параллельность

T1 → (T2 ‖ T3) → T4 → T5 → T6 → T7 → T8 → T9. Критический путь:
T1→T2→T4→T5→T6→T7→T8→T9; ветка T3 параллельна T2.

## Затрагиваемые файлы

- `src/games/billiards/constants.ts`, `geometry.ts`, `balls.ts`, `rack.ts`,
  `state.ts`, `render.ts`, `game.ts`, `index.ts` (новые)
- тесты рядом (`*.test.ts`)

Платформенный код (`src/core/**`, `src/ui/**`) не трогаем.

## Решения

| # | Решение | Почему / откуда |
| --- | --- | --- |
| 1 | **Платформу не трогаем.** Схема сама считает fit из `frame.size` и рисует в мм своим transform; камеру/`toScreen` не использует | `LayerBoard` не пробрасывает `initialCamera`/`showGrid`, камера клампится `[24,120]`, fit-contain нет — 2540 мм в кадр не впишутся (`camera.ts:7-25`, `LayerBoard.vue:52-58`) |
| 2 | Сами закрашиваем фон | `Viewport` рисует `bg` + сетку до `render(frame)` (`Viewport.vue:104-139`); заливка сукном их скрывает |
| 3 | UI-компонент не нужен | Рендер через `Game.draw`; `LayerGameUi` без компонента пуст (`src/ui/games/registry.ts:9-15`) |
| 4 | Цвета — hex-константы ядра | Токенов шаров/сукна нет (`tokens.css` — только `--board-bg/grid/x/o`); DOM в ядро не тащим (E7) |
| 5 | Начало координат — угол поля | Формулы `0.25·L/0.5·W` читаются буквально; центрирование — забота рендера |
| 6 | PRNG `mulberry32`, seed — параметр | Детерминизм без `Math.random` (R3); источник seed — позже |
| 7 | Свой формат сериализации v1 | Identity-default платформы не годится; round-trip обязателен (чек-лист §11) |
| 8 | Самозапуск в `attachEnvironment` | Иначе `SetupScreen` пуст и `launch` никто не вызовет (`src/ui/environment.ts:32-55`) |
| 9 | Чистоту стережёт существующий `architecture.test.ts` | Отдельный тест не нужен |

## Вне объёма

Физика и захват луз (фаза 03), правила режимов (06–07), ввод/UI партии (04),
«рюшечки» (05), сеть (09), UI-компонент игры, правки платформы.

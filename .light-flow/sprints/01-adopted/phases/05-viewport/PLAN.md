# PLAN — Фаза 05: `Viewport`

**Флаг тестов: y** (чистая камера — `camera.test.ts`; компонент вручную).
**Цель:** дать платформе переиспользуемый canvas-компонент поля «бесконечное поле»: камера (центр + масштаб), панорама, зум (колесо и кнопки), `devicePixelRatio`, отсечение видимых клеток, world↔screen, ввод с `pick` и отладочный HUD. Математика камеры — чистая в `src/core/viewport/` без DOM, тесты в `node`; `src/ui/viewport/Viewport.vue` монтируется в `LayerBoard` (слой 1). Содержимое игры — колбэком; в фазе только сетка и HUD, без игровой логики и изменений `Game`. Новых npm-зависимостей нет.
**Граница принципов:** `core/viewport/*` не импортирует `vue`/`@/ui` (`architecture.test.ts:82-105`) и не трогает `document`/`window`; canvas/DOM-типы — только в `ui/viewport/*`.

## Задачи

- **T1 Математика камеры.** Создаёт `src/core/viewport/types.ts`, `camera.ts`, `index.ts`. `Camera{x;y;scale}` (центр в мировых клетках, `scale` px/клетка), `Point`, `Size`, `CellBounds{x0;x1;y0;y1}`; константы `BASE_CELL=48`, `MIN_SCALE=BASE_CELL*0.5`, `MAX_SCALE=BASE_CELL*2.5`, `DEFAULT_CAMERA={0,0,48}`, `ZOOM_STEP=1.2`, `WHEEL_STEP=1.1`, `PICK_THRESHOLD=5`; функции `clampScale`, `panByPixels` (`x-dx/scale`, знак как `tic-board.js:63`), `screenToWorld`, `worldToScreen`, `zoomTo` (точка под курсором неизменна, `tic-board.js:87-95`), `zoomBy`, `visibleBounds` (floor/ceil как `tic-board.js:118-119`). Все чистые, возвращают новый объект. tests:n. Зависит: нет. Параллельно с T3, T4.
- **T2 Тесты камеры.** Создаёт `src/core/viewport/camera.test.ts`; кейсы: `clampScale`, `panByPixels`, обратимость `screenToWorld`/`worldToScreen`, `zoomTo` (якорь + зажим), `visibleBounds` (margin, масштаб), `DEFAULT_CAMERA`. DOM не используется. tests:y. Зависит T1.
- **T3 Токены поля.** Изменяет `src/styles/tokens.css`: `--board-bg: var(--bg)`, `--board-grid: color-mix(in oklch, var(--fg) 16%, transparent)`; dark override 22%; обновить шапку (строки 3-4 утверждают, что `--board-*` не переносятся). tests:n. Параллельно с T1, T4.
- **T4 Иконки зума и HUD.** Изменяет `src/ui/icons/registry.ts`: `Bug`, `ZoomIn`, `ZoomOut`; `"zoom-in"`, `"zoom-out"`, `hud` (`markRaw`). Новых зависимостей нет. tests:n. Параллельно с T1, T3.
- **T5 `Viewport.vue`: каркас canvas, dpr, тема, сетка, колбэк.** Создаёт `src/ui/viewport/types.ts` (`ViewportFrame{ctx;camera;bounds;size;dpr;toScreen;toWorld}`, `ViewportRenderer`), `Viewport.vue`. Пропсы `render?`, `showGrid=true`, `blocked=false`, `initialCamera?`; emit `pick`; `defineExpose({camera,resetCamera,zoomIn,zoomOut,toggleHud,draw})`. `draw()`: dpr × canvas, `setTransform(dpr,…)`, заливка `--board-bg`, сетка по `visibleBounds` с `worldToScreen`, затем `props.render?.(frame)`; трансформация камеры в контекст НЕ вжигается. dpr — `devicePixelRatio||1`, переподписка через `matchMedia("(resolution: <dpr>dppx)")`. Тема — `readColors()` через `getComputedStyle(document.documentElement)` + `MutationObserver` на `data-theme`. `ResizeObserver`; перерисовка в `requestAnimationFrame` (один pending id, отмена). Все наблюдатели/rAF снимаются. tests:n. Зависит T1, T3. Параллельно T4.
- **T6 `Viewport.vue`: ввод.** Тот же файл. `pointerdown` (`button===0`, `setPointerCapture`, снимок `{sx,sy,camera,moved:0}`); `pointermove` (`moved=max(moved,hypot)`); `pointerup` (`wasDrag=moved>PICK_THRESHOLD`, при `!wasDrag && !blocked` → `floor(screenToWorld)` → `emit("pick")`); `pointercancel`; `wheel {passive:false}` → `zoomBy` к курсору; `toCanvasPoint` через `getBoundingClientRect()`. `blocked` глушит только `pick` (D4). Порт `tic-board.js:53-101`. tests:n. Зависит T5.
- **T7 `Viewport.vue`: HUD и кнопки зума.** Тот же файл. Правый-низ `zoom-out`/`zoom-in` (`iconFor`, `aria-label`, зум к центру `ZOOM_STEP`); HUD (`hudVisible=true`, кнопка `iconFor("hud")`): `x`,`y`,`scale`,`dpr`,размер; `pointer-events:none` на тексте; `toggleHud()` в `defineExpose`. tests:n. Зависит T6, T4.
- **T8 Публичный API и монтаж.** Создаёт `src/ui/viewport/index.ts`; изменяет `src/ui/shell/LayerBoard.vue`, `layers.css`: `.layer-board{z-index:0;padding:0;align-items:stretch;}` (снимает вжатие канваса от `.layer`, layers.css:9-14). tests:n. Зависит T7.
- **T9 Проверка фазы.** Ничего не меняет: `npm test`, typecheck, build, ручной чек-лист `npm run dev`; результат в `REPORT.md`. tests:y. Зависит T2, T8.

## Решения

| # | Решение | Обоснование / отвергнуто | Цена |
| --- | --- | --- | --- |
| 1 | Камера — чистый `core/viewport` + тонкий `Viewport.vue` (D1) | Геометрия ловится тестами в `node`; отвергнуто: логика в Vue | Двойная граница core/UI |
| 2 | Модель `{x,y,scale}` — порт `tic-board.js` (D2) | Проверенное решение; отвергнуто: матричная проекция | Наследуем формулы источника |
| 3 | Дефолт `{x:0,y:0}` вместо источника `{0.5,0.5}` | Ноль в центре нейтральнее; игры задают `initialCamera` | Отличие на полклетки, зафиксировано |
| 4 | Контракт рендера — колбэк с `ctx`,`camera`,`bounds`,`toScreen`/`toWorld` (D3) | Платформа не знает фигур; отвергнуто: Viewport рисует фигуры / игра владеет canvas | Публичный тип рамки |
| 5 | `blocked` глушит только `pick`, не панораму/зум (D4) | Как `tic-board.js:70` | Мелкая асимметрия |
| 6 | Цвета при монтировании + `MutationObserver` на `data-theme` (D8) | Палитра только ставит атрибут (`palette.ts:48`), события нет; отвергнуто: `getComputedStyle` каждый кадр (BACKLOG) | Свой наблюдатель |
| 7 | Перерисовка батчится в `rAF`, dpr — `matchMedia` | Меньше кадров, корректная смена dpr | Задержка кадра |
| 8 | Зависимостей не добавляем | Принцип 2: нативные API покрывают всё; panzoom правит DOM-трансформы | Edge-case (wheel, dpr, pointer capture) на нас |
| 9 | `pick` отдаёт `floor` мировых координат | Как `tic-board.js:72` | Округление к отрицательным — floor |
| 10 | Компонент без unit-тестов (тесты фазы — `camera.ts`) | Нет `@vue/test-utils`/DOM; тесты по конвенции в `node` | Ввод/dpr/HUD вручную |
| 11 | `.layer-board` обнуляет padding/выравнивание | `.layer` вжал бы канвас; поле — фуллскрин | Слой теряет safe-area padding |
| 12 | HUD камеры — в `Viewport`, не в `test-game` (D6) | Отладка поля — общий инструмент платформы | Уточнение к D10 фазы 02 |

## Проверка фазы

1. `npm test` — `camera.test.ts`, `architecture.test.ts`, `smoke.test.ts` зелёные.
2. `npm run typecheck` — три проекта без ошибок.
3. `npm run build` — успешная сборка.
4. `npm run dev` чек-лист: сетка на весь экран без вжатия; drag панорамирует, резкий drag (moved > 5px) не даёт `pick`; одиночный клик — `pick` с целочисленной клеткой; колесо зумит к курсору; кнопки ± к центру, масштаб в `[24,120]`; HUD (`x,y,scale,dpr,размер`) и скрытие; смена темы перекрашивает без перезагрузки; при смене dpr чёткость.
5. `git status` без изменений `Game`, `Session`, `games/*`.

Непроверяемое автоматически (п. 4) — в `REPORT.md`.

## Вне объёма

Логика крестиков-ноликов и ИИ (06); рендер фигур, игровое меню, баннер (07); фоновое демо (08); хот-сит, сеть, `Transport`, лобби (09–10); тач-жесты/пинч/инерция/клавиатурный зум/мини-карта/fit/сброс; `--board-x/o`; новые зависимости.

# PLAN — Фаза 05: `Viewport`

## Цель фазы

Дать платформе переиспользуемый canvas-компонент поля «бесконечное поле»: камера
(центр + масштаб), панорама, зум (колесо и кнопки), учёт `devicePixelRatio`,
отсечение видимых клеток, world↔screen, ввод с `pick` и отладочный HUD. Математика
камеры — чистая, в `src/core/viewport/` без DOM, с тестами в окружении `node`.
Компонент `src/ui/viewport/Viewport.vue` монтируется в `LayerBoard` (слой 1).
Содержимое игры приходит колбэком; в этой фазе — только сетка и HUD, без игровой
логики и без изменений `Game`.

**Флаг тестов фазы: `y`** (чистая камера покрыта `camera.test.ts`; компонент
вручную проверяется в браузере, см. «Проверка фазы»).

**Граница соблюдения принципов:** `core/viewport/*` не импортирует `vue` и `@/ui`
(architecture.test.ts:82-105) и не трогает `document`/`window`; canvas/DOM-типы
живут только в `ui/viewport/*`. Новых npm-зависимостей нет.

---

## Задачи (порядок исполнения)

### T1. Чистая математика камеры
- **Создаёт:** `src/core/viewport/types.ts`, `src/core/viewport/camera.ts`,
  `src/core/viewport/index.ts`.
- **Состав:**
  - `types.ts` — `Camera { x; y; scale }` (центр окна в мировых клетках, `scale` —
    размер клетки в px), `Point`, `Size`, `CellBounds { x0; x1; y0; y1 }`. Только
    данные, без DOM-типов.
  - `camera.ts` — константы `BASE_CELL = 48`, `MIN_SCALE = BASE_CELL * 0.5`,
    `MAX_SCALE = BASE_CELL * 2.5`, `DEFAULT_CAMERA = { x: 0, y: 0, scale: BASE_CELL }`,
    `ZOOM_STEP = 1.2`, `WHEEL_STEP = 1.1`, `PICK_THRESHOLD = 5`; функции
    `clampScale(scale): number`, `panByPixels(camera, dx, dy): Camera`
    (`x - dx / scale`, знак как в источнике `tic-board.js:63`),
    `screenToWorld(camera, point, size): Point`,
    `worldToScreen(camera, point, size): Point`,
    `zoomTo(camera, anchor, size, nextScale): Camera` (точка под курсором
    неизменна, `tic-board.js:87-95`), `zoomBy(camera, anchor, size, factor)`,
    `visibleBounds(camera, size, margin = 1): CellBounds` (floor/ceil как
    `tic-board.js:118-119`). Все функции — чистые, возвращают новый объект.
  - `index.ts` — публичный API по образцу `core/theme/index.ts`.
- **Done:** модуль компилируется, экспортирует перечисленные функции/типы, не
  содержит обращений к DOM в рантайме.
- **tests:** n. **Зависит:** нет. **Параллельно:** с T3, T4.

### T2. Тесты камеры (node)
- **Создаёт:** `src/core/viewport/camera.test.ts`.
- **Состав:** шапка `import { describe, expect, it } from "vitest"`; кейсы:
  `clampScale` зажимает в `[MIN_SCALE, MAX_SCALE]`; `panByPixels` сдвигает центр
  противоположно пиксельной дельте; `screenToWorld`/`worldToScreen` взаимно
  обратны; `zoomTo` сохраняет мирную точку под якорем и зажимает масштаб;
  `visibleBounds` шире окна на `margin` и сужается/расширяется при смене масштаба;
  `DEFAULT_CAMERA` валиден. DOM не используется.
- **Done:** `npx vitest run src/core/viewport/camera.test.ts` — зелёный.
- **tests:** y. **Зависит:** T1.

### T3. Токены поля
- **Изменяет:** `src/styles/tokens.css`.
- **Состав:** в `:root` добавить `--board-bg: var(--bg)` и
  `--board-grid: color-mix(in oklch, var(--fg) 16%, transparent)`; в
  `:root[data-theme="dark"]` — парный override с более плотной сеткой (22%).
  Обновить шапку файла (строки 3-4 утверждают, что токены `--board-*` не
  переносятся — это перестало быть правдой).
- **Done:** токены объявлены в обеих темах, комментарий не противоречит коду.
- **tests:** n. **Зависит:** нет. **Параллельно:** с T1, T4.

### T4. Иконки зума и HUD
- **Изменяет:** `src/ui/icons/registry.ts`.
- **Состав:** добавить в импорт из `@lucide/vue` — `Bug`, `ZoomIn`, `ZoomOut`; в
  замороженный реестр — `"zoom-in": markRaw(ZoomIn)`, `"zoom-out": markRaw(ZoomOut)`,
  `hud: markRaw(Bug)`. Новых зависимостей нет.
- **Done:** `iconFor("zoom-in" | "zoom-out" | "hud")` возвращает компоненты,
  неизвестный токен по-прежнему `null`.
- **tests:** n. **Зависит:** нет. **Параллельно:** с T1, T3.

### T5. `Viewport.vue`: каркас canvas, dpr, тема, сетка, колбэк
- **Создаёт:** `src/ui/viewport/types.ts`, `src/ui/viewport/Viewport.vue`.
- **Состав:**
  - `types.ts` — `ViewportFrame { ctx: CanvasRenderingContext2D; camera; bounds;
    size; dpr; toScreen(point); toWorld(point) }`,
    `ViewportRenderer = (frame: ViewportFrame) => void`. Импортирует типы из
    `@/core/viewport` (DOM-тип `CanvasRenderingContext2D` разрешён, `lib DOM`).
  - Пропсы: `render?: ViewportRenderer`, `showGrid = true`, `blocked = false`,
    `initialCamera?: Camera`; emit `pick: [{ x; y }]`; `defineExpose({ camera,
    resetCamera, zoomIn, zoomOut, toggleHud, draw })`.
  - Разметка: контейнер `.viewport` (position relative, 100%×100%), `<canvas>`
    (display block, 100%×100%, `touch-action: none`).
  - `draw()`: размеры из `clientWidth/Height`; `canvas.width/height` × dpr;
    `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`; заливка `--board-bg`; сетка по
    `visibleBounds` с `worldToScreen`; затем `props.render?.(frame)`. Трансформация
    камеры в контекст НЕ вжигается: рамка отдаёт `toScreen`/`toWorld`, рендер
    рисует в CSS-px (как источник `tic-board.js:120-121`).
  - dpr: читается через `devicePixelRatio || 1`; переподписка через
    `matchMedia("(resolution: <dpr>dppx)")` + `change`.
  - Тема: `readColors()` через `getComputedStyle(document.documentElement)` при
    монтировании; `MutationObserver` на `document.documentElement` с фильтром
    `attributes: ["data-theme"]` → перечитать и перерисовать.
  - `ResizeObserver` на контейнер; перерисовка объединяется в `requestAnimationFrame`
    (один pending id, отмена на размонтировании). Все наблюдатели и rAF снимаются.
- **Done:** при `npm run dev` в слое поля видна заливка и бесконечная сетка,
  масштабируемая после T6/T7; смена темы перекрашивает сетку; смена dpr
  пересчитывает канвас.
- **tests:** n. **Зависит:** T1, T3. **Параллельно:** T4.

### T6. `Viewport.vue`: ввод — панорама, зум колесом, `pick`
- **Изменяет:** `src/ui/viewport/Viewport.vue` (тот же файл, продолжение T5).
- **Состав:** обработчики на canvas:
  - `pointerdown` (только `button === 0`): `setPointerCapture`, снимок
    `{ sx, sy, camera, moved: 0 }`.
  - `pointermove`: `moved = max(moved, hypot(dx, dy))`, камера через
    `panByPixels` от снимка, `scheduleDraw()`.
  - `pointerup`: `wasDrag = moved > PICK_THRESHOLD`; release capture;
    `if (!wasDrag && !props.blocked)` → координата ячейки
    `floor(screenToWorld(...))`, `emit("pick", …)`.
  - `pointercancel` — сброс drag.
  - `wheel` с `{ passive: false }`: `preventDefault`, `zoomBy(…, deltaY < 0 ?
    WHEEL_STEP : 1/WHEEL_STEP)` к курсору, `scheduleDraw()`.
  - Вспомогательная `toCanvasPoint(event)` через `getBoundingClientRect()`.
  - `blocked` глушит только `pick`, панорама и зум работают (D4).
- **Done:** поле таскается мышью, колесо зумит к курсору, одиночный клик даёт
  событие `pick` с координатами клетки; drag не порождает `pick`.
- **tests:** n. **Зависит:** T5 (последовательный — тот же файл).

### T7. `Viewport.vue`: HUD и кнопки зума
- **Изменяет:** `src/ui/viewport/Viewport.vue` (тот же файл, продолжение T6).
- **Состав:** оверлеи поверх канваса:
  - Правый-низ: кнопки `zoom-out` / `zoom-in` (`iconFor`, `aria-label`,
    `@click` → зум к центру окна с `ZOOM_STEP`).
  - HUD (`hudVisible`, по умолчанию `true`, кнопка с `iconFor("hud")`):
    `x`, `y`, `scale`, `dpr`, размер окна; `pointer-events: none` на тексте,
    `auto` на кнопке. Значения читаются из `camera`/`size`/`dpr` реактивно.
  - `toggleHud()` в `defineExpose`.
- **Done:** видны камера, масштаб, dpr и размер; кнопки ± зумят к центру; HUD
  скрывается/показывается.
- **tests:** n. **Зависит:** T6 (последовательный), T4.

### T8. Публичный API Viewport и монтаж в слой поля
- **Создаёт:** `src/ui/viewport/index.ts`.
- **Изменяет:** `src/ui/shell/LayerBoard.vue`, `src/ui/shell/layers.css`.
- **Состав:**
  - `index.ts`: `export { default as Viewport } from "./Viewport.vue";`
    `export type { ViewportFrame, ViewportRenderer } from "./types";` (по образцу
    `ui/icons/index.ts`).
  - `LayerBoard.vue`: импорт `Viewport`, разметка
    `<section class="layer layer-board"><Viewport /><slot /></section>`; обновить
    комментарий (сейчас «Канвас Viewport появится в фазе 06»).
  - `layers.css`: для `.layer-board` обнулить padding и выровнять по высоте —
    `.layer-board { z-index: 0; padding: 0; align-items: stretch; }`. Это снимает
    вжатие канваса от `.layer` (layers.css:9-14); остальные слои padding сохраняют.
- **Done:** `LayerBoard` рендерит `Viewport` на весь слой, канвас занимает весь
  экран без отступов; архитектурный тест зелёный (UI импортирует core — разрешено).
- **tests:** n. **Зависит:** T7.

### T9. Проверка фазы
- **Изменяет:** ничего (только прогон).
- **Состав:** `npm test`, `npm run typecheck`, `npm run build`, ручная проверка
  `npm run dev` по чек-листу «Проверка фазы».
- **Done:** все команды успешны; чек-лист пройден, результат записан в `REPORT.md`.
- **tests:** y. **Зависит:** T2, T8.

---

## Решения

| # | Решение | Обоснование / отвергнутая альтернатива | Цена |
| --- | --- | --- | --- |
| 1 | Камера — чистый модуль `core/viewport` + тонкий `Viewport.vue` (D1) | Геометрия ловится тестами в `node`; отклонено: логика внутри Vue — нечем проверить без DOM | Двойная граница core/UI |
| 2 | Модель `{x, y, scale}` — порт `tic-board.js` (D2) | Проверенное решение источника; отклонено: матричная проекция — избыточна для 2D | Наследуем формулы источника |
| 3 | Дефолт камеры `{x: 0, y: 0}` вместо источника `{0.5, 0.5}` | Для бесконечного поля ноль в центре нейтральнее; игры задают `initialCamera` | Отличие от источника на полклетки, зафиксировано |
| 4 | Контракт рендера — колбэк с `ctx`, `camera`, `bounds`, `toScreen`/`toWorld` (D3) | Платформа не знает фигур; отклонено: Viewport рисует фигуры / игра владеет canvas | Публичный тип рамки |
| 5 | `blocked` глушит только `pick`, не панораму/зум (D4) | Как в источнике (`tic-board.js:70`); отклонено: блокировать весь ввод | Мелкая асимметрия |
| 6 | Цвета при монтировании + `MutationObserver` на `data-theme` (D8) | Палитра только ставит атрибут (`palette.ts:48`), события нет; отклонено: `getComputedStyle` каждый кадр (BACKLOG) | Свой наблюдатель |
| 7 | Перерисовка батчится в `rAF`, dpr — через `matchMedia` | Меньше кадров, корректная смена dpr; отклонено: рисовать на каждое событие | Задержка кадра |
| 8 | Зависимостей не добавляем | Принцип 2: нативные `ResizeObserver`/`MutationObserver`/`matchMedia`/Pointer Events/`rAF` покрывают всё; panzoom правит DOM-трансформы, не наш случай | Edge-case (wheel, dpr, pointer capture) на нас |
| 9 | `pick` отдаёт `floor` мировых координат | Как в источнике (`tic-board.js:72`), потребителю нужны индексы клеток | Округление к отрицательным — `floor` |
| 10 | Компонент не покрыт unit-тестами (тесты фазы — `camera.ts`) | Нет `@vue/test-utils` и DOM-окружения; тесты по конвенции идут в `node` | Ввод/dpr/HUD — вручную |
| 11 | `.layer-board` обнуляет padding/выравнивание | `.layer` вжал бы канвас; поле — фуллскрин по определению | Слой поля теряет safe-area padding |
| 12 | HUD камеры — в `Viewport`, а не в `test-game` (D6) | Отладка поля — общий инструмент платформы | Уточнение к D10 фазы 02 |

---

## Проверка фазы

1. `npm test` — `camera.test.ts`, `architecture.test.ts`, `smoke.test.ts` зелёные.
2. `npm run typecheck` — все три проекта без ошибок.
3. `npm run build` — успешная сборка.
4. `npm run dev` — ручной чек-лист:
   - [ ] в слое поля — бесконечная сетка на весь экран, без вжатия и отступов;
   - [ ] drag панорамирует; резкий drag (moved > 5px) не вызывает `pick`;
   - [ ] одиночный клик даёт `pick` с целочисленной клеткой;
   - [ ] колесо зумит к курсору, точка под курсором не «уезжает»;
   - [ ] кнопки `+`/`−` зумят к центру, масштаб зажат в `[24, 120]` px;
   - [ ] HUD показывает `x, y, scale, dpr, размер` и скрывается кнопкой;
   - [ ] переключение темы перекрашивает сетку и фон без перезагрузки;
   - [ ] при смене dpr изображение остаётся чётким.
5. `git status` не содержит изменений `Game`, `Session`, `games/*`.

Непроверяемое автоматически (пункт 4) зафиксировать в `REPORT.md`.

---

## Вне объёма

- Логика крестиков-ноликов и ИИ (фаза 06).
- Рендер фигур конкретной игры, игровое меню, баннер хода (фаза 07); `Game.render`
  и колбэк из `GameEnvironment` не трогаем (D7).
- Фоновое демо и монтирование/снятие слоёв (фаза 08).
- Хот-сит, сеть, `Transport`, лобби (фазы 09–10).
- Тач-жесты, пинч, инерция, клавиатурный зум, мини-карта, fit-to-content, сброс.
- `--board-x`, `--board-o` и фигурные токены — с фигурами.
- Новые npm-зависимости.

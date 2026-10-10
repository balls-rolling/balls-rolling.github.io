# PLAN — Фаза 04: Дизайн и вёрстка

**Флаг тестов: y** — чистая логика (резолв темы, схема настроек) в `node`; визуал — вручную.
**Цель:** привести UI фазы 03 к единому современному адаптивному виду без изменения поведения; единственное функциональное исключение — переключатель темы (D4). Расширение T10–T15 (2026-10-04) осознанно вышло за «только вид».

## Задачи

- **T1 Токен-слой:** `src/styles/tokens.css`, `src/styles/base.css` — семантика (`--surface*`, `--on-surface*`, `--border*`, `--focus-ring`), шкалы space/r/fs/elevation/motion/состояния; удалить мёртвые `--bg-1/2/3`, `--bg-m1/2/3`; дубль `--danger`/`--ok` с `palette.ts:7,36-37` — один источник; в `base.css` сброс, `:focus-visible`, `prefers-reduced-motion`. tests:n.
- **T2 UI-примитивы:** `src/ui/styles/primitives.css` (новый), `src/main.ts` — CSS-классы Button/Field/Group/Card/Dialog. tests:n.
- **T3 Шелл и диалог:** `src/ui/shell/layers.css`, `LayerDialogs.vue` — карточка на примитивах, `max-width`/`width:min(...)`, `dvh`, safe-area (`env(safe-area-inset-*)`), внутренний скролл, `:focus-visible` вместо ручного JS-фокуса (`LayerDialogs.vue:34-42`). tests:n.
- **T4 Экраны/лобби/форма:** `src/ui/screens/{MainScreen,GamesScreen,SettingsScreen,SetupScreen}.vue`, `src/ui/lobby/LobbyView.vue`, `src/ui/form/FormView.vue`, `src/ui/form/ControlHost.vue`, `src/ui/form/controls/*.vue` — снять дубли D1–D6, 12 кнопок → Button, висячие `.form-control*`. tests:n.
- **T5 Иконки:** `package.json` (`@lucide/vue`), `src/ui/icons/registry.ts`, `index.ts` (новые), `ButtonControl.vue`, `MainScreen.vue`, `SessionHost.vue`, `LayerDialogs.vue`, `test-game/game.ts` (токены `icon`), `.form-control__icon` в `primitives.css` — явные импорты, реестр токен→компонент по образцу `form/registry.ts:15-25`. tests:n.
- **T6 Тема-ядро:** `src/core/platform/platform.ts`, `index.ts`, `src/core/theme/palette.ts`, `index.ts`, `platform.test.ts`, `palette.test.ts` (новый) — `themeMode "system"|"light"|"dark"` (default system), `resolveTheme(mode, systemDark)`, `applyPalette` пишет разрешённое в `dataset.theme`, `watchPalette` слушает `matchMedia` только при system. tests:y.
- **T7 FOUC/`color-scheme`:** `index.html`, `src/main.ts`, `src/styles/base.css` — синхронный inline-скрипт в `<head>` (не module), ключ `localStorage["mini-games:global"]` (конверт `{v:1,data:{...}}`), `try/catch`, `color-scheme` по разрешённой теме. tests:n.
- **T8 UI настроек темы:** `SettingsScreen.vue`, `src/ui/environment.ts` — грузит `themeMode`, применяет на `change`; обе точки записи (`save()` и `environment.ts:42-43`). tests:y.
- **T9 Финальная приёмка:** `npm test`/typecheck/build/format + ручная матрица тем×окон×фокуса, контраст ≥4.5:1 / ≥3:1. tests:y.
- **T10 Уведомления:** `src/ui/notifications/{center.ts,center.test.ts,NotificationToasts.vue,NotificationBell.vue,key.ts,index.ts}`, `main.ts`, `LayerDialogs.vue`, `LayerGameUi.vue`/`SessionHost.vue` — центр в памяти, тосты+колокольчик, две точки монтирования; `savedNote` убрать. tests:y.
- **T11 Таксономия настроек:** `platform.ts`, `platform.test.ts`, `form/{FormView.vue,ControlHost.vue,controls/*.vue}`, `SettingsScreen.vue` — группы «Критические»/«Настройки», `disabled` по id, блокировка имени при активной сессии. tests:y.
- **T12 Автосохранение:** `SettingsScreen.vue`, `form/controls/{Text,Number}Control.vue` — `change`, применение сразу, запись debounce 300 мс, флаш; кнопку «Сохранить» убрать. tests:n.
- **T13 Игровое меню:** `core/game/{menu.ts,game.ts,index.ts}`, `ui/game-menu/GameMenu.vue`, `SessionHost.vue`, `ui/session-host.ts`, `environment.ts` — `Game.getGameMenu()`/`onGameMenuAction`. tests:y.
- **T14 Выход:** `core/game/{exit.ts,game.ts,index.ts}`, `ui/dialogs/ExitDialog.vue`, `SessionHost.vue` — системный диалог «Выйти»/«Остаться», `onExitRequested`/`onExitResolved`. tests:y.
- **T15 Мелкие правки:** `primitives.css`, `FormView.vue`, `test-game/game.ts` — единая ширина кнопок, горизонтальная группа «Сеть». tests:n.

## Решения

- **Токены** — собственные (HIG/M3/Fluent как ориентир). Цена: 0 зависимостей, свой CSS сопровождать.
- **Примитивы** — свои CSS-классы, не библиотека (D7). Цена: 0 зависимостей.
- **Иконки** — `@lucide/vue@1.51.0` (ISC), реестр токен→компонент, **явные импорты** (tree-shaking); динамический `import *` запрещён. Выбор пользователя: инлайн SVG отвергнут по виду; `lucide-vue-next` устарел. Отклонены: `unplugin-icons`+`@iconify-json/lucide` (Vite 8 не подтверждён), `@iconify/vue` (сеть в рантайме), `@heroicons/vue` (узкий набор).
- **Тема** — хранить режим `system|light|dark`, в DOM писать разрешённое; `color-scheme` привязан к разрешённой теме. Отклонены: User Preferences API, хранение хеша цвета.
- **FOUC** — синхронный inline-скрипт в `<head>`; цена: дублирование парсинга конверта + `try/catch`.
- **Переключатель темы** — нативный `<select>` с label (не `role="switch"`: три состояния).
- **Хранение** — расширяем `GlobalSettings`; помним про две точки записи и полные сравнения в `platform.test.ts`.
- **Расширение:** настройки — две группы «Критические» (имя) / «Настройки» (тема); разделение игровых/системных не финализировано. Имя нельзя менять при активной сессии. Уведомления в памяти (тосты+колокольчик, две точки монтирования). Автосохранение: сразу + debounce 300 мс + флаш. Меню игры/выход — методы `Game`. Flex, не grid.

## Риски

FOUC/FART на медленном кадре; кросс-вкладочная синхронизация темы вне объёма; потеря поля в двух точках записи и полные сравнения `platform.test.ts` (закрываем T6/T8); `color-scheme`/Auto Dark — только вручную; `localStorage` может бросать (try/catch → тихий `system`); визуал проверяется только ручной матрицей.

## Проверка фазы

`npm test` (в т.ч. T6), typecheck/build/format; вручную матрица тем×окон×фокуса, контраст, отсутствие FOUC. Автотестами композиция/внешний вид не проверяются — отметить в отчёте.

## Вне объёма

Поведение и навигация (D1); токены `--board-*` (05/07); компонентные/CSS-библиотеки (D7); кросс-вкладочная синхронизация; User Preferences API; расширение набора иконок; миграции конверта.

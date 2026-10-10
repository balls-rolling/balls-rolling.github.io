# REPORT — Фаза 04: Дизайн и вёрстка

План утверждён вызовом `/lf-next` (approval by invocation). Выполнены T1–T9; расширение T10–T15 — отдельным разделом ниже. Решение по иконкам изменено пользователем: `@lucide/vue` вместо инлайн SVG (T5 и «Решения» плана обновлены до исполнения).

## Сделано

UI платформы приведён к единому современному виду без изменения поведения: слой токенов и семантики, общие UI-примитивы, на них переведены диалог, экраны, лобби и формы. Добавлен переключатель темы (Системная/Светлая/Тёмная) с сохранением и применением до первого кадра. Подключены иконки. Расширение: уведомления (T10), таксономия настроек (T11), автосохранение (T12), игровое меню (T13), выход (T14), мелкие правки (T15).

## Файлы

- **Токены/база:** `src/styles/tokens.css` (семантика; удалены мёртвые `--bg-1/2/3`, `--bg-m1/2/3`, `--accent-lo`; старые `--radius*` — алиасы), `src/styles/base.css` (сброс, `:focus-visible`, `prefers-reduced-motion`, `color-scheme`), `src/ui/styles/primitives.css` (`.btn*`, `.field*`, `.group*`, `.surface-card`, `.list-reset`, `.text-muted`, `.icon`).
- **Тема:** `src/core/theme/palette.ts` (`ThemeMode`, `resolveTheme`, `setThemeMode`, `applyPalette`, один системный слушатель; убраны инлайн `--danger/--ok`), `core/theme/index.ts`, `palette.test.ts`, `core/platform/platform.ts` (`GlobalSettings.themeMode`, валидация, `select` темы, `GLOBAL_THEME_CONTROL`), `platform/index.ts`, `platform.test.ts`, `index.html` (inline `data-theme`+`meta[color-scheme]`), `src/main.ts`, `SettingsScreen.vue`.
- **Компоненты/иконки:** `src/ui/shell/layers.css`, `LayerDialogs.vue`, `SessionHost.vue`, `screens/{MainScreen,GamesScreen,SetupScreen}.vue`, `lobby/LobbyView.vue`, `form/FormView.vue`, `controls/*.vue`, `src/ui/icons/registry.ts`, `index.ts`, `src/games/test-game/game.ts` (токены `icon`), `package.json` (`@lucide/vue@^1.51.0`, ISC).

## Тесты

87 тестов / 12 файлов, зелёные (было 84). `typecheck` (три проекта), `build`, `format` — код 0.

## Объективные доказательства (браузер)

Свежая сборка, `npm run preview`, Chromium: меню `btn--primary/secondary` + svg, заголовок «Меню»; настройки `select` темы + поле имени, 2 `.field`; light → `data-theme=light`+`color-scheme:light`, dark → dark, system → ОС; сохранение `localStorage={name,lastGameId,themeMode:"light"}`; после reload без вспышки; преднастройка с иконками, группы `--framed --horizontal`; слот `running · ходит … · revision 1`; лобби `disabled`; диалог 480px radius 28px backdrop blur(12px) max-height 560px; консоль пуста.

## Отклонения от плана

1. `src/ui/environment.ts` не менялся: он пишет `{...settings, lastGameId}`, `themeMode` сохраняется спредом (T8 перестраховывался).
2. Иконки в шелле/экранах — прямыми импортами `@lucide/vue`; реестр обслуживает только `Control.icon`.
3. Добавлены утилиты `.list-reset`, `.text-muted`, `.icon` (в плане не назывались).
4. `meta[color-scheme]` обновляется inline-скриптом при загрузке, но не при рантайм-переключении темы.

## Не проверено

Покадровая вспышка темы (проверено только итоговое состояние до первого измерения); малое окно визуально (адаптив подтверждён структурно); числовой контраст WCAG 4.5:1/3:1; другие браузеры, `AccentColor` при форсированной схеме; `prefers-reduced-motion`/`prefers-contrast`/`forced-colors` вручную.

## Расширение объёма (T10–T15, 2026-10-04)

- **T10** `src/ui/notifications/`: центр в памяти (история, тосты, непрочитанные), тосты с авто-скрытием и `aria-live`, колокольчик с историей/очисткой; монтирование в диалоговом и игровом слое (взаимоисключающи). `savedNote` убран.
- **T11** `globalForm()` — группы «Критические» (имя) и «Настройки» (тема); форма поддерживает набор `disabled` по id; имя блокируется при активной сессии с локальным человеком.
- **T12** text/number шлют `change`; тема применяется сразу, запись debounce 300 мс + флаш; кнопки «Сохранить» нет; подтверждение — уведомлением.
- **T13** `Game.getGameMenu()`/`onGameMenuAction`; «Меню» открывает выпадашку с пунктами игры + системные «Настройки» и «Сдаться и выйти»/«Выйти»; слот сессии расширен до `(session, game)`.
- **T14** строго системный диалог «Выйти»/«Остаться»; `Game.onExitRequested` (текст, строка, доп. кнопка) и `onExitResolved`; выход завершает сессию и открывает главное меню.
- **T15** единая ширина кнопок (стек/списки — на всю ширину, строка — по содержимому); исправлена горизонтальная группа — рекурсивный `FormView` оборачивал детей в колонку.

Тесты: 93 / 14 файлов (было 87): центр уведомлений (3), интерфейс меню/выхода (3). typecheck (три проекта)/build/format — 0.

Ограничения расширения: тосты рендерятся в двух контейнерах (в DOM дважды); `Game.onGameMenuAction` без окружения (потребитель — фаза 07); разделение игровых/системных настроек не финализировано.

### Правки после авто (заходы)

- **Одна видимая кнопка.** Игровой колокольчик/тосты — только при закрытом диалоге, диалоговые живут в `<dialog>`; оба `position: fixed` в одной точке (`top/right: var(--space-4)`); 48px, radius 999px, `--surface-2`. Тосты `<TransitionGroup>`; `::backdrop` blur(6px); у карточки `backdrop-filter` убран (делал containing block для `fixed`). Главное меню поверх игры недоступно (демо — фаза 08).
- **Панель колокольчика — нативный `popover="auto"`** + anchor positioning (уникальные id/якорь через `useId()`); light-dismiss нативный; `@starting-style`+`transition-behavior: allow-discrete`; камень: UA `[popover]{inset:0}` → нужны явные `left/bottom:auto`.
- **Стек уведомлений:** единый `NotificationItem.vue`; открытие прячет тосты (`dismissAllToasts`); клик по телу/крестику метит и растворяет; `TransitionGroup` убран (застревал leave); `unread` от непрочитанных, `markRead`/`dismiss`/`dismissAllToasts`, центр без `markAllRead`. 95 тестов / 14.
- **Горизонтальный скроллбар стека:** панель `overflow:hidden`, список `overflow-x:hidden; overflow-y:auto`; у строк убран `translateX`; жёсткий `max-height:320px` убран, панель `max-height: calc(100dvh - …)`, список `flex:1 1 auto; min-height:0`. Замеры: 26 уведомлений → панель 1127px, `scrollHeight` 1500 > `clientHeight` 1061; 10 → 638px без скролла.
- **Группы формы test-game:** вложенный `.form-view` получил `display:contents` → flex-контейнер группы = сам `fieldset`; горизонтальная группа `flex:1 1 0; min-width:0`. Замер: «Режим» column 412px, «Сеть» row 200px. Замечание: на dev-сервере после правки `game.ts` может остаться устаревший модуль — помогает перезапуск.
- **Флекс полей/кнопок:** `input/select/textarea{width:100%;min-width:0}` (кроме checkbox/radio), `.field{min-width:0}`, ellipsis + `title`; дети горизонтальных групп `flex:1 1 0;min-width:0`; `.btn{overflow:hidden;min-width:0}`, текст в `.btn__label` с ellipsis, у кнопок `title`. Замеры: «Сеть» 200px, поле 412px, диалог выхода 213px.
- **Ellipsis заголовков:** `.app-dialog__title` ellipsis + явная `grid-column:2` (иначе без «назад» попадал в колонку 40px); `.session-host__state` ellipsis, у слота `max-width:100%`.
- **Бейдж колокольчика обрезался** базовым `.btn{overflow:hidden}`: содержимое в `.bell__content`, `.bell__button{overflow:visible}`, бейдж 18×18 поверх кнопки.

## Проверка

- Дата: 2026-10-04
- Вердикт: чисто (в ходе проверки найден и исправлен функциональный дефект; ниже — принятые ограничения, не хвосты)
- Результат по пунктам:
  - Соответствие плану T1–T15 → **problem (исправлено):** T3 — добавлены `env(safe-area-inset-*)` (`layers.css`); T1 — удалены мёртвые `--accent-hi`, `--border-strong`; `.group--framed`/`.group__label` удалены. Остальные T1–T15 — ok.
  - Мусор → ok: нет `console.*`/`debugger`/`TODO/FIXME`/закомментированного кода; мёртвые токены и классы вычищены; `.form-control*` удалены.
  - Согласованность → **problem (исправлено):** ROADMAP/CONTEXT описывали фазу как «только вид», расширение меняет поведение — обновлены описание фазы 04, роадмап, CONTEXT, вводная REPORT; BACKLOG синхронизирован. STATE ↔ реальность — ok.
  - Противоречия PROJECT.md → ok: 7a (`architecture.test.ts`), принцип 2 (нативные), принцип 9 (safe-area).
  - Off-track → **problem (исправлено):** расширение вышло за цель фазы, но служило цели проекта; зафиксировано.
  - Хвосты → **problem (исправлено, функциональный дефект):** настройки из игрового меню не закрывались (корневой экран, нет «Назад», `closedby="none"`). Добавлен `ScreenSpec.closable` в `DialogManager`, `GameMenu.openSettings`; покрыто `manager.test.ts` (+3).
- Объективные доказательства: `npm test` → 15 файлов, **98 тестов** (было 95), пройдено; `typecheck` (три проекта)/`build` — код 0. Браузер: light `#fff` + сохранение, reload без вспышки; колокольчик `popover-open` «Уведомлений нет»; диалог 480px, на узком `100vw−32px`, скролл; слот `running · ходит Игрок`; настройки из игры: имя `disabled` с подсказкой, «Назад» закрывает; диалог выхода; консоль пуста.
- Не проверено: числовой контраст; другие браузеры, `AccentColor`; `prefers-reduced-motion`/`forced-colors`; покадровая вспышка; visual diff кадров.
- Принятые ограничения (не хвосты): тосты в двух контейнерах (в DOM дважды); `Game.onGameMenuAction` без окружения (фаза 07); разделение настроек не финализировано; `meta[color-scheme]` не меняется в рантайме; «Сдаться и выйти» показывается и против компьютера (`players.length > 1`) — уточнение формулировки при хот-сите (фаза 09).

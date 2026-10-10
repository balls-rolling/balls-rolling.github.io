# PLAN — Фаза 03: Диалоги, меню и формы

Цель: UI-слой платформы — диалоги со стеком, конструктор форм по метаданным, экраны меню, интерфейс лобби, окружение и запуск `test-game` из меню. Тесты `vitest`, окружение `node`; UI-компоненты автотестами не покрываются (нет DOM) — проверка ручная, в браузере.

## Задачи (T1–T10)

- T1 — ядро: рекурсивная модель `FormNode = FormGroup | FormText | FormControl` с полем `type`; у группы `label?/frame?/orientation?/collapsible?/open?/children`; у текста `text/multiline?`; контролл обёрнут `{type:"control", control}`, `Control.kind` — открытая строка; `FormSchema {id?, nodes}`; контроллер разворачивает дерево и создаёт значения только для листьев-контроллов.
- T2 — ядро: контракты окружения. `GameEnvironment { game, lobby: {defaultPlayers, showHost, showClient}, launch(players, options?): Promise<SessionAccess> }`; `SessionAccess` — `snapshot/subscribe/renamePlayer/makeMove` (игра не получает сам `Session`); `Game.attachEnvironment(env)`. `board?`/`ui?` не объявляются (аддитивно позже); `showClient` объявлен, реализация — фаза 10.
- T3 — UI: чистый стек диалогов `DialogStack<T>` (`push/back/close/top/depth/canGoBack`, вызов `onDispose`), без Vue в рантайме (только `import type`).
- T4 — UI: конструктор формы. `FormView.vue` рекурсивно ссылается на себя; группа — `<fieldset>`, при `collapsible` — `<details>/<summary>`; `:key` по `id` на каждом узле; реестр `Readonly<Record<string, Component>>` из статических импортов, `markRaw`, неизвестный `kind` → `FallbackControl`; `useFieldValue.ts` — источник истины `FormHandle`, чтение через счётчик-версию, запись через `setValue`; `ButtonControl` шлёт `handle.emit(id, "press")`. **Ограничение:** внешний `handle.setValue` версию не поднимает — в 03 внешних мутаций нет.
- T5 — UI: слой диалогов и менеджер. `DialogManager` (экземпляр, ключ `dialogKey`); `<dialog aria-modal="true" closedby="none">` живёт в `LayerDialogs.vue` всегда в DOM (не под `v-if`); `show` → push + `if (!el.open) el.showModal()`, перехват `InvalidStateError`; `cancel` → `preventDefault()`; экраны `v-for` + `v-show` (старый скрывается, не размонтируется; `back()` снимает запись и зовёт `handle.destroy()`); `<KeepAlive>` отклонён; шапка с заголовком и «назад» при `depth > 1`; фокус вручную; анимация `@starting-style` + `transition-behavior: allow-discrete`, `display` и `overlay` в `transition`; фолбэк `@supports not (overlay: auto)`.
- T6 — UI: локальное лобби. `players.ts` — `defaultPlayers({humans, computers, limit, name})`: стабильные id, имя человека из настроек, «Гость N»/«Компьютер», универсально для >2 игроков (лимит — параметр); `LobbyView.vue` — динамический состав; `local.ts` — `Lobby`: `defaultPlayers`, `showHost`, `showClient` отвергает «клиентское лобби — фаза 10». Роль хост/клиент **не** в `PlayerInit`.
- T7 — UI: экраны главный/игры/настройки + `lastGameId`. `GlobalSettings.lastGameId: string` с валидацией (нет/мусор → `""`); `MainScreen` («Играть в "<название>"» — последняя из `lastGameId`, если нет но в реестре одна игра — она; «Игры»; «Настройки»); `GamesScreen` (из `platform.listGames()`); `SettingsScreen` (форма метаданных, пишет `global`, переименовывает активного игрока); `navigation.ts` через `dialogKey`; `openGame(entry)` — **делегирующий хук**, реально регистрируется в T8.
- T8 — UI: преднастройка, окружение, запуск, слот. `createGameEnvironment(...)`: `launch` создаёт сессию через `platform.createSession`, кладёт в слот, `start()`, сохраняет `lastGameId`, закрывает диалог, возвращает `toSessionAccess(session)`; **прошлую сессию обязательно `destroy()` до создания новой**; `toSessionAccess` — только `snapshot/subscribe/renamePlayer/makeMove`; `SetupScreen` строит `FormHandle` из `game.getSetupForm()`, создаёт окружение, зовёт `game.attachEnvironment(env)`, рендерит `FormView`; `SessionHost` — «слот сессии» (`shallowRef`, минимальный временный вид: игра, чей ход, revision, кнопка «Меню»; настоящий игровой UI — фаза 08).
- T9 — `test-game` как обычная игра. `setupForm` с кнопками-действиями; `attachEnvironment` подписывается на `press` и зовёт `launch(lobby.defaultPlayers(...))` либо `lobby.showHost` + `launch`; в `App.vue` вместо панели монтируется `SessionHost` в слой 2; удалить `TestGamePanel.vue`.
- T10 — чистка диагностических ярлыков слоёв: убрать `<span class="layer-tag">` и стили; сохранить порядок слоёв и `pointer-events` (слой 3 `none`; слой 2 `none` на контейнере, `auto` на детях).

Порядок: волна 1 {T1 ‖ T2 ‖ T3}; волна 2 {T4←T1, T5←T3, T6←T2}; волна 3 {T7←T4,T5, T10←T5}; волна 4 T8←T2,T4,T5,T6,T7; волна 5 T9←T4,T7,T8; волна 6 приёмка.
Швы: **T7↔T8** (`openGame` делегирующий хук); **`SessionHost`** — «слот сессии».

## Затронутые файлы

Ядро: `src/core/form/{types,controller,index}.ts`, `src/core/game/environment.ts`, `src/core/game/{game,index}.ts`, `src/core/platform/{platform,platform.test}.ts`; игра `src/games/test-game/{game.ts,game.test.ts}`.
UI: `src/ui/dialog/{stack.ts,stack.test.ts,index.ts,manager.ts,key.ts}`, `src/ui/form/{FormView.vue,ControlHost.vue,registry.ts,useFieldValue.ts,index.ts,controls/{TextControl,ToggleControl,NumberControl,SelectControl,ButtonControl,FallbackControl}.vue}`, `src/ui/lobby/{players.ts,local.ts,LobbyView.vue,index.ts,players.test.ts}`, `src/ui/screens/{MainScreen,GamesScreen,SettingsScreen,SetupScreen}.vue`, `src/ui/screens/{navigation.ts,index.ts}`, `src/ui/environment.ts`, `src/ui/session-access.ts`, `src/ui/session-access.test.ts`, `src/ui/session-host.ts`, `src/ui/shell/{LayerDialogs.vue,layers.css,SessionHost.vue,LayerBoard.vue,LayerGameUi.vue}`, `src/main.ts`, `src/App.vue`; удалить `src/ui/shell/TestGamePanel.vue`.

## Решения

- **Стандартный фрагмент формы «игроки и соперник» не нужен:** составом владеет лобби, а не форма игры; иначе фрагмент продублировал бы лобби и зашил бы смысл игроков в форму.
- **Экран настроек игры в фазу не входит:** ключ `game/<id>` нужен игре с реальными свойствами; у `test-game` свойство синтетическое; полный экран и модель игрока — фаза 08; хвост в бэклоге.
- **Ярлыки слоёв убираются в этой фазе (T10).**
- **Библиотеки не берутся — выбор.** Нативные `<dialog closedby>`, `<details>/<summary>`, Invoker Commands, `@starting-style`+`allow-discrete`+`overlay` покрывают задачу; кандидаты (`@headlessui/vue`, `reka-ui`, `vue-final-modal`) добавляют зависимость и свой слой поверх нативного. Цена: руками фолбэк `@supports not (overlay: auto)` и фокус.
- **Переключение экранов — `v-show`-список, не `<KeepAlive>`.** Стек ≤3; `v-show` держит старые экраны смонтированными, `back()` снимает запись и зовёт `destroy()` предсказуемо; `<KeepAlive>` кэширует по компоненту и путается, когда один `SetupScreen` показывается для разных игр.
- **Стек диалогов — чистым классом без Vue-рантайма** (тестируется в `node`).
- **Модель формы — union с полем `type`** (убирает двусмысленность, даёт рендереру явный `switch`).
- **`defaultPlayers` добавлен в лобби:** игра называет роли (`agent`, `transport`), но не владеет именем игрока (оно в глобальных настройках); композиция состава — место лобби, `launch` остаётся ровно `readonly PlayerInit[]`.
- Зависимостей не добавляется: только `vitest` (уже в фазе 02, MIT, devDependency); runtime-зависимость одна — `vue`.

## Проверка фазы

`npm run typecheck` (три проекта: приложение `vue-tsc`, конфиги, тесты); `npm test` (было 59, добавляются тесты T1, T3, T6, T7, T8, T9); `npm run dev` — ручной чек-лист: меню → список → преднастройка → сессия; «Играть в X»; «назад»; Esc и клик вне не закрывают; свёртка групп; сохранение имени; запуск `test-game`; отсутствие ярлыков слоёв. Автотестами не проверяются: Vue-компоненты, реальный `<dialog>`, анимация/`overlay`, фокус.

## Риски

- `closedby` и `overlay` — разная поддержка браузеров; барьер через `cancel` и `@supports`-фолбэк обязательны.
- `showModal()` на открытом диалоге бросает — guard `if (!open)`.
- Реактивность адаптера формы: внешний `handle.setValue` версию не поднимет; источник истины — handle.
- `launch` при активной сессии обязан уничтожить прошлую до создания новой.

## Вынесено за фазу

Дизайн — 04; демо — 05; Viewport — 06; логика игры — 07; игровой UI — 08; сетевое лобби — 10; `board?`/`ui?` в окружении — 06/08; экран настроек игры и персистентность `game/<id>` — 08; ленивые группы — бэклог.

## Статус

Выполнено, см. `REPORT.md` → `## Проверка` (2026-10-04, вердикт: проблемы 6, один функциональный; все шесть исправлены по команде пользователя).

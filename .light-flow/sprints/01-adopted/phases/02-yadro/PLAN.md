# PLAN — Фаза 02: Ядро платформы

Цель: ядро платформы — `Platform`, `Game`, `Session`, `Player`, `Storage`, метаданные формы, тестовая игра `test-game`. Тесты подключены в этой фазе (vitest, `environment: node`): D4 «ядро без DOM» окупается — ядро проверяется без браузера.

## Задачи (T1–T10)

- T1 — инфраструктура тестов: `vitest.config.ts` (`environment: "node"`, `include: src/**/*.test.ts`, алиас `@`), smoke-тест; `npm test`.
- T2 — форма без Vue: `ControlKind` (открытая строка), `Control {id,kind,label,icon?,value?,options?,signals}`, `FormSchema {id?,controls}`, `FormHandle` (`getSnapshot/getValue/setValue/patch/on/destroy`; `on` **обязан возвращать отписку**), `createFormController`; `icon` — строковый токен, не Vue-компонент; «сигналы» = события.
- T3 — `Storage`: `Schema<T> = {defaults, parse}` передаётся на каждый вызов; async `read` (всегда `T` через defaults), `write`, `remove`; приватные бэкенды `MemoryBackend`/`LocalStorageBackend` с **пробой записи** при инициализации (не только проверка существования); конверт `{v:1,data}`; имя `KeyValueStore`, не `Storage`.
- T4 — схема свойств и `Player`: `PropertySpec {key,label,control}`, `PropertySchema<T>` с ручными guard'ами; `Player {agent:"human"|"computer", transport:"local"|"remote"}` — поля независимы; чтение/запись по схеме, `snapshot()`.
- T5 — абстрактный `Game` (tests: n, контракт покрыт T6/T7/T8): `Move`, `MoveResult`, `GameState`; `applyMove`, `chooseMove(state,playerId)`, `nextPlayer(state,playerId)`, `isFinished`, `getPropertySchema()`, `getSetupForm(): FormSchema`. Нет импортов `vue`/UI/конкретных игр; типы не зависят от `Player`.
- T6 — `Session`: `SessionState = idle|running|finished`, `SessionSnapshot` (игроки, чей ход, `isDemo`, `revision`), `start/makeMove/restart/subscribe/snapshot`; снимок — новый immutable-объект на каждое изменение + инкремент `revision`; ход компьютера через `setTimeout` + `game.chooseMove`, снятие в `destroy()`. Не импортирует `core/theme` и `vue`.
- T7 — `Platform` (экземпляр + `createPlatform(store?)`, не модульный синглтон): `listGames()`, `createGame(entry)` (async — `GameEntry.entry: () => Promise<Game>`), владение хранилищем, глобальная схема (имя), ключ `global`. Не знает имён конкретных игр; нет импортов `vue`.
- T8 — `test-game`: `default export` записи (`id`, `label`, `entry`); `class TestGame extends Game` с тривиальными правилами, тестовой схемой свойств и `getSetupForm()`. Ходит настоящим путём реестра.
- T9 — UI (tests: n): `TestGamePanel.vue` (подписка `shallowRef`+`subscribe`, кнопки хода за игрока 1/2, игроки и чей ход, лог событий, имя игрока), `main.ts` создаёт `Platform` (composition root), удалить `RegistryPanel.vue`.
- T10 — guard-тесты архитектурных инвариантов (`architecture.test.ts`): нет импорта `vue`; `core/session/**` не импортирует `core/theme/**`; `core` не импортирует `ui`. Проверяется искусственным нарушением.

Порядок: 1 → {2 ‖ 3} → 4 → 5 → 6 → 7 → 8 → 9 → 10.

## Соглашения

Публичный API — barrel `src/core/<mod>/index.ts`. `src/core/**` не импортирует `vue` и `src/ui/**`. `src/core/session/**` не импортирует `src/core/theme/**` (палитра трогает `document`). Схема свойств — типы + ручной `parse` (без zod/valibot). Ключи хранилища: `global`, `game/<id>`.

## Затронутые файлы

Ядро: `src/core/form/{types,controller,index}.ts`, `src/core/storage/{types,backends,store,index}.ts`, `src/core/player/{schema,player,index}.ts`, `src/core/game/{move,game}.ts`, `src/core/session/{types,session,index}.ts`, `src/core/platform/{platform,index}.ts`; тесты `src/core/{smoke,architecture}.test.ts`, `form/controller.test.ts`, `storage/store.test.ts`, `player/player.test.ts`, `session/session.test.ts`, `platform/platform.test.ts`.
Игра: `src/games/test-game/{index.ts,game.ts,game.test.ts}`.
UI: `src/ui/shell/TestGamePanel.vue` (новый), `src/ui/platform.ts`; правки `src/App.vue`, `src/main.ts`; удалён `src/ui/shell/RegistryPanel.vue`.
Правки ядра: `src/core/game/entry.ts` (`entry: () => Promise<Game>`, поле `demo` удалено), `src/core/game/index.ts`.
Конфиги: `vitest.config.ts`, `tsconfig.test.json` (новые); `package.json` (vitest, скрипт `test`), `tsconfig.json` (тесты исключены), `tsconfig.node.json`.

## Решения

- **Готовые библиотеки не берутся нигде — осознанный выбор.** Хранилище: своя реализация (~60 строк) дешевле обёртки и точно соблюдает async-контракт и пробу записи (`localforage` не поддерживается, `unstorage` тянет 8 зависимостей, `@vueuse useStorage` синхронный, `idb-keyval` — задел на IDB). Схемы: ручные type guards вместо `zod`/`valibot`. Форма: ни одна библиотека не даёт «минимальная схема + свой контроллер» (`@formkit/vue` навязывает стек, `@jsonforms/vue` тянет `ajv`, `vue-form-json-schema`/`@lljj/*` на Vue 2, `@educorvi/vue-json-form` тянет `pinia`/Bootstrap).
- Схема свойств: типы + runtime-`parse` (нет зависимости, нет протечки знаний о играх в ядро).
- `icon` — строковый токен (Vue не протекает в ядро).
- Сигналы — события с обязательной отпиской (нет утечек).
- `Platform` — экземпляр класса + `createPlatform()` (тесты без скрытого глобального состояния).
- Vitest подключён в фазе 02, а не 06: ядро без DOM тестируется в `environment: node`; цена — devDependency, MIT, runtime-зависимостей нет. **Требует правки роадмапа и бэклога** (vitest числился за 06).

## Вынесено за фазу

`DialogManager`, меню, `<dialog>`, Vue-конструктор форм — 03; наполнение демо — 04; Viewport и canvas — 05; крестики-нолики — 06; сеть — 09; механизм миграций хранилища (только конверт `{v:1}`) и IndexedDB — когда появятся данные.

## Статус

Выполнено, см. `REPORT.md` → `## Проверка` (2026-10-04, вердикт: проблемы 4, документационные и один неполный хвост; функциональных дефектов нет).

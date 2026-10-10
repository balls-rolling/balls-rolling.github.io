# PLAN — Подфаза 12-a: локальное сохранение и восстановление партии

Родитель: фаза 12 «сохранение и восстановление партии» (`CONTEXT.md`). Здесь только
локальный случай: 12-b (сеть) и 12-c (UI очистки) — отдельные подфазы. Тесты фазы: **y**.

Волны (внутри волны задачи независимы): `T1 ∥ T2 → T3 ∥ T4 → T5 → (T6 ∥ T9) → (T7 ∥ T8) → T10`.

## Задачи

### T1. Хранилище: `keys()` + бэкенд IndexedDB
Во всех бэкендах и `KeyValueStore` — перечисление ключей; новый IndexedDB-бэкенд.
- Файлы: `src/core/storage/backends.ts` (+`keys()` в `StorageBackend`, `MemoryBackend`, localStorage), `src/core/storage/idb.ts` (new: `createIndexedDbBackend(): StorageBackend | null`, БД `mini-games-db`, стор `kv` v1, ленивое открытие), `src/core/storage/types.ts` (+`keys()` в `KeyValueStore`), `src/core/storage/store.ts` (+`keys()` со снятием `PREFIX`, `createIdbStore()` с фолбэком в `MemoryBackend`), `src/core/storage/index.ts` (экспорт), `src/core/storage/idb.test.ts` (new), `store.test.ts` (дополнить), `package.json` (devDep `fake-indexeddb@6.2.5`).
- Зависит: нет. Тесты: **y** (roundtrip get/set/remove/`keys` через `fake-indexeddb/auto`; нет `indexedDB` → `null`; `keys()` отдаёт логические ключи, чужие без префикса игнорируются).
- Готово: `npm test -- src/core/storage` и `typecheck` зелёные.

### T2. Контракт сериализации: `Game` + `Player` + `Session`
- Файлы: `src/core/game/game.ts` (дефолтные `serializeState`/`deserializeState`/`serializeSettings`/`applySettings`), `src/core/player/player.ts` (восстановление свойств из снимка через `setProperty`), `src/core/session/types.ts` (`SessionSave`, `SessionRestore`; `SessionDeps` — «`players` xor `restore`»), `src/core/session/session.ts` (`save(): SessionSave`; ветка `restore` в конструкторе без `createInitialState`; `resume()` — `#changed()` + `#scheduleComputer()`), `session.test.ts`, `player.test.ts` (дополнить).
- Зависит: нет. Тесты: **y** (`save()` — plain-объект; restore даёт `running` без `createInitialState`; `resume()` планирует ход компьютера; свойства из снимка восстанавливаются, невалидные отбрасываются).
- Готово: существующие вызовы `Session`/`Player` не меняются; `session-access.test.ts` (4 метода моста) зелёный.

### T3. Модуль сохранений `core/saves`
- Файлы: `src/core/saves/types.ts` (`GameSaveNode = { settings: unknown | null; session: StoredSession | null }`, `StoredSession = { v: number; data: SessionSave }`), `save-store.ts` (класс `GameSaves` над `KeyValueStore`), `index.ts`, `save-store.test.ts`.
- API: `save(id, node)`, `load(id)`, `removeSession(id)` (читает узел, перезаписывает с `session:null`, settings целы), `remove(id)`, `listIds()` (через `keys()` + фильтр `game/`).
- Версии: `SAVE_VERSION=1`; мусор/не-объект → `session:null`; `v>current` → отбросить сессию (settings целы); `v<current` → накопительные миграции (пока пустая цепочка), нет миграции → отброс; запись всегда в текущей версии.
- Зависит: T1, T2. Тесты: **y** (roundtrip; раздельность settings/session; `removeSession` сохраняет settings; испорченный узел → defaults; `v>current`; `listIds` только `game/`).

### T4. Сериализация крестиков-ноликов
- Файлы: `src/games/tic-tac/game.ts` (`serializeState` — `sets` в массивы строк; `deserializeState` — валидация, пересборка `Set`, `null` при мусоре; `serializeSettings` → `{level}`; `applySettings` → `clampLevel`), `game.test.ts`.
- Зависит: T2. Тесты: **y** (roundtrip всех полей `TicTacToeState`; после `serializeState` нет `Set`; `deserializeState(мусор) === null`; roundtrip `level` с клампом).

### T5. Платформа: API сохранений и восстановления
- Файлы: `src/core/platform/platform.ts` (+`#saves: GameSaves`, конструктор `new Platform(store?, saves?)` с дефолтом `new GameSaves(createIdbStore())`, методы ниже), `index.ts`, `platform.test.ts`.
- API: `saveGameSnapshot(id, settings, save)`, `removeSessionSave(id)`, `hasSavedSession(id)`, `listSavedGames()`, `dropGameSave(id)`, `resumeSession(game): Promise<Session | null>` (читает узел; `game.applySettings`; `deserializeState` → мусор/не `running` → отбросить сессию и вернуть `null`; иначе `new Session({ game, restore })` **без** запуска таймера — `resume()` зовёт UI-координатор).
- Глобальные настройки остаются в `#store` (localStorage) — инлайн-скрипт темы в `index.html` читает `mini-games:global` до кадра.
- Зависит: T1, T2, T3. Тесты: **y** (нет сохранения → `null`; с сохранением → `running`-сессия, настройки применены; испорченный `gameState` → `null` и удаление сессии; `hasSavedSession`/`listSavedGames`/`removeSessionSave`).

### T6. UI-координатор автосохранения
- Файлы: `src/ui/session-save.ts` (new: `attachSessionSave({session, game, platform}): () => void`), `session-save.test.ts`.
- Правила: подписка на сессию; `isDemo` → пропуск; есть игрок с `transport === "remote"` → пропуск (сеть — 12-b); `finished` → `removeSessionSave(game.id)`; `running` → `saveGameSnapshot(game.id, game.serializeSettings(), session.save())`; `idle` не пишется. Возвращённая функция снимает подписку.
- Зависит: T5. Тесты: **y** (сохранение на каждый `running`-снимок; finished → удаление; demo/remote/idle пропускаются; отписка прекращает запись).

### T7. Автосохранение в обычном запуске
- Файлы: `src/ui/environment.ts` (в `launch`: `clear → createSessionFor → set → attachSessionSave → start`, затем `lastGameId`).
- Зависит: T6. Тесты: **n** (тонкая склейка; логика в T6, покрытие — T6/T10).

### T8. Восстановление, «Продолжить», предупреждение D6
- Файлы: `src/ui/resume-game.ts` (new: `resumeGame(deps, entry)`, `confirmNewGame(deps, entry)`), `src/ui/screens/navigation.ts` (`GameOpenOptions.resume?: boolean`), `src/main.ts` (opener: `resume` → `resumeGame`, иначе `confirmNewGame` → `SetupScreen`), `src/ui/screens/MainScreen.vue` (при сохранении — «Продолжить «<игра>»» → `openGame(quickGame, { resume: true })`), `ConfirmDialog.vue` (new), `resume-game.test.ts`.
- `resumeGame`: `createGame` → `resumeSession` (нет → `false`, вызывающий открывает `SetupScreen`) → `sessionHost.set` → `attachSessionSave` → `session.resume()` → `lastGameId`; `true`.
- Зависит: T5, T6. Тесты: **y** (`resume-game.test.ts` — успех/`false`/вызов `resume`); разметка `MainScreen`/`ConfirmDialog` — **n** (нет jsdom).

### T9. Удаление сохранения при явном выходе
- Файлы: `src/ui/game-menu/GameMenu.vue` (в `requestExit` после подтверждения → `platform.removeSessionSave(game.id)` перед `sessionHost.clear()`; inject платформы).
- Зависит: T5. Тесты: **n** (Vue-склейка; удаление покрыто T5/T6).

### T10. Интеграционный тест полного локального цикла
- Файлы: `src/core/platform/resume.test.ts` (new).
- stub-игра с `Set`-состоянием; `MemoryBackend` + `GameSaves` + `Platform`; старт → ходы → `saveGameSnapshot` → новый `Platform` над тем же бэкендом → `resumeSession` → снимок совпадает (ход, очередь, очки), ход компьютера возобновляется; завершение → сессия удалена, settings на месте.
- Зависит: T1, T3, T4, T5. Тесты: **y**.

## Решения
1. **IndexedDB — тонкий нативный бэкенд, без библиотеки.** Нужны только `get/set/remove/keys`. `dexie` (~31 KB gzip) избыточен, `idb-keyval` без версионирования, `idb` не окупается. Принцип `PROJECT.md:39` «нативное — лучше». Цена: ~80 строк `idb.ts` + devDep `fake-indexeddb@6.2.5` (Apache-2.0, только тесты); значения — строки (JSON-конверт), тип `StorageBackend` не меняется.
2. **Глобальные настройки остаются в localStorage.** Инлайн-скрипт темы читает `mini-games:global` до кадра; перенос в IDB вернёт мигание. У платформы два стора: `#store` (global) и `#saves` (IDB, фолбэк в память).
3. **Plain-сериализация силами игры, а не structured clone.** `JSON.stringify` теряет `Set`. Plain-данные переносимы в 12-b, версионируемы, тестируемы в node. `serializeState`/`deserializeState` + `serializeSettings`/`applySettings` — аддитивные дефолты; `deserializeState` → `GameState | null`, мусор отбрасывается.
4. **Узел — один ключ `game/<id>` = `{ settings, session }`.** Settings и снимок раздельны (D4). Автосохранение пишет узел целиком; `removeSession` сохраняет settings. 12-c получит `listIds()`/`remove()`.
5. **Версия снимка — в payload (`session.v`), конверт `store.ts` не трогаем.** `decode()` игнорирует `v` конверта; не меняем, чтобы не править всех вызывающих. `v>current` → отбросить сессию, `v<current` → накопительные миграции. Ветвление версий не поддерживается.
6. **Восстановление — вход `restore` в `SessionDeps` + `resume()`.** Состояние и очередь из снимка, `createInitialState` не вызывается; `resume()` уведомляет подписчиков и возобновляет ход компьютера. Мост `SessionAccess` не расширяется.
7. **Точка автосохранения — UI-координатор по подписке.** Нужны `game`, `session` и стор; активной сессией владеет `sessionHost` (UI). Ядро без Vue/UI. Демо и сетевые сессии (`transport:"remote"`) не сохраняются.
8. **Предупреждение D6 — подтверждающий диалог до `SetupScreen`.** Отмена предупреждения или преднастройки сохраняет старую партию; новая перезаписывает узел при старте.
9. **Явный выход** = `GameMenu` (`exit`/`surrender`): `removeSessionSave` перед `sessionHost.clear()`. Закрытие вкладки не удаляет (D7).

## Риски
- **Write amplification:** полный снимок в IDB после каждого хода; для крестиков-ноликов дёшево, для больших полей позже — throttle/сжатие.
- **Гонка read-modify-write** в `removeSession` (finish/exit). Один поток событий снижает вероятность; при проявлении — очередь промисов в `GameSaves`.
- **Дефолтный `Game.serializeState` = identity** испортит `Set`/`Map` у игры без override. Митигация: override в tic-tac (T4) + комментарий в базе.
- **`deserializeState` не бросает**: платформа дополнительно ловит исключение и отбрасывает сохранение (`resumeSession`).
- **`fake-indexeddb` ≠ браузер**: тайминги транзакций проверяются частично; ручная проверка в браузере (перезагрузка вкладки, «Продолжить») обязательна.
- **Сетевые сохранения** в 12-a не поддерживаются; их судьба — 12-b.

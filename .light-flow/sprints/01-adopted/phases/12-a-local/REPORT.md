# REPORT — Подфаза 12-a: локальное сохранение и восстановление партии

Родитель: фаза 12 (`CONTEXT.md`). План: `phases/12-a-local/PLAN.md`. Исполнено 10 задач из 10.

## Что сделано
- **T1.** `keys()` в `StorageBackend`/`KeyValueStore`; тонкий нативный IndexedDB (`createIndexedDbBackend`, БД `mini-games-db`, стор `kv` v1, ленивое открытие, фолбэк в память); `createIdbStore()`; devDep `fake-indexeddb@6.2.5`.
- **T2.** `Game` — аддитивные `serializeState`/`deserializeState`/`serializeSettings`/`applySettings`; `Player` принимает сохранённые свойства; `Session` — `save()`, ветка `restore` без `createInitialState`, `resume()`.
- **T3.** `GameSaves`: узел `game/<id>` = `{ settings, session }`, `save/load/removeSession/remove/listIds`; версия в payload (`v`), миграции (цепочка пуста), мусор/`v>current` отбрасываются, settings целы.
- **T4.** Крестики-нолики: `serializeState` (Set → массивы, JSON-safe), `deserializeState` (валидация/пересборка, `null` при мусоре), `serializeSettings`/`applySettings` (`{ level }` + кламп).
- **T5.** Платформа: `saveGameSnapshot`, `removeSessionSave`, `hasSavedSession`, `listSavedGames`, `dropGameSave`, `resumeSession`; второй стор `#saves` (IDB, фолбэк в память); глобальные настройки — localStorage.
- **T6.** `src/ui/session-save.ts`: подписка; `running` → запись, `finished` → удаление, `idle`/демо/сеть — пропуск; `isPersistable`.
- **T7.** `environment.launch` включает автосохранение перед `start()`.
- **T8.** `GameOpenOptions.resume`, `resumeGame`, `ConfirmDialog.vue` + `confirm-new-game.ts` (D6), `MainScreen` — «Продолжить «<игра>»» / «Новая партия».
- **T9.** Выход из `GameMenu` удаляет снимок (сохраняемые сессии; настройки остаются).
- **T10.** Интеграционный тест полного локального цикла (stub-игра с `Set`, `MemoryBackend`, два `Platform` над одним бэкендом).

## Изменённые / созданные файлы
- Storage: `src/core/storage/{backends,types,store,index}.ts`, `idb.ts` (new), `idb.test.ts` (new), `store.test.ts`.
- Ядро: `src/core/game/game.ts`, `src/core/player/player.ts` (+test), `src/core/session/{session,types,index}.ts` (+test), `src/core/saves/{types,save-store,index}.ts` (new) + `save-store.test.ts` (new), `src/core/platform/platform.ts` (+test), `resume.test.ts` (new).
- Игра: `src/games/tic-tac/game.ts` (+test).
- UI: `src/ui/session-save.ts` (new) + test, `environment.ts`, `resume-game.ts` (new) + test, `screens/navigation.ts`, `MainScreen.vue`, `ConfirmDialog.vue` (new), `confirm-new-game.ts` (new), `game-menu/GameMenu.vue`, `src/main.ts`.
- `package.json` / `package-lock.json` (devDep `fake-indexeddb`).

## Проверки
- `npm test` — **35 файлов, 224 теста, все прошли** (до: 30 / 175); после правок verify — **35 / 226**.
- `npm run typecheck` (`vue-tsc` + node/test tsconfig) — exit 0. `npm run build` (`vite build`) — успешно (2037 модулей).
- Новые тест-файлы: `idb.test.ts`, `save-store.test.ts`, `session-save.test.ts`, `resume-game.test.ts`, `resume.test.ts`.

## Отклонения от плана
- **T8.** `confirmNewGame` вынесен в `src/ui/screens/confirm-new-game.ts` (импортирует `ConfirmDialog.vue`); `resume-game.ts` без `.vue`-импортов (`vitest.config.ts` без vue-плагина). План держал оба в `resume-game.ts`; функционально то же.
- **T2.** В `SessionSave` нет `revision`; при восстановлении начинается с 0.
- **T5.** `createPlatform(store?)` не расширен — инъекция через `new Platform(store, saves)`.
- **T9.** Проверка сохраняемости инлайн (не через `isPersistable`), чтобы не зависеть от T6 в параллельной волне; логика дублирует `isPersistable`.
- **T3 (тест).** «Снимок без версии»: узел существует, сессия отбрасывается, настройки целы.

## Непроверенное / риски
- Реальный браузер: IndexedDB-специфика (перезагрузка вкладки, `onblocked`, приватный режим) только `fake-indexeddb`; сценарий «перезагрузка → Продолжить» и D6 — за verify.
- Разметка `MainScreen.vue`/`ConfirmDialog.vue` юнит-тестами не покрыта (нет jsdom/vue-плагина) — проверена типами и сборкой.
- `void`-вызовы записи снимка не отлавливают ошибки стора (best-effort по контракту хранилища).
- Write amplification: полный снимок после каждого хода (для tic-tac дёшево); гонка read-modify-write в `removeSession` не воспроизводилась.

## Проверка
- Дата: 2026-10-04
- Вердикт: **чисто** — 3 дефекта исправлены в этой же стадии и перепроверены в браузере; замечания вынесены в BACKLOG.
- Исправлено в этой стадии (verify):
  1. `GameMenu.vue` — `await platform.removeSessionSave(game.id)` до показа меню. Проверено: выход из локальной партии → меню предлагает «Играть», а не «Продолжить».
  2. `confirm-new-game.ts` — `dialog.back()` вместо `dialog.close()`. Проверено: «Отмена» возвращает в меню (с сохранением), «Начать новую» открывает SetupScreen с «Назад».
  3. `save-store.ts` (+ защита в `platform.ts`) — `parseSession`/`migrate` отклоняют снимок без `data`. Проверено: узел `{v:1}` без `data` больше не даёт «Продолжить»; регресс-тесты `save-store.test.ts` и `platform.test.ts`. После правок: 35 файлов / 226 тестов, typecheck exit 0.
- Результат по пунктам (первоначальный):
  - соответствие плану → **ok** (10/10 задач; T1–T10 реализованы, требования плана выполнены; T3/T5 несут дефект №3)
  - мусор → **problem**: дублирование проверки сохраняемости — `session-save.ts:54-57` (`isPersistable`) против инлайна `GameMenu.vue:89-90`; комментарий `session-save.ts:51-53` про переиспользование в T9 ложный (в проде не вызывается)
  - консистентность → **problem**: `ROADMAP.md:28` статус `todo` против `STATE.md:7` «исполнено»; `STATE.md:7` писал «12-a (из 12)» (у фазы 3 подфазы); списки отклонений `REPORT.md:70` и `STATE.md:33-36` расходились
  - противоречия PROJECT.md → **ok** (глобальные настройки — localStorage, сохранения — IndexedDB `game/<id>`; Vue в ядро не импортируется; демо не сохраняется)
  - off-track → **ok** (`listSavedGames`/`dropGameSave` без потребителя — задел 12-c, заявлен в плане)
  - хвосты → **ok** (висячих ссылок нет; сеть и очистка-UI вынесены в 12-b/12-c)
  - объективные проверки → **ok**: `npm test` 35 файлов / 224 теста; `npm run typecheck` exit 0; `npm run build` успешно; браузерный сценарий на `localhost:5174`
- Дефекты (с доказательством):
  1. **Гонка при явном выходе.** `GameMenu.vue:89-93` вызывает `removeSessionSave` без ожидания, затем сразу показывает `MainScreen`; `MainScreen.onMounted` читает `hasSavedSession` раньше записи → меню предлагает «Продолжить» для только что удалённой партии. Доказательство: после «Сдаться и выйти» меню показало «Продолжить», в IndexedDB `session: null`; перезагрузка убрала кнопку. Предложение: `await platform.removeSessionSave(game.id)`.
  2. **`confirmNewGame` закрывает весь диалог.** `confirm-new-game.ts:41` — `deps.dialog.close()` вместо `back()`. «Отмена» закрывает всё меню → пустой фон (тупик); «Начать новую» делает `SetupScreen` корневым без «Назад». Доказательство: браузерный сценарий. Предложение: `deps.dialog.back()`.
  3. **Мусорный узел роняет восстановление.** `save-store.ts:49-58` (`migrate` при `from === SAVE_VERSION` не проверяет `data`) пропускает узел `{v:1}` без `data` как валидную сессию; `platform.ts:236` читает `save.state` вне `try` → необработанный reject, кнопка «Продолжить» есть, но клик ничего не делает. Доказательство: инъекция `{"v":1,"data":{"settings":null,"session":{"v":1}}}` в IndexedDB → консоль `Uncaught (in promise)`, клик — no-op. Предложение: отклонять `data === undefined` в `parseSession`.
- Замечания (не блокеры, вынесены в BACKLOG → «Сохранение партии (итоги verify 12-a)»): дубль `isPersistable`+ложный комментарий; `GameSaveNode.settings: unknown | null` — `| null` избыточен; `createPlatform` не прокидывает `saves`; задел 12-c без потребителя; T10 не проверяет автоудаление при финише и возобновление хода компьютера напрямую (покрыто `session-save.test.ts`/`session.test.ts`).
- Не проверено: финиш партии (победа/поражение) в браузере → автоудаление снимка; `onblocked`/приватный режим IndexedDB (только `fake-indexeddb`).

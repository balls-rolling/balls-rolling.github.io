# PLAN — Подфаза 12-c: управление сохранениями

Родитель: фаза 12 (`12-save-restore/CONTEXT.md`, D10). В настройках две кнопки:
**«Стереть все данные»** (полная очистка, включая постоянный `playerId`, + перезапуск)
и **«Очистить сохранённые игры»** (диалог со списком). Тесты: **y**.

Волны: `T1 ∥ — → T2 → T3 → T4 → T5`.

## Задачи

### T1. Очистка в ядре хранилища: `KeyValueStore.clear()` + `GameSaves.clear()`
- Файлы: `src/core/storage/types.ts` (+`clear()`), `src/core/storage/store.ts` (`KeyValueStoreImpl.clear` — через `keys()` + `remove()`, чтобы не задеть чужие ключи origin и одинаково работать на всех бэкендах), `src/core/saves/save-store.ts` (`GameSaves.clear` — удалить все `game/<id>` через `listIds()`+`remove`), `store.test.ts`, `save-store.test.ts`.
- Зависит: нет. Тесты: **y** (очищает только `mini-games:*`/`game/*`, чужой ключ цел; пустое хранилище не падает).

### T2. `Platform`: кнопки формы, очистка, наличие данных
- Файлы: `src/core/platform/platform.ts`, `platform.test.ts`.
- Константы `GLOBAL_WIPE_CONTROL = "wipe-all-data"`, `GLOBAL_CLEAR_SAVES_CONTROL = "clear-saved-games"`; в `globalForm()` — группа «Данные» с двумя `control kind:"button"` (сброс — `variant:"danger"`).
- API: `clearAllData()` (сначала `#saves.clear()`, затем `#store.clear()`), `clearSavedGames(ids)` (`dropGameSave` по каждому), `hasAnyData()` (`#saves.listIds().length > 0` или есть ключ `global`).
- Зависит: T1. Тесты: **y** (`clearAllData` убирает `global` и `game/*`, чужой ключ цел; после сброса `loadGlobalSettings()` даёт **новый** `playerId`; `clearSavedGames` удаляет только выбранные; `hasAnyData`; форма содержит id кнопок).

### T3. Node-координатор списка сохранённых игр
- Файлы: `src/ui/saves/saved-games.ts` (новый, без `.vue`), `saved-games.test.ts`.
- `loadSavedGames(platform)` — `listSavedGames()` + сопоставление id с `platform.listGames()` (label, фолбэк — id), сортировка по label; `createSavesSelection(entries)` — `toggle(id)`, `removeIds()`, `hasChecked`; `applySavedGames(platform, selection)` — `clearSavedGames(removeIds())`.
- Зависит: T2. Тесты: **y** (фолбэк-лейбл, toggle, `removeIds`, применение через `Platform` на `MemoryBackend`).

### T4. Диалоги: очистка сохранённых игр и подтверждение полного сброса
- Файлы: `src/ui/saves/SavedGamesDialog.vue` (новый), `clear-saved-games.ts` (новый), `confirm-wipe.ts` (новый).
- `SavedGamesDialog.vue` — только вид: список с чекбоксами, «Удалить выбранные» (disabled без выбора), «Отмена».
- `clear-saved-games.ts` — `showClearSavedGames({ platform, dialog, onDone? })`: список пуст → `notify` и выход; иначе `dialog.show(SavedGamesDialog)`, по применению — `applySavedGames`, `dialog.back()`, `notify(success)`, `onDone()`; защита от повторного показа (`settled`).
- `confirm-wipe.ts` — `confirmWipeAllData({ platform, dialog, reload? })`: показ `ConfirmDialog` («все данные будут удалены безвозвратно»); по подтверждению `await platform.clearAllData()` и `(reload ?? (() => window.location.reload()))()`.
- Зависит: T2, T3. Тесты: **n** (`.vue`/браузер) — typecheck/build.

### T5. Проводка кнопок в `SettingsScreen.vue`
- Файлы: `src/ui/screens/SettingsScreen.vue`.
- При монтировании — `hasAnyData()`/`listSavedGames()` в refs `dataPresent`/`savesPresent`; расширить `disabled` (сброс без данных, очистка без сохранений); в `onEmit` по `signal === "press"`: очистка → `showClearSavedGames({ platform, dialog, onDone: refreshPresence })`; сброс → **отменить debounce-таймер**, затем `confirmWipeAllData({ platform, dialog })`; `refreshPresence()` пересчитывает наличие.
- Зависит: T2, T4. Тесты: **n** — typecheck/build + ручная проверка на verify.

## Решения
1. **Очистка через `keys()`/`remove()`, не бэкенд-`.clear()`** — уважает префикс `mini-games:`, не трогает чужие ключи origin, одинаково на Memory/localStorage/IDB/Fallback, тестируется в node.
2. **Два стора — два вызова.** `clearAllData()`: `#saves.clear()` (узлы `game/*`), затем `#store.clear()` (`global` и прочее); при IDB-фолбэке сохранения тоже снимутся.
3. **`playerId`**: отдельно не генерируем — `loadGlobalSettings()` уже выдаёт новый UUID при пустом значении; сброс лишь удаляет `global`.
4. **Кнопки — метаданные формы** (`globalForm`, синхронно, без Vue); асинхронная доступность — `disabled` в `SettingsScreen.vue`.
5. **Логика списка — отдельный node-модуль** (`saved-games.ts`), компонент только вид.
6. **`reload` инъектируем** в `confirm-wipe.ts` (по умолчанию `location.reload`).
7. **Перед сбросом отменяем debounce-запись** настроек, иначе `persist()` мог бы вернуть `global` после очистки.
8. **Без новых зависимостей; ядро без Vue/UI.**

## Риски
- `window.location.reload()` не покрыть unit (нет jsdom) — ручная проверка на verify; саму очистку покрывает `Platform.clearAllData` в node.
- `hasAnyData` на «прожитом» устройстве почти всегда `true` (ключ `global` пишется при первом чтении) — кнопка сброса может быть активна сразу; критерий уточнить при желании.
- `#store.clear()` шире, чем `global` (снимет и сохранения, попавшие в localStorage по фолбэку) — это ок для полного сброса; частичная очистка идёт только через `clearSavedGames(ids)`.
- Fallback-бэкенд: после «защёлки» `keys()` видит только запасной бэкенд — узкий крайний случай.
- Повторное нажатие/показ диалогов — защита `settled` (как в `confirm-new-game.ts`).

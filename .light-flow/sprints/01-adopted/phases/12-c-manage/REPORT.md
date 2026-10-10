# REPORT — Подфаза 12-c: управление сохранениями

Родитель: фаза 12 (`12-save-restore/CONTEXT.md`, D10). План: `phases/12-c-manage/PLAN.md`. Исполнено 5 задач из 5.

## Что сделано
- **T1. Очистка в ядре хранилища.** `KeyValueStore.clear()` (через `keys()` + `remove()` — чужие ключи origin не трогаются) и `GameSaves.clear()` (все узлы `game/<id>`).
- **T2. `Platform`.** Группа «Данные» в `globalForm()` с кнопками `clear-saved-games` и `wipe-all-data`; `clearAllData()` (сохранения + глобальные настройки, включая `playerId`), `clearSavedGames(ids)`, `hasAnyData()`.
- **T3. Координатор списка** `src/ui/saves/saved-games.ts`: `loadSavedGames` (id → название игры, фолбэк — id, сортировка) и `removeSavedGames`.
- **T4. Диалоги.** `SavedGamesDialog.vue` (список с отметками, «Удалить выбранные» / «Отмена»), `clear-saved-games.ts` (показ, применение, уведомление), `confirm-wipe.ts` (подтверждение, `clearAllData`, перезапуск; `reload` инъектируем).
- **T5. Проводка в `SettingsScreen.vue`.** Кнопки активны условно (`hasAnyData`/`listSavedGames`), перед сбросом отменяется debounce-запись.

## Изменённые / созданные файлы
- `src/core/storage/{types,store}.ts`, `src/core/saves/save-store.ts` (+`store.test.ts`, `save-store.test.ts`).
- `src/core/platform/{platform,index}.ts` (+`platform.test.ts`).
- `src/ui/saves/{saved-games.ts,saved-games.test.ts,SavedGamesDialog.vue,clear-saved-games.ts,confirm-wipe.ts}`.
- `src/ui/screens/SettingsScreen.vue`.

## Проверки
- `npm test` — **40 файлов / 280 тестов** (было 39 / 271; +9).
- `npm run typecheck` (vue-tsc + node/test tsconfig) — exit 0.
- `npm run build` (`vite build`) — успешно.
- **Браузерно** (localhost:5174): настройки показывают группу «Данные»; «Очистить сохранённые игры» disabled без сохранений и активна при наличии; диалог перечисляет сохранённую игру, удаление работает (уведомление), кнопка снова disabled; «Стереть все данные» активна при наличии данных.

## Отклонения от плана
- T3 упрощён: вместо `createSavesSelection`/`applySavedGames` — `loadSavedGames` + `removeSavedGames`; отметки живут в компоненте (реактивно), логика списка — в node-модуле.
- Тестовые срезы T1/T2/T3 покрыты в тех же тест-файлах (отдельных не заводилось).

## Непроверенное / риски
- `window.location.reload()` в `confirm-wipe` юнит-тестами не покрыт (нет jsdom) — проверена сама очистка (`Platform.clearAllData`), перезапуск — вручную.
- `hasAnyData` почти всегда `true` на «прожитом» устройстве (ключ `global` есть) — кнопка сброса может быть активна сразу; критерий при желании уточнить.
- `.vue` (SavedGamesDialog) и `SettingsScreen` юнит-тестами не покрыты.

## Проверка
- Дата: 2026-10-04
- Вердикт: **чисто** — 3 дефекта исправлены в этой же стадии и перепроверены.
- Исправлено (verify):
  1. **Повторное применение** очистки списка — `clear-saved-games.ts` получил флаг `applying` и `.catch/.finally` (ошибки сообщаются, диалог закрывается один раз).
  2. **Отмена полного сброса теряла свежие правки настроек** — debounce теперь отменяется/дожидается внутри `beforeClear` уже **после** подтверждения; добавлено ожидание текущей записи (`pendingPersist`).
  3. **Цепочки очистки без `.catch`** — необработанные отказы устранены (уведомление/закрытие).
  Плюс `hasAnyData` приведён к плану (ключ `global`) и убрана висячая ссылка в REPORT.
- Результат по пунктам:
  - соответствие плану → **ok** (T1–T5; `hasAnyData`/T3 — задокументированные уточнения).
  - мусор/баги → **ok** после правок; ложной доступности кнопок нет.
  - консистентность → **ok** статически: 40 файлов / 280 тестов; статусы синхронизированы.
  - противоречия PROJECT.md → **ok** (ядро без Vue, без новых зависимостей, очистка в пределах пространства имён).
  - объективные проверки → **ok**: `npm test` 40/280; `typecheck` exit 0; `vite build` успешно; **браузерно**: кнопки условно активны, выборочное удаление работает, полный сброс — «Отмена» сохраняет данные (тот же `playerId`), «Стереть» очищает и после перезагрузки выдаёт **новый** `playerId`, IndexedDB пуста.
- Не проверено: перезапуск покрыт вручную (браузер), не unit (нет jsdom); `.vue`/`SettingsScreen` юнит-тестами не покрыты. `dropGameSave` в проде не вызывается (замечание, вне 12-c).

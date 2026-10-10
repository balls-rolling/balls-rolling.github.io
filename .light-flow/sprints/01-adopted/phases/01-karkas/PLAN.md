# PLAN — Фаза 01: Каркас

Цель: рабочий каркас `vite + vue + ts + prettier` с токенами темы, палитрой ОС и заготовкой трёх слоёв. Тестового раннера нет (vitest — фаза 06), у всех задач `tests: n`; проверяемость в done-condition (сборка, типизация, браузер).

## Задачи (T1–T9)

- T1 — `package.json` + установка зависимостей. `engines.node = "^22.18.0 || >=24.12.0"`; скрипты `dev/build/preview/typecheck/format`.
- T2 — TS + Vite + точка входа: `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/vite-env.d.ts`, `src/App.vue`; алиас `@` → `src`.
- T3 — Prettier, совместимый с будущим ESLint (D6).
- T4 — токены темы и базовые стили в `styles/` (D1).
- T5 — палитра: системная тема и системный акцент в `core/` (D2); `applyPalette()` до `mount()`.
- T6 — три визуальных слоя и корневая сборка в `ui/shell/` (D1, D4); слой 1 без `<canvas>` (фаза 05).
- T7 — заготовка ядра: запись игры и список из `games/` через `import.meta.glob` (D2, D5).
- T8 — проверка критерия готовности фазы.
- T9 — фиксация в git (только по явному подтверждению пользователя).

Порядок: T1 → T2 → {T4 ‖ T5 ‖ T6 ‖ T7} → T8 → T9; T3 параллельно T4–T7.

## Затронутые файлы

Создано: `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.prettierrc.json`, `.prettierignore`,
`src/main.ts`, `src/vite-env.d.ts`, `src/App.vue`,
`src/styles/tokens.css`, `src/styles/base.css`,
`src/core/theme/palette.ts`, `src/core/theme/index.ts`,
`src/core/game/entry.ts`, `src/core/game/registry.ts`, `src/core/game/index.ts`,
`src/ui/shell/layers.css`, `src/ui/shell/LayerBoard.vue`, `LayerGameUi.vue`, `LayerDialogs.vue`, `RegistryPanel.vue`,
`src/games/.gitkeep`.
Не трогается: `.gitignore` (покрывает `node_modules`, `dist`, `*.log`, редакторы, кеш); исходник `C:\projects\light-flow\tic-tac`.

## Вынесено за фазу

Контракт `Game`, жизненный цикл сессии — 02; `Session`/`Player`/`Storage` — 02; `DialogManager`, меню, во весь экран — 03; `<canvas>` и Viewport — 05; игровые токены `--board-*` — 05/07; ESLint — по D6; vitest — 06; pinia — отменён.

## Риски

- Совместимость `typescript@6.0.3` + `vue-tsc@3.3.11` проверяется в T1; при ошибке фиксируется фактически заработавшая пара, решение не переносится на 02.
- Типизация `import.meta.glob` требует `"types": ["vite/client"]` в `tsconfig.json` (T2), иначе `vue-tsc` не примет запись из `registry.ts` (T7).

## Статус

Выполнено, см. `REPORT.md` → `## Проверка` (2026-10-03, вердикт: проблемы 6, все исправлены по команде пользователя).

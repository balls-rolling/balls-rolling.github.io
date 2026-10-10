# REPORT — Фаза 01: Каркас

План утверждён вызовом `/lf-next` (approval by invocation). Выполнены T1–T9; T9 (коммит) закрыт по явной команде пользователя.

## Что сделано

- Создан рабочий каркас: сборка `vite + vue + ts`, prettier, токены темы, палитра, заготовка трёх слоёв и реестр игр.
- Критерий готовности выполнен: `vue-tsc` без ошибок, `vite build` собирается, в браузере тема ОС light/dark и системный акцент.
- `npm install` — 46 пакетов, 0 уязвимостей, 0 peer-warning.
- `npm run typecheck` (`vue-tsc --noEmit`) — код 0, ноль ошибок/предупреждений.
- `npm run build` — код 0; `dist/`: `index.html`, css 2.38 kB, js 63.68 kB.
- `npm run format` повторно — 0 изменений (идемпотентно).
- Токены в собранном css: `--accent-ink`, `--accent-grad`, `--accent-hi`, `--accent-lo`, `--accent-ring`, `data-theme=dark`, `--bg-m3`, `--glow`; `--accent-ink` ровно 1 раз; `--board-*` отсутствуют.
- Браузер: три слоя, z-index 0/1/2, `position: absolute`; тема ОС `dark`→`light` на лету без перезагрузки; `--accent: rgb(0, 117, 255)` (реальный акцент Windows, не фолбэк `#3da96a` и не `canvastext`); `<canvas>` 0, `<dialog>` 0; реестр 0 → временный `probe` = 1 → 0; четыре каталога `core`/`ui`/`games`/`styles` на месте.
- `grep` по `src/core/` не нашёл имён игр (совпадения `probe` — DOM-пробник `AccentColor`, не игра).

## Файлы

Создано: `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.prettierrc.json`, `.prettierignore`, `src/main.ts`, `src/vite-env.d.ts`, `src/App.vue`, `src/styles/{tokens.css,base.css}`, `src/core/theme/{palette.ts,index.ts}`, `src/core/game/{entry.ts,registry.ts,index.ts}`, `src/ui/shell/{layers.css,LayerBoard.vue,LayerGameUi.vue,LayerDialogs.vue,RegistryPanel.vue}`, `src/games/.gitkeep`.
Не изменялось: `.gitignore`; исходник `C:\projects\light-flow\tic-tac`.

## Отклонения от плана

1. `tsconfig.node.json` менялся дважды: `types:["node"]` без `@types/node`; вторая версия не компилировалась (TS6306/TS6310). Исправлено при verify — см. «Правки по итогам verify» п.3. Итог: `references` убран из основного `tsconfig.json`, `tsconfig.node.json` самостоятелен (`types:["node"]`, `noEmit`), добавлен `@types/node`, `typecheck` проверяет оба проекта; ранее `vite.config.ts` не проверялся вовсе.
2. `baseUrl` убран из `tsconfig.json`: TS 6.0.3 объявляет опцию устаревшей (TS5101); алиас `@/*` работает и без неё.
3. T5 выполнена раньше планового порядка: `main.ts` импортирует `@/core/theme`. Порядок T2 → T5 → T4, содержание не изменилось.
4. `RegistryPanel.vue` создан вместе с T7: без него работа реестра ненаблюдаема, тестового раннера нет.
5. `grep` «ядро не знает игр» даёт ложные срабатывания на `probe` — имя скрытого DOM-элемента для чтения `AccentColor` (`palette.js:7`); проверка выполнена вручную.

## Фиксация в git

- `751c415` — «Фаза 01: каркас платформы», 31 файл (`package.json`, `package-lock.json`, конфиги, весь `src/`, документы `.light-flow`); `node_modules`/`dist` не попали.
- `99a5708` — «Нормализация переводов строк в LF», добавлен `.gitattributes` (без него Windows переводит рабочую копию в CRLF и диффы засоряются).
- `5a9e0f4` — «Фаза 01 закрыта: отчёт, STATE, ROADMAP».
Пуш не выполнялся; ветка `main`, три коммита, рабочая копия чистая.

## Правки по итогам verify

1. `pointer-events: none` стоял на всех трёх слоях (`ui/shell/layers.css:15`), клик проходил сквозь все слои. Разложено: слой 1 `auto`; слой 2 `none` на контейнере, `auto` на детях; слой 3 `none` (блокировку под собой обеспечивает модальный `<dialog>`, `z-index` не участвует); метка слоя `none`.
2. Запрет контекстного меню (`js/app.js:15-18`) не был перенесён. Добавлен в `src/main.ts`: блокировка везде, кроме полей ввода (paste нужен для кодов приглашений в фазе 09).
3. `vite.config.ts` не проверялся типизацией — реальная дыра: `vue-tsc --noEmit` покрывал только `src/`, `references` не собирался; `vite.config.ts` падал с TS2591 (`node:url`) и TS2339 (`import.meta.url`). Исправлено (см. «Отклонения» п.1); `typecheck` = `vue-tsc --noEmit && tsc -p tsconfig.node.json --noEmit`; `--listFiles` подтверждает `vite.config.ts` в программе.
4. Мёртвый код: `palette.ts:38` ставил `--accent-base`, нигде не читаемый. Удалён.
5. Противоречия документов: закрыты `pinia` (D6) и «набор заглушек» (D3) в `BACKLOG.md`; `RegistryPanel.vue` заведён в бэклог; исправлены устаревшие утверждения отчёта (T9 «ждёт», «два коммита», node-типы) и заметка `STATE.md` про `lf-analyst`.
6. Ресёрч диалогов (MDN/BCD), повлиял на сделанное: `showModal()` блокирует вне диалога всё (клики, фокус), ручная блокировка не нужна, `z-index` не участвует; `closedby` без атрибута для `showModal()` даёт `closerequest` (Esc закрывает) — ставить явно; поддержка `closedby`: Chrome 134, Firefox 141, Safari preview, нужен второй барьер через `cancel`; `requestClose()` для отменяемых закрытий; есть Invoker Commands API.

## Проверка
- Дата: 2026-10-03
- Вердикт: проблемы: 6 (все исправлены в ходе проверки по команде пользователя)
- Результат по пунктам:
  - A. Соответствие плану T1–T9 → ok (T1–T8 подтверждены кодом и командами; T9 закрыт тремя коммитами)
  - B. Мусор в коде и артефактах → problem → ok после исправления (`palette.ts:38` — мёртвый `--accent-base`, удалён)
  - C. Согласованность документов → problem → ok после исправления (`REPORT.md:4,106,159` — устаревший T9, число коммитов, node-типы; `BACKLOG.md:15,22-24` — `pinia` и заглушки держались открытыми после решения; `RegistryPanel.vue` обещан в бэклог, но не заведён; `STATE.md` — неверная заметка про `lf-analyst`)
  - D. Противоречия PROJECT.md → ok (ядро не знает игр и UI, `--board-*` не в платформенной теме, заглушки отменены — проверено grep по `src/`)
  - E. Хвосты → problem → ok после исправления (`vite.config.ts` не проверялся типизацией и падал с TS2591/TS2339; `RegistryPanel.vue` не в бэклоге)
  - F. Off-track → ok (работ фаз 02–07 нет, лишних зависимостей нет)
- Не проверено: поведение на реальных мобильных устройствах (не подключалось); `npm run preview` в CI (CI не настроен, деплой — фаза 10); неизменность внешнего исходника `C:\projects\light-flow\tic-tac` (базовой ревизии нет, каталог не под нашим git — проверено чтением).
- Объективные доказательства: `npm run typecheck` (оба проекта) — код 0; `npm run build` — код 0; `tsc -p tsconfig.node.json --listFiles` содержит `vite.config.ts` и `@types/node` (до правки — TS2591/TS2339); браузер (headless, `npm run preview`): `theme=dark`→`light` на лету, `--accent=rgb(0,117,255)`, `--accent-base` пусто, `pointer-events` board `auto`/ui `none`/dialogs `none`/panel `auto`, z-index 0/1/2, `elementFromPoint` в центре → слой 1, canvas 0, dialog 0, реестр «0»; `npm run format` — 0 изменений.

## Открытые хвосты

- `RegistryPanel.vue` — временная проверочная панель; судьба (переезд в отладочный HUD фазы 05 или удаление) не решена, заведена в бэклог.
- По плану за фазой: контракт `Game` и жизненный цикл (02), `Session`/`Player`/`Storage` (02), наполнение слоёв и `DialogManager` (03), `<canvas>` и Viewport (05), vitest (06), ESLint.

# PLAN — Фаза 11: сетевое лобби

Основание: `.light-flow/phases/11-net-lobby/CONTEXT.md` (D1–D9).

**Флаг тестов: `y`** — в node: лобби-протокол, реестр состава, парсер ссылки/
`open`-query и валидация; UI/WebRTC/QR/скан — вручную в браузере.

**Статус:** выполнено (T1–T8). **Итог:** 175 тестов / 30 файлов зелёные.

8 задач. Граф: `{T1,T2,T3}` → T4 → `{T5,T7}` → T6 → T8.

## Задачи

- **T1. Лобби-протокол и реестр состава (ядро)** — **(new)**
  `src/core/net/lobby-protocol.ts`, `lobby-roster.ts` (+tests); **(edit)**
  `src/core/net/index.ts`. `LobbyPlayer {id; name}`; `LobbyMessage` — `join{name}`·
  `players{players}`·`kick{id}`·`start{players}`·`leave{id}`·`rematch-offer/accept/
  decline` (не пересекается с игровым `protocol.ts`). `applyLobbyMessage(msg, api)`
  с валидацией (имя/id до 40, `players` — массив корректных). `LobbyRoster`
  (истина хоста): `add(name)→id` (`p2…`), `remove(id)`, `has`, `list()` (хост
  первым). tests y.
- **T2. Ссылка-приглашение и `open`-query** — **(new)**
  `src/core/net/invite-link.ts` (+test), `src/ui/screens/open.ts` (+test);
  **(edit)** `src/core/net/index.ts`, `src/ui/screens/index.ts`.
  `buildInviteLink(params, base)`/`parseInviteLink(href)` — `URLSearchParams`,
  `open=net_game`, `game_id`, `offer` (base64url); ядро не читает `location`.
  `ui/screens/open.ts`: `parseOpenQuery`, `registerOpenHandler`, `hasOpenHandler`,
  `runOpen`. tests y.
- **T3. QR: генерация и скан** — **(new)** `src/ui/net/QrInvite.vue`,
  `QrScanner.vue`; **(edit)** `package.json` (+`qrcode.vue@3.11.0`),
  `src/ui/net/index.ts`. `QrInvite` — SVG через `qrcode.vue` (коррекция **L/M**,
  крупный рендер: код ~800–850 байт читается). `QrScanner` — по feature-detect
  `BarcodeDetector` + `getUserMedia`, без библиотеки; без API не рендерится. Обе
  стороны: хост — QR приглашения, гость — QR ответа. tests n. Цена: +1 runtime
  (MIT, 0 транзитивных, peer `vue`, TS-типы, SVG).
- **T4. Оркестраторы лобби хост/гость** — **(edit)** `src/ui/lobby/net.ts`,
  `src/ui/lobby/index.ts`, `src/ui/environment.ts`, `src/ui/screens/SetupScreen.vue`;
  **(new)** `src/ui/lobby/net.test.ts`. `NetworkLobbyDeps` + `notifications` и
  инжектируемые `createHost?`/`createGuest?` (тесты без WebRTC). Хост: offer →
  ссылка/код, приём ответа, `accept`; `join`→`LobbyRoster.add`→`players`; `kick`→
  удаление + `players` + `kick` выгнанному; «Начать»→`start`+`resolve(PlayerInit[])`
  (`p1` local, `p2` remote); транспорт не закрывается (в `netLink`). Гость: `offer`
  (или код)→`startGuest`→answer-код→лобби ожидания; `players`→показ; `start`→
  `resolve`; `kick`→уведомление + `resolve(null)`; `leave`→`resolve(null)`.
  Подписки снимаются на старте/отмене. tests y (парные `FakeTransport`).
- **T5. UI лобби (хост и гость)** — **(new)** `src/ui/lobby/LobbyView.vue`;
  **(edit)** `net.ts`, `CodeExchangeView.vue`, `src/ui/lobby/index.ts`, при
  необходимости `primitives.css`. Хост: ссылка (копирование) + `QrInvite` +
  скан/поле ответа; список игроков, «Выгнать»; «Начать» `disabled` при `<2`.
  Гость: лобби ожидания (список только для чтения) + QR ответного кода +
  текстовый код + «Выйти». Колбэки `onKick/onStart/onLeave/onAnswer/onScan`.
  Состояния загрузки/disabled — принцип 11 PROJECT. tests n.
- **T6. Deep-link `net_game`** — **(edit)** `src/ui/screens/navigation.ts`,
  `src/main.ts`, `SetupScreen.vue`, `src/ui/environment.ts`,
  `src/core/game/environment.ts`, `src/games/tic-tac/game.ts`, `index.html`.
  `GameOpenOptions { net?: { offer } }`; `openGame(entry, options?)`. `main.ts`:
  обработчик `net_game` ищет игру по `game_id`, зовёт `openGame` с `offer`; после —
  `history.replaceState` без query; ошибка → обычная загрузка + уведомление.
  `GameEnvironment.open?`, `LobbyOptions.offer?`; tic-tac при `offer` автозапускает
  гостя. `index.html`: `<meta name="referrer" content="no-referrer">`. tests n
  (парсер — T2).
- **T7. Реванш** — **(new)** `src/ui/lobby/rematch.ts`; **(edit)**
  `src/ui/games/tic-tac/ResultDialog.vue`, `TicTacToeUi.vue`.
  `createRematch({transport, isHost, onRestart, onDecline})`: хост шлёт
  `rematch-offer`; гость показывает диалог; accept → `rematch-accept` + `restart`
  у обеих сторон; decline — партия завершена. «Я хост» — локальный `p1`. tests n
  (сообщения — T1).
- **T8. Сквозной тест лобби + финальные проверки** — **(new)**
  `src/ui/lobby/lobby-flow.test.ts`. Пара связанных in-memory `Transport`,
  инжект в `NetworkLobbyDeps`: подключение → `players` с обеих сторон → `kick`
  (уведомление, состав сокращён) → `start` → корректные `PlayerInit[]` (порядок/id
  совпадают). `npm test`/`typecheck`/`build`/`format`. tests y.

## Решения

- **Лобби-протокол — отдельный модуль ядра**; игровой `protocol.ts` не трогаем (D5).
  Пробелы сообщений не пересекаются. Отвергнуто: смешать.
- **Состав — `LobbyRoster`** (хост — истина, D1); id `p1/p2…` и порядок совпадают
  через `players`/`start` (D5). Отвергнуто: список у каждого.
- **Лобби-подписки живут до `start`**, затем транспорт уходит в `netLink`; реванш —
  лобби-сообщения параллельно игровому. Отвергнуто: игровой протокол о лобби.
- **Оркестраторы принимают `createHost/Guest`** — тестируемость без WebRTC.
- **Ссылка — query `open=net_game`** (D6) с платформенным реестром обработчиков;
  очистка `history.replaceState`; фрагмент `#` рассмотрен и отвергнут (ломает
  единый разбор и `Reference`-семантику). `Referrer-Policy: no-referrer`.
- **`offer` = код `encodeInvite`** (base64url URL-safe). Обратный канал ответа —
  ручной код (вне объёма — автоответ ссылкой).
- **QR-генерация — `qrcode.vue@3.11.0`** (нативного генератора нет), коррекция L/M;
  **скан — только `BarcodeDetector`** по feature-detect, без библиотеки
  (Firefox/Safari — нет API). QR в обе стороны + текстовый код как запас.
- **Уведомления о выгоне** — `NotificationCenter` через `LobbyDeps`/`EnvironmentDeps`.
- Зависимости с ценой: `qrcode.vue` — единственная новая (MIT, 0 транзитивных).

## Проверка фазы

1. `npm test` — `lobby-protocol`, `lobby-roster`, `invite-link`, `open`, лобби-тест,
   `lobby-flow`; архитектурный тест зелёный. `typecheck`/`build`.
2. **Две вкладки:** хост создаёт лобби → ссылка; гость открывает → лобби ожидания,
   видит состав; выгон → состав обновлён, выгнанный получил уведомление и ушёл в
   меню; повторное подключение → «Начать» → партия у обоих (старт **только** по
   кнопке); выход гостя до старта; после партии — реванш.
3. **QR:** генерация приглашения (хост); гость показывает QR ответа; скан в Chrome
   (обе стороны), в Firefox/Safari кнопок скана нет — текстовый код.
4. **`open`:** нераспознанный query очищает URL; битый `offer` → обычная загрузка +
   уведомление; `Referrer-Policy` в `index.html`.
5. **Ограничение среды:** WebRTC в песочнице не поднимается (0 ICE) — сетевой
   сценарий вручную; логика — парными транспортами (T8); иначе в REPORT.

## Вне объёма

Разрыв/восстановление (`resume`, сохранение после хода, лобби восстановления) —
фаза 12 (D9). Сеть >2 WebRTC-пиров — протокол универсален, проводка одного
удалённого; проверка на двух. Редактирование имён, деплой (13), i18n, тач.
Обобщение игрового `move {x,y}` (BACKLOG). Автоответ ссылкой от гостя.

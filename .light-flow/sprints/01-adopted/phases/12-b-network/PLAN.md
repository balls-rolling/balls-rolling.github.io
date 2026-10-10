# PLAN — Подфаза 12-b: сетевое восстановление партии

Родитель: фаза 12 «сохранение и восстановление партии» (`12-save-restore/CONTEXT.md`,
D9). Опора — 12-a: `core/saves`, `Platform.resumeSession`, `attachSessionSave`,
`resumeGame`, узел `game/<id>`. Тесты фазы: **y**.

**Сквозной сценарий:** хост нажимает «Продолжить» у сетевой партии → лобби
восстановления с предопределённым составом → свежая ссылка/QR → гость
подключается и сверяется по id → хост «Начать» → оба продолжают с локальных
снимков. Живой WebRTC в среде не поднимается — проверка через
`FakeTransport`/`LocalTransport` (риск).

Волны: `T1 ∥ T2 ∥ T5 → T3 ∥ T4 → T6 → T7 → T8 → T9`.

## Задачи

### T1. Идентичность на проводе — codec/protocol/lobby-protocol
Аддитивные опциональные поля, версия 1 не поднимается (отсутствие = «не проверяем»).
- Файлы: `src/core/net/codec.ts` (`Invite` += `restore?`, `playerId?`, `sessionId?`; `decodeInvite` опускает отсутствующие ключи), `src/core/net/protocol.ts` (`hello.playerId?`; `NetApi.setPeerName(name, id?)`), `src/core/net/lobby-protocol.ts` (`join.id?`; `LobbyApi.join(name, id?)`), `src/core/net/index.ts` (экспорт при необходимости).
- Зависит: нет. Тесты: **y** (`codec.test.ts` — roundtrip с restore/id и без появления пустых ключей, мусор → `BadCodeError`; `protocol.test.ts`, `lobby-protocol.test.ts` — id с/без).

### T2. Предопределённый состав в `LobbyRoster`
- Файлы: `src/core/net/lobby-roster.ts`, `lobby-roster.test.ts`.
- API: `constructor(hostName, preset?: readonly LobbyPlayer[])`; `readonly isPreset`; `admit(id): boolean` (только preset и ожидаемый, однократно); `disconnect(id)` (снимает участие, не удаляя из состава); `isComplete()`; поведение без preset — прежнее. Форма `LobbyPlayer` и `list()` не меняются.
- Зависит: нет. Тесты: **y** (admit/повтор/чужой; `isComplete`; `disconnect`; без preset — без регрессий).

### T3. Режим восстановления в оркестраторах лобби
- Файлы: `src/ui/lobby/session.ts`, `session.test.ts`.
- `HostLobbySession(name, transport, callbacks, options?: { preset? })`: при `preset` `join(name, id?)` → `roster.admit(id)`, отказ — игнор; обрыв → `disconnect` (состав сохраняется); `canStart` = `isComplete()`; без preset — как в фазе 11.
- `GuestLobbySession(..., options?: { playerId? })` → `join()` шлёт id.
- Зависит: T1, T2. Тесты: **y** (на `FakeTransport.pair()`: допуск по id, отказ чужому, `canStart`, обрыв; обычный режим без изменений).

### T4. Сверка личности в `NetLink`
- Файлы: `src/ui/net/link.ts`, `link.test.ts`.
- `NetLinkConfig` += `ownPlayerId?`; `hello` несёт `playerId`; входящий `hello` с несовпавшим `playerId` при заданном `remotePlayerId` → `peerLeft`, без переименования; без id — мягко принимаем.
- Зависит: T1. Тесты: **y**.

### T5. Сохранение сетевых партий + единый предикат
- Файлы: `src/ui/session-save.ts` (`isPersistable` больше не исключает `transport === "remote"`; комментарий обновлён), `session-save.test.ts` (remote-сессия persistable), `src/ui/game-menu/GameMenu.vue` (инлайн-проверка → `isPersistable(session)`; закрывает дубль из verify 12-a).
- Зависит: нет. Тесты: **y** (demo → false; remote-люди → true; запись сетевой `running` и удаление при `finished`). Vue-склейка — **n** (typecheck/build).

### T6. UI лобби восстановления (отдельно от фазы 11)
- Файлы: `src/ui/lobby/restore.ts` (new, типы без Vue: `RestoreLobby`, `RestoreLobbyResult`), `src/ui/lobby/restore-net.ts` (new: `startHost/startGuest` + `Host/GuestLobbySession` с `preset`/`playerId`; свежий SDP через `encodeInvite` с `restore:true`, `playerId`, `sessionId`; ссылка/QR; гость ждёт `start`), `src/ui/lobby/types.ts` (аддитивно `restore?`, `canStart?`, `waiting?`), `src/ui/lobby/LobbyView.vue` (заголовок/пояснение, «Начать» по `canStart`, «Ожидание хоста», кик скрыт), `src/ui/lobby/index.ts` (`Lobby & RestoreLobby`).
- Зависит: T3, T4. Тесты: **n** (только `.vue`/WebRTC-склейка; поведение — T7/T9).

### T7. Координатор восстановления (node-тестируемый)
- Файлы: `src/ui/resume-net-game.ts` (new, без `.vue`), `resume-net-game.test.ts`.
- `resumeNetworkHost(entry, deps)`: `createGame` → `resumeSession` (не `running`/нет → `false`); human-local обязан быть `p1`; `preset` из `snapshot().players`; `restoreLobby.showHostRestore`; отмена → `session.destroy()` и `false`; иначе `netLink.configure({transport, remotePlayerId:"p2", ownPlayerId})`, `sessionHost.set`, `netLink.attach`, `attachSessionSave`, `session.resume()`, `lastGameId`, `dialog.close()`, `true`.
- `resumeNetworkGuest(entry, offer, deps)`: `showClientRestore` → `createGame`/`resumeSession` → сверить human-local id с ожидаемым (иначе `false` + закрыть транспорт) → configure/set/attach/save/resume.
- Зависит: T5, T6. Тесты: **y** (успех, отмена, несовпадение id, нет сохранения; проверка вызовов на фейках).

### T8. Маршрутизация: «Продолжить» хоста и deep-link гостя
- Файлы: `src/ui/resume-game.ts` (`ResumeGameDeps` += `netLink?`, `restoreLobby?`; снимок с `transport:"remote"` → `resumeNetworkHost`, иначе локальный путь), `src/main.ts` (opener при `resume` передаёт `netLink`/`restoreLobby`; обработчик `net_game` async: `decodeInvite(..., expectedRole:"host")`, при `restore` → `resumeNetworkGuest`, иначе прежний `openGame`; ошибка декода → прежнее поведение).
- Зависит: T7. Тесты: **y** (`resume-game.test.ts` — сетевой снимок уходит в `restoreLobby`, локальный — как раньше); `main.ts` — **n** (typecheck/build + браузер).

### T9. Интеграционный тест сетевого восстановления
- Файлы: `src/ui/net-restore.test.ts` (new).
- Два «устройства» (`MemoryBackend` + `GameSaves`/`Platform`); stub-игра с сериализацией; снимки `p1 local/p2 remote` и `p1 remote/p2 local`; `FakeTransport`-пара в фейковом `RestoreLobby`; `resumeNetworkHost` + `resumeNetworkGuest`; после старта — обмен ходом; проверить совпадение состояния/очереди, рост `revision`, перезапись снимка, повторный `resumeSession`.
- Зависит: T7, T8. Тесты: **y**.

## Решения
1. **Лобби восстановления — отдельные `restore.ts`/`restore-net.ts`.** Фаза-11 `ui/lobby/net.ts` не правится — меньше риск регрессии лобби/реванша; переиспользуются `LobbyView`, `startHost/startGuest`, `encodeInvite`.
2. **Идентичность — опциональные поля протокола версии 1** (`Invite.restore/playerId/sessionId`, `join.id`, `hello.playerId`): отсутствие = мягкая проверка, старые клиенты не ломаются.
3. **Предопределённый состав — внутренний набор «допущенных» в `LobbyRoster`.** Форма `LobbyPlayer`/сообщения не меняются; готовность — `canStart`.
4. **Роль хоста — human-local в снимке = `p1`** (рамки 2 игроков). Гость восстанавливается только по свежей ссылке.
5. **Восстановление = локальный `resumeSession` у каждой стороны** + свежий транспорт в `NetLink` + `resume()`. Игровое состояние по сети **не** передаётся (D2/D9) — у каждого свой снимок.
6. **Сетевые партии сохраняются:** `isPersistable` не исключает `remote`; явный выход удаляет снимок через общий предикат (D7).
7. **Свежий SDP полным рукопожатием** (`startHost`/`startGuest`); `restartIce` не нужен — старый `RTCPeerConnection`/DataChannel мёртв, переиспользовать нельзя.
8. **Библиотек не добавляем.** Тесты — существующие зависимости (`vitest`, `fake-indexeddb`), ручной `FakeTransport`/`LocalTransport`.

## Риски
- Живой WebRTC в среде не проверяется (0 ICE) — автотесты только фейки/локальный транспорт; браузерный сценарий на verify обязателен.
- У гостя нет локального снимка (очищены данные/другое устройство) → восстановление невозможно по замыслу; без полировки пользователь не поймёт причину.
- Роль хоста по `p1` — под 2 игроков; при расширении состава сломается (вне объёма).
- `decodeInvite` должен опускать отсутствующие ключи, иначе упадут существующие roundtrip-тесты `codec`.
- Мягкая проверка `hello` без `playerId` не ловит чужого — компромисс совместимости.
- Смена `isPersistable` усиливает запись в IDB для сети и меняет выход из сетевой партии — покрыто T5.
- `main.ts` и `.vue` не покрыты юнит-тестами (нет jsdom/плагина) — typecheck/build + браузер.

## Вне объёма (отложено)
- Полировка: уведомления/тексты при отсутствии снимка и несовпадении id (T10 у планировщика) — в BACKLOG.
- Подъём версии протокола/кодека, состав >2 игроков, автопереподключение/watchdog и `restartIce` при живом side-channel.
- UI управления сохранениями и «Стереть все данные» — подфаза **12-c**.

## Доработка (переоткрытие 12-b под изначальный замысел, 2026-10-04)

Причина: реализация 12-b отклонилась от замысла (см. дополнение к CONTEXT, D11–D15). Ниже — задачи приведения к правильному поведению. Тесты: **y**.

- **R1. Только хост хранит сетевую партию.** `src/ui/session-save.ts`: `isPersistable` для сетевой сессии (есть игрок с `transport:"remote"`) истинно только если локальный игрок — `p1` (хост); у гостя снимок не пишется и «Продолжить» не появляется. Локальные (не сетевые) — как раньше. Тесты `session-save.test.ts`.
- **R2. Сообщение протокола `sync` (хост→гость).** `src/core/net/protocol.ts`: `{ t:"sync", save: <состояние игры + очередь + победитель + игроки> }`, `NetApi.applyRemoteState(save)`. Тесты `protocol.test.ts`.
- **R3. `Session`: приём состояния.** `src/core/session/session.ts` + `types.ts`: метод `adoptState(save)` — заменяет `#gameState`/`#currentPlayerId`/`#winnerId`/`#status` из полученного снимка, без `createInitialState`; уведомляет подписчиков. Тесты `session.test.ts`.
- **R4. Детект обрыва + диалоги.** Наблюдение `NetLink.status`/`peerLeft` во время сетевой партии; диалог у гостя («соединение потеряно», «Покинуть игру») и у хоста («соперник отключился», «Восстановить»/«Покинуть»). Файлы: `src/ui/game-menu/*`/`src/ui/games/tic-tac/*`, новый компонент диалога; тесты — логика координатора, `.vue` — typecheck/build.
- **R5. Хост: действие «Восстановить»** из диалога → лобби восстановления (`showHostRestore`), свежая ссылка, ожидание гостя. Файлы: `resume-net-game.ts` / UI-координатор.
- **R6. Гость подключается заново** по свежей ссылке (без локального снимка): `resumeNetworkGuest`/`showClientRestore` больше не требуют сохранения у гостя; после подключения хост шлёт `sync`, гость применяет (`adoptState`) и продолжает.
- **R7. Фикс D1** — закрытие диалога лобби восстановления у гостя при выходе/кике (`restore-net.ts`).
- **R8. Тесты/интеграция** — `sync`, `adoptState`, host-only `isPersistable`, сквозной сценарий на `FakeTransport`: обрыв → восстановление → состояние совпало; тест `net-restore.test.ts` обновить.

Порядок: `R1 ∥ R2 ∥ R7 → R3 → R4 ∥ R6 → R5 → R8`.

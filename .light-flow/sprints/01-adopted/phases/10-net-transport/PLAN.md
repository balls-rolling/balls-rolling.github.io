# PLAN — Фаза 10: сеть A (Transport + протокол + ходы)

**Флаг тестов: `y`** — в node: `Transport`, `LocalTransport`, кодек приглашения,
протокол, UI-мост `NetLink` (фейковый транспорт). WebRTC и экран обмена кодами —
вручную в браузере (две вкладки).

**Статус:** выполнено (T1–T9). **Итог:** 158 тестов / 25 файлов зелёные.

Слои: **core** `src/core/net/**` (`Transport`, `LocalTransport`, кодек, протокол;
без DOM/Vue — под `architecture.test.ts`); **net** `src/net/**` (WebRTC/DOM);
**ui** (лобби, экран кодов, `NetLink`); **games/tic-tac + ui/games/tic-tac**.

Порядок: T1–T3 независимы; T4 → T5 → T6 → T7 → T8 → T9.

## Задачи

- **T1. `Transport` + `LocalTransport`** — `src/core/net/transport.ts`,
  `local-transport.ts` (+test). `TransportState = idle|connecting|open|closed|failed`;
  `Transport { state; send; onMessage; onState; close }`; `LocalTransport` (D8):
  старт `open`, `send` no-op, рабочие отписки, `close()→closed`, send после
  закрытия не бросает. tests y.
- **T2. Кодек приглашения** — `src/core/net/codec.ts` (+test). `BadCodeError`;
  `encodeBase64Url`/`decodeBase64Url` (TextEncoder + btoa/atob, RFC 4648 §5,
  восстановление паддинга, без escape/unescape). `InviteSdp = {type: offer|answer;
  sdp}` (структурный). `Invite = {v; game; role: host|guest; name; sdp}`.
  `encodeInvite`; `decodeInvite(code,{games,version,expectedRole})` — trim/декод/
  JSON.parse, проверки `v`, `game ∈ games`, `role`, `name` (срез 40), `sdp.type`,
  `sdp.sdp` начинается с `v=0`; иначе `BadCodeError`. Подписи нет (D4). tests y.
- **T3. Протокол + `Session.concede`** — `src/core/net/protocol.ts` (+test);
  **(edit)** `src/core/session/session.ts` (+`concede`), `session.test.ts`.
  `PROTOCOL_VERSION = 1`; `NetMessage = hello|move|surrender|bye` (D5; `rematch-*` —
  фаза 11). `NetApi { setPeerName; remoteMove; remoteSurrender; peerLeft }`.
  `applyNetMessage(message, api): boolean` (порт `net/protocol.js` без rematch).
  `Session.concede(playerId)` — завершает партию, `winnerId`=соперник (2 игрока),
  сброс таймера, уведомление подписчиков. tests y.
- **T4. Баррель + интеграционный тест** — `src/core/net/index.ts`, `net.test.ts`.
  Баррель: `Transport`, `TransportState`, `LocalTransport`, кодек, `NetMessage`/
  `NetApi`/`PROTOCOL_VERSION`/`applyNetMessage`. Тест: реальная `Session` tic-tac
  `p1` (human/local) + `p2` (human/remote), входящие через `applyNetMessage`;
  roundtrip `encodeInvite`/`decodeInvite` (SDP `v=0...`). Зависит T1–T3. tests y.
- **T5. WebRTC-транспорт** (порт `net/rtc.js`) — `src/net/webrtc.ts`,
  `src/net/index.ts`. `WebRtcTransport implements Transport`: очередь отправки до
  `open` (MDN sendMessage pattern), флаш при `open`, `state` из dc/pc, `onMessage`
  (JSON.parse, мусор игнорируется), `close()`. `waitIce(pc, timeout=4000)` —
  null-кандидат/`complete`/таймаут, не бросает. `startHost(): {transport;
  description; accept(desc)}` — DataChannel «game» ordered, offer, мягкое ожидание
  ICE. `startGuest(offer): {transport; description}` — `ondatachannel`, answer, ICE;
  **ответ сразу после сбора ICE, без ожидания `open`** (дедлок). `disconnected`
  транзиентно, `failed` терминально. net знает только SDP (метаданные — UI, T7).
  Зависит T1. tests n.
- **T6. UI-мост `NetLink`** (D6) — `src/ui/net/link.ts`, `index.ts`, `link.test.ts`.
  `NetLinkConfig { transport; ownPlayerId; remotePlayerId; ownName }`. `NetLink
  { transport: ShallowRef<Transport|null>; status; peerLeft; configure;
  attach(session); sendMove(move); detach }`. `attach`: `onMessage`→
  `applyNetMessage` (hello→renamePlayer, move→makeMove(remoteId,{x,y}),
  surrender→concede(remoteId), bye→peerLeft); `onState`→status; шлёт `hello`.
  `sendMove` шлёт `{t:"move",x,y}` при `open`. `detach` — отписки, `bye`,
  `transport.close()`. `netLinkKey` + `createNetLink()`. Зависит T1,T3,T4. tests y.
- **T7. Лобби + экран обмена кодами** (D7) — `src/ui/lobby/net.ts`,
  `CodeExchangeView.vue`; **(edit)** `src/ui/lobby/index.ts`.
  `createNetworkLobby({platform, dialog, netLink, gameId})` → `showHost`/`showClient`.
  Хост: `startHost`→`encodeInvite`→экран (host)→ввод ответа→
  `decodeInvite(expectedRole:guest)`→`host.accept`→`netLink.configure`→состав
  `[p1 local, p2 remote]`. Гость: ввод приглашения→`decodeInvite(expectedRole:host)`
  →`startGuest`→ответный код→«Продолжить»→`configure`→`[p1 remote, p2 local]`.
  Ошибка кода — текст в экране, промис не завершён; `handle.destroy`→`null`.
  `index.ts`: `createLobby` = defaultPlayers + сетевое лобби. Зависит T2,T5,T6. tests n.
- **T8. Проводка UI, снятие локального экрана состава** — **(edit)** `src/main.ts`
  (provide `netLinkKey`), `SetupScreen.vue`; **(delete)** `src/ui/lobby/local.ts`,
  `LobbyView.vue`; **(edit)** `src/ui/lobby/index.ts`. `createNetLink()` в
  composition root. Локальный экран ручного состава снят (хот-сит/ИИ через
  `defaultPlayers`); лобби-UI — фаза 11. Зависит T6,T7. tests n.
- **T9. Кнопки хост/гость и мост ходов** — **(edit)** `src/games/tic-tac/game.ts`
  (группа «Сеть», кнопки host/join → `showHost`/`showClient`→`launch`, ошибки не
  роняют), `src/ui/games/tic-tac/TicTacToeUi.vue` (инжект `netLinkKey`; `attach`
  при транспорте; в `onPick` после `makeMove` — `sendMove(cell)`;
  `onScopeDispose`→`detach`). Зависит T8. tests n.

## Решения

- **D1 Разбиение:** фаза 10 — транспорт+протокол+ходы+минимальный обмен кодами;
  фаза 11 — лобби, QR, реванш; деплой сдвинут на 12. Отвергнуто: одна фаза.
- **D2 `Transport` в ядре** (PROJECT.md:86-89,127-128,159). Отвергнуто: протокол
  в сессии.
- **D3 WebRTC — порт `net/rtc.js:1-125`** (PROJECT.md:124-127), без trickle, мягкое
  ICE, ответ сразу. Отвергнуто: свой сигналинг-сервер.
- **D4 Формат: SDP + метаданные**, base64url, структурная проверка, без подписи.
  Отвергнуто: только SDP; подпись (BACKLOG.md:9-11).
- **D5 Сообщения `hello/move({x,y})/surrender/bye`; host=p1(X), guest=p2(O)**, id и
  порядок совпадают; `rematch-*` — фаза 11. Отвергнуто: полный снимок состояния.
- **D6 Мост в UI (`NetLink`), `Session` агностична** (PROJECT.md:127-128, принцип 7a).
- **D7 Минимальный экран обмена кодом** (хост/гость), QR/ссылки — 11.
- **D8 `LocalTransport` — no-op-канал** (единый интерфейс и тесты; PROJECT.md:159).
- **D9 `Session.concede`** — минимальное аддитивное изменение (сдача).
- **Граница DOM:** чистое в `core/net` (node), WebRTC в `src/net`. Отвергнуто:
  WebRTC в core (DOM в node-тестах). Кодек — ручной base64url (отвергнуты
  `escape/unescape`, `Uint8Array.toBase64` Safari<18.2).
- **`PROTOCOL_VERSION`** — общая константа в сообщениях и метаданных.

## Проверка фазы

1. `npm test` (архитектурный инвариант + `core/net/**`, `ui/net/link.test.ts`),
   `npm run typecheck`, `npm run build` — зелёные.
2. Локальные режимы без регрессий (ИИ, «Двое за экраном», демо).
3. Ручной сетевой сценарий (две вкладки, tic-tac): A «Создать»→код → B
   «Присоединиться» (вставить, получить ответ) → A вставить ответ; партия, ход,
   имена, победа на обеих.
4. Мусор вместо кода — понятное сообщение, экран открыт, приложение живёт.

## Вне объёма

QR/ссылка, лобби-UI, имена в лобби, реванш и полировка отключения (11);
сигналинг/TURN/trickle; сеть >2 игроков; кнопка сдачи (логика `concede` есть);
деплой (12); персистентность/реплеи.

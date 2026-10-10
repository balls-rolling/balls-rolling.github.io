# REPORT — Фаза 10: сеть A (Transport + протокол + ходы)

План одобрен `/lf-next`. Выполнены T1–T9.

## Сделано

Сетевой слой платформы: абстракция `Transport` (локальный/WebRTC), кодек
приглашения (SDP + метаданные, base64url), протокол (`hello/move/surrender/bye`),
мост `NetLink` (ход ↔ сеть), минимальный экран ручного обмена кодами.
`Session` осталась транспортно-агностичной; добавлен `Session.concede`.

## Файлы

| Файл | Назначение |
| --- | --- |
| `src/core/net/transport.ts` | интерфейс `Transport`, `TransportState` |
| `src/core/net/local-transport.ts` | локальный канал (no-op) |
| `src/core/net/codec.ts` | `encodeInvite`/`decodeInvite`, base64url, `BadCodeError` |
| `src/core/net/protocol.ts` | `PROTOCOL_VERSION=1`, `applyNetMessage`, `NetApi` |
| `src/core/net/index.ts` | баррель |
| `src/net/webrtc.ts` | `startHost`/`startGuest`, мягкое ICE, очередь до `open` |
| `src/ui/net/link.ts` | мост `NetLink` (send/attach/detach, peerLeft, status) |
| `src/ui/lobby/net.ts` | сетевое лобби (хост/гость, коды) |
| `src/ui/lobby/CodeExchangeView.vue` | минимальный экран обмена кодами |
| `src/ui/lobby/index.ts` | `createLobby` (состав + сеть) |
| `src/main.ts`, `SetupScreen.vue` | provide `netLink`, `createLobby` |
| `src/games/tic-tac/game.ts` | кнопки «Создать»/«Присоединиться» |
| `src/ui/games/tic-tac/TicTacToeUi.vue` | attach, `sendMove` на ходе |
| `src/core/session/session.ts` | `Session.concede` |
| удалено | `src/ui/lobby/local.ts`, `LobbyView.vue` |

## Проверки

- **158 тестов / 25 файлов** зелёные (было 142/20). Новое: `local-transport.test.ts`,
  `codec.test.ts`, `protocol.test.ts`, `net.test.ts`, `ui/net/link.test.ts`, кейс
  `Session.concede`.
- `npm run typecheck` (3 проекта), `npm run build`, `npm run format` — код 0.
- Архитектурный тест зелёный: `core/net` не тянет DOM/Vue.
- Браузер (`vite preview`, Chromium, 2 вкладки): хост → код приглашения (~782
  симв.), гость вставил → ответ (~783), хост принял без ошибок; обе сессии
  `running · ходит Игрок`; мусорный код → «Плохой код приглашения», экран открыт.
  Локальные режимы (ИИ, «Двое за экраном», демо) — без регрессий.

## Отклонения от плана

1. `startGuest` + подключение канала через `WebRtcTransport.setChannel` вместо
   ожидания `datachannel` (лечение дедлока).
2. `Session.concede` в ядре (план это предусматривал, T3).

## Найдено и исправлено

1. **Дедлок гостя:** `startGuest` ждал `datachannel` до answer, а канал открывается
   после применения answer хостом → транспорт создаётся сразу, канал подключается
   позже (`setChannel`).
2. **Диалог закрывал транспорт:** `dialog.close()`→`handle.destroy` закрывал
   `Transport`; теперь destroy закрывает канал только при отмене (`if (!settled)`).

## Правки по замечаниям пользователя (кратко)

- Выделение текста: `.app-dialog` (`layers.css`) и `.btn` (`primitives.css`) —
  `user-select: none`; поля ввода — `text`.
- Повторные «Создать»: диалог лобби открывается синхронно (перекрывает кнопку),
  игра игнорирует повторный запуск (`#networkPending`).
- Процесс виден: `CodeExchangeView.onPrepare` показывает спиннер «Готовим
  приглашение…», поля/кнопки `disabled`; гость блокируется на время соединения.

## Хвосты / не проверено (ограничение среды)

- **Живой WebRTC не устанавливается:** два `RTCPeerConnection` в одной странице
  (`iceServers: []`) → **0 ICE-кандидатов**, состояние `new`, транспорты в
  `connecting`. Синхронизация хода по сети вживую не подтверждена (логика моста
  покрыта `ui/net/link.test.ts`).
- Не проверено: приём/передача SDP на живой сети, устойчивость к `disconnected`,
  два устройства.

## Проверка

- Дата: 2026-10-04
- Вердикт: чисто (устранён ряд мелочей; WebRTC вживую не проверяем из-за
  ограничения окружения)
- Результат по пунктам:
  - Соответствие плану T1–T9 → ok; сверено с кодом и эталоном.
  - Мусор → **problem (исправлено)**: удалено мёртвое поле
    `NetLinkConfig.ownPlayerId`; мёртвый параметр `cleanup(clearConfig)`; таймер
    `waitIce` снимается (`clearTimeout`); таймер «Скопировано» в `CodeExchangeView`
    снимается при размонтировании.
  - Согласованность → **problem (исправлено)**: опечатка `ReadyRtcTransport` в
    REPORT; BACKLOG по транспортному интерфейсу закрыт, добавлена запись `move {x,y}`.
  - Противоречия PROJECT.md → ok с оговоркой: принцип 7a и core без DOM/Vue
    соблюдены; отклонение от PROJECT.md:285 (`move {x,y}`) зафиксировано в CONTEXT
    D5 и BACKLOG.
  - Off-track → ok.
  - Хвосты → **problem (исправлено)**: сетевой «Реванш» вызывал `restart()` только
    на одном конце — теперь скрыт при транспорте (реванш — фаза 11); гонка `send`
    (`open` по `connectionState` раньше `dc.open`) устранена — `open` только по
    открытию канала.
- Объективные доказательства: `npm test` → 25 файлов, **158 тестов**; `typecheck`/
  `build`/`format` — код 0; архитектурный тест зелёный. Браузер (2 вкладки): код
  приглашения/ответ, обе сессии `running`; мусор → «Плохой код приглашения».
- Не проверено (среда): реальный WebRTC — 0 ICE; синхронизация хода вживую; приём
  SDP на живой сети, `disconnected`, два устройства.

## Вне объёма

QR/ссылка, лобби-UI, имена, реванш, полировка отключения — фаза 11; деплой — 12.

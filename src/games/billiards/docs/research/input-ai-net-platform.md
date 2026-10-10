# Ресёрч: ввод/UI, ИИ, сеть и разрыв платформы

Наши факты — `C:\projects\balls-rolling`; внешние — с URL.

## 1. Ввод, прицел, UI

- Источник: Pointer Events, `setPointerCapture`, порог тап/драг, `pointercancel`
  без выстрела — `billiards-together/src/input/tableInput.ts:63-138`;
  `touch-action:none` — `components/shell/TableCanvas.vue:244,251`.
- **Наши конфликты:**
  - Колесо в `Viewport` = **зум** (`src/ui/viewport/Viewport.vue:181-186`,
    `src/core/viewport/camera.ts:18-20`), а бильярду нужно колесо = **сила**.
    Два потребителя одного жеста — нужен режим/модификатор или отказ от одного.
  - `Viewport` отдаёт только `pick` по `pointerup` (`Viewport.vue:164-174`);
    непрерывного `pointermove` наружу нет — прицел «тяни и поворачивай» без
    расширения не собрать.
  - В формах платформы нет `range`/слайдера — контроллы `text|number|toggle|
    select|button` (`src/core/form/types.ts:9`, `src/ui/form/registry.ts:15-21`).
  - Нет `overscroll-behavior` (grep — 0 совпадений), `index.html:5` не запрещает
    масштабирование.
- Превью траектории: аналитический raycast (16 кругов + 6 сегментов, ≤2 отскока,
  дефолт 1), overlay-слой, пропуск при изменении угла <0.1° —
  `.planning/research/PITFALLS.md:86-106`; у источника не реализовано
  (`cueLayer.ts:1-6`).
- Разделение база/«рюшечки» (D3): база — наведение/сила/удар/отмена/панели/меню/
  результат + линия прицела; рюшечки — глубина off/short/full, спин-виджет,
  финты, lob.
- Внешние практики: Pointer Events (W3C) https://www.w3.org/TR/pointerevents3/ ;
  `pointercancel` (MDN) https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event ;
  `touch-action` (MDN) https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action .
  Готовых бильярдных библиотек прицела нет; `TimBeyer/balls` (ISC) — event-driven,
  не бильярдный спин; `tailuge/billiards` — GPL-3.0 (заимствовать нельзя).

## 2. ИИ (адаптивный DDA)

- Источник: одна скалярная `s∈[0,1]`, заморожена в партии, Эло-подобное
  обновление раз в 2 партии, асимметрично, кламп `[0.15,0.9]`, `σ_min>0`, safety
  play — `.planning/research/PITFALLS.md:212-232`.
- Наш прецедент: `src/games/tic-tac/difficulty.ts:16-37` — рейтинг 0..100 →
  уровень, `+[3..15]`/`−8`; `brain.ts:5` — `ERROR_BY_LEVEL`.
- **Предложение:** одна непрерывная шкала `s`; настройка игры
  `difficulty: "auto" | number` (как `level` у tic-tac, `game.ts:141`); `auto`
  двигает `s` по результатам, число фиксирует. Заморозка — при старте партии.
  Рейтинг **не персистится** — ключ `game/<id>` объявлен, но не используется
  (`.light-flow/BACKLOG.md:44-50`).
- Внешние практики DDA: обзоры подтверждают адаптивность и прозрачность —
  https://dl.acm.org/doi/pdf/10.1145/1178477.1178573 ,
  https://ieeexplore.ieee.org/document/10762577 . Готовой библиотеки нет.

## 3. Сеть

- Протокол зашит на `{t:"move",x,y}` (`src/core/net/protocol.ts:9-43`,
  `src/ui/net/link.ts:89,125-129`), **per-shot hash/seq нет**; ресинк только на
  hello/восстановлении (`link.ts:105-123`). `Move` уже непрозрачен
  (`src/core/game/move.ts:10-12`) — обобщение аддитивно.
- Источник: `SHOT_INTENT → applyMove → shooter-authoritative SHOT_RESULT + hash +
  shotSeq + resync` — `.planning/research/PITFALLS.md:60-82`. Для бильярда ход —
  удар с параметрами + физика, поэтому per-shot hash **обязателен** (в отличие
  от крестиков-ноликов).
- Очередь хода не всегда чередуется: после удачного удара игрок ходит снова —
  `src/core/game/game.ts:8-9`; `nextPlayer` может вернуть того же игрока.

## 4. Формат приглашения (ресёрч-долг — закрыт)

- Наш `Invite` уже кодирует метаданные (`v,game,role,name,sdp` + опц.
  `restore,playerId,sessionId`), deflate+base64url, строгий разбор —
  `src/core/net/codec.ts:25-36,70-136`. **Контрольной суммы/подписи нет.**
- Внешняя практика (`.planning/research/PITFALLS.md:163-174,294-298`): добавить
  короткий CRC/hash для честного «код повреждён»; HMAC без общего секрета
  бесполезен (ключ шёл бы тем же каналом); реальные меры — короткое истечение
  кода, одноразовый answer, отпечаток лобби. Fragment приватнее query
  (https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment), но query
  уже реализован.
- QR: наш комментарий ~800–850 Б на уровне L (`QrInvite.vue:3`) против оценки
  источника ~2 КБ — проверить эмпирически до роста метаданных.

## 5. Разрыв платформы: нет игрового тика

- `Session` событийный, ходы через `makeMove` (`src/core/session/session.ts:233-255`),
  компьютер через `setTimeout` (`:281-296`); `applyMove` мгновенный
  (`src/core/game/move.ts:14-26`); `Session.snapshot()` не содержит game-state
  (`:311-320`).
- Бильярду нужна «катящаяся» симуляция от удара до покоя. **Решение D12:** цикл
  крутит сама игра (ядро отдаёт шаг/advance, UI тикает rAF); расширение
  платформы (`Game.advance`/тик `Session`) отложено — долг в BACKLOG.
- Риск: цикл временно вне платформенного ядра; при этом чистота ядра игры (без
  DOM) сохраняется — UI лишь вызывает `advance`.

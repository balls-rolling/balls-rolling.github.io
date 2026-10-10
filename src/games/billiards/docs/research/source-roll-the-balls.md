# Источник «Roll the Balls» (`C:\projects\billiards-together`)

Неудачная попытка. Качество кода низкое; берём **требования, описания и отдельные
цельные механики**, архитектуру не наследуем (D7). Пути ниже — от корня источника.

## Стол и единицы

- Всё в **миллиметрах**, единый источник констант, гравитация `G=9810 мм/с²` —
  `src/core/constants.ts:8-33`.
- Стол нос-к-носу `TABLE_L=2540`, `TABLE_W=1270` — **ровно 2:1** —
  `constants.ts:9-11`.
- Шар `BALL_D=57.15`, `BALL_R=28.575`, `BALL_MASS=0.163` кг — `constants.ts:13-17`.
- Рейка `RAIL_W=101.6`, подушка `CUSHION_W=50.8`, высота `RAIL_HEIGHT=36.3`
  (63.5 % диаметра) — `constants.ts:19-25`.
- Разметка: головное пятно `0.25·L`, центр `0.5·L`, подставка `0.75·L`; 14
  sight-точек по бортам — `src/core/table.ts:304-325`.

## Лузы

- Луза — **прямоугольная выемка** (два конца носа, две скошенные облицовки,
  задняя кромка), а не круг. `PocketSpec` — `src/core/table.ts:31-52`; угловые —
  `:90-117`, боковые — `:120-145`; всего 6 луз (4 угловые id 0–3, 2 боковые id
  4,5) — `:148-157`.
- Рты: `CORNER_MOUTH=127.0`, `SIDE_MOUTH=139.7` (BCA 5″/5½″); углы
  `CORNER_FACING_DEG=142°`, `SIDE_FACING_DEG=104°` — `constants.ts:43-67`.
- Захват ⟺ центр пересёк линию рта наружу **и** `|lateral| < mouth/2 + BALL_R`
  (`CAPTURE_LATERAL_PAD = BALL_R`) — `table.ts:236-248`,
  `constants.ts:62-63`. Прежняя модель `capture-radius` **снята** —
  `constants.ts:1-4`, `02-POCKET-GEOMETRY.md:225-324`.
- Решатель: 24 отрезка (6 носов + 12 облицовок + 6 задних) — `table.ts:205-234`.

## Раскладка (rack)

- 16 шаров: 0 — биток, 1–7 сплошные, 8 чёрный, 9–15 полосатые; цвета —
  `src/core/rack.ts:15-39`.
- Биток жёстко на головном пятне `0.25·L,0.5·W` — `rack.ts:42-45`.
- Треугольник: вершина `0.75·L`, 8-й в центре 3-го ряда, задние углы — по одному
  сплошному/полосатому (по seed), остальное Fisher–Yates — `rack.ts:53-104`.
- Детерминизм `mulberry32(seed)` — `rack.ts:78,98`.

## Режимы

- Контракт `BaseGameType<TData>`: `id/table/balls/newData/rack/onTurnEnd/
  respotOnScratch?` — `src/core/game-type.ts:31-49`; реестр `GAME_TYPES` с
  проверкой ключей на компиляции — `src/modes/registry.ts:14-81`; ядро **не
  ветвится по режиму**.
- **Правила не реализованы:** `onTurnEnd` нейтрален у обоих режимов —
  `src/modes/base8ball.ts:28-30`, `src/modes/sidePocket.ts:29-31`; в
  `TurnResolution` нет `ballInHand`/`gameOver` — `src/core/events.ts:20-25`.
- Данные режимов: 8-ball `{assigned:[null,null],breakTaken:false}` —
  `src/core/snapshot.ts:44-48`; аркада `{attemptsLeft:12,streak:0,order:[]}` —
  `snapshot.ts:49-54`.

## Физика

- Фиксированный шаг `PHYS_DT=1/240` — `constants.ts:105`; аккумулятор и кламп
  кадра >0.25 c — `src/core/loop.ts:15-34`.
- Сабстепы `ceil(vmax·dt/(0.5·BALL_R))`, кап 16 — `src/core/physics.ts:302-306`.
- Замороженный порядок в субшаге: интеграция → захват луз → отрезки → пары
  шаров → сон — `physics.ts:308-314`; пары `i<j` по id, без сортировки —
  `:228-265`.
- Трение скольжение/качение `MU_SLIDE=0.20`/`MU_ROLL=0.010` —
  `constants.ts:113-115`, `physics.ts:125-171`.
- Реституции `E_BALL=0.94`/`E_RAIL=0.78`, тангенциальное демпфирование —
  `constants.ts:117-125`; сон `SLEEP_EPS=1.0`/`SLEEP_STEPS=30` —
  `physics.ts:267-286`.

## Состояние, снапшот, хэш

- `BallSnapshot{id,x,y,vx,vy,spin{x,y,z},active}` — `snapshot.ts:15-25`;
  `SessionSnapshot v:1` — `snapshot.ts:65-78`; байт-стабильный `JSON.stringify`
  и строгая валидация — `snapshot.ts:154-285`.
- Хэш FNV-1a, квант `0.5` мм, `aim` исключён структурно — `src/core/hash.ts:15-33,
  59-61,82-190`. Зачем: сеть, сохранения, ИИ.

## Ввод, прицел, UI

- Только Pointer Events, `setPointerCapture`, порог тап/драг 3 px mouse / 8 px
  прочие, `pointercancel` не стреляет — `src/input/tableInput.ts:63-138`; колесо
  = сила — `:127-136`; `touch-action:none` — `components/shell/TableCanvas.vue:244,251`.
- **Превью траектории, спин-виджет, финты, lob не реализованы** — `cueLayer.ts:1-6`;
  заглушка «Финты/Скоро» — `App.vue:166-178`. Рекомендован аналитический
  raycast ≤2 отскока — `.planning/research/PITFALLS.md:86-106`.
- Каркас партии: `InfoBar`, `PlayerPanel`, `ActionBar` (сила+удар+финты),
  немодальное меню в панели; экран результата отсутствует —
  `components/shell/*`, `App.vue`.

## ИИ

- Замысел `evaluator → executor → skill-controller`: ghost-ball оценка, softmax
  по навыку, ошибка прицела/силы пропорциональна трудности, `σ_min>0`, одна
  шкала `s∈[0,1]`, Эло-подобное обновление раз в 2 партии, заморозка в партии,
  safety play, задержка «раздумья» — `.planning/research/ARCHITECTURE.md:210-214`,
  `PITFALLS.md:212-232`.

## Сеть

- Пошаговая синхронизация на гранулярности удара: `SHOT_INTENT → локальная
  симуляция → SHOT_RESULT + hash`, shooter авторитетен, `shotSeq`, resync
  ~300 байт/удар, `Math.random` в `step` запрещён —
  `.planning/research/PITFALLS.md:60-82`.

## Что берём / что отклоняем

- **Берём:** единицы и константы геометрии; модель лузы-выемки и правило захвата;
  раскладку и её детерминизм; структуру контракта режима (как ориентир, не как
  код); физику (шаг, субстепы, трение, сон, порядок); требования к снапшоту/хэшу;
  ввод и разделение база/«рюшечки»; замысел ИИ; сетевой паттерн.
- **Отклоняем:** архитектуру и код источника как образец; его Vue-компоненты,
  stores, i18n, PWA/деплой, внутренности тестов (вне объёма фазы, запись в
  BACKLOG); конкретные числа физики как норму (источник сам помечает их
  playtest-зависимыми); BCA-рты — берём (решено), но осознанно.
- **Расхождение:** ресёрч-спека `ModePlugin` шире реального кода (нет
  `legalTargets/hud/aiHint/ballInHand/gameOver`) — `.planning/research/ARCHITECTURE.md:166-179`.

# Ресёрч бильярда — обзор

Материалы фазы 01 спринта 02. Метод — решение D7: сначала требования, затем два
параллельных потока ресёрча — по старому проекту и по интернету.

## Файлы

- `source-roll-the-balls.md` — выжимка из источника
  `C:\projects\billiards-together` («Roll the Balls»): что берём, что отклоняем.
- `external-table-rules-physics.md` — внешний ресёрч: стол/лузы (WPA/BCA),
  правила 8-ball (UPA/WPA) и Side Pocket, физика (fixed-timestep, детерминизм).
- `input-ai-net-platform.md` — внешний и внутренний ресёрч по вводу/UI, ИИ (DDA),
  сети и формату приглашения, а также разрыв нашей платформы (нет игрового тика).

## Статус

Подтверждено первичными источниками и кодом — помечено в файлах `path:line` и
ссылками. Спорное и не найденное помечено как открытый вопрос в
`../requirements.md` (§10).

## Главные источники

- WPA: таблицы/правила — официальные PDF и зеркала (см. ссылки в файлах).
- BCA: спецификация оборудования (архив/зеркала; `bca-pool.com` делегирует WPA).
- Side Pocket: мануал Game Boy, FAQ GameFAQs (SNES/Genesis), Wikipedia.
- WebRTC/Pointer Events/физика: MDN, W3C, Gaffer on Games, Box2D.
- Код платформы `balls-rolling` и источника `billiards-together`.

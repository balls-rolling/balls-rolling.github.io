# PLAN — Фаза 08: фоновое демо

**Флаг тестов фазы:** y. **Статус:** выполнен — см. REPORT.md.

Цель: живое демо за меню — случайная игра из реестра, ИИ vs ИИ, граница слоёв,
перезапуск после партии.

## Задачи

- **T1.** `Game.getDemoPlayers(): readonly PlayerInit[] | null` → `null` по
  умолчанию, импорт `PlayerInit` из `../player`. `src/core/game/game.ts`. tests y.
- **T2.** Демо крестиков-ноликов `src/games/tic-tac/game.ts`: `override
  getDemoPlayers()` — `level = 2`, `missWin = false`, два компьютера (`ai-1`/`ai-2`,
  «Компьютер 1/2», `transport: "local"`). tests y.
- **T3.** `Platform.createDemoSession()` `src/core/platform/platform.ts`: случайный
  перебор `listGames()`, `getDemoPlayers()`; `new Session({ game, players,
  options: { demo: true } })`; `Promise<Session | null>`. tests y.
- **T4.** Запуск демо и перезапуск `src/main.ts`: на старте (если диалог не открыт)
  `createDemoSession()`, `sessionHost`, `start()`; партия завершилась → ~1500 мс
  `session.restart()`. tests n.
- **T5.** Граница слоёв `src/App.vue`: `LayerGameUi` + `SessionHost` монтируются,
  только если `!session?.isDemo`; слой диалогов — всегда. tests n.
- **T6.** Тесты: `getDemoPlayers` по умолчанию `null`; крестики-нолики — 2
  компьютера и настройка; `createDemoSession` (демо-сессия / `null`); `session.isDemo
  === true`. tests y.
- **T7.** Проверка фазы: `npm test`, `npm run typecheck`, `npm run build`, браузер.
  tests y.

## Решения

| # | Решение | Обоснование | Отвергнуто |
| --- | --- | --- | --- |
| 1 | Состав демо — `Game.getDemoPlayers()` | Игра решает способ демо (D1) | Платформа создаёт игроков |
| 2 | `Platform.createDemoSession()` | Выбор игры — дело платформы (D2) | Логика в `main.ts` |
| 3 | В демо нет слоя игрового UI, диалоги есть | Меню — диалог поверх демо (D3) | Прятать CSS |
| 4 | Перезапуск после партии | Живой фон (D4) | Замирание |
| 5 | Уровень 2, без `missWin` | Конечная партия (D5) | `missWin` обоим |
| 6 | Зависимостей нет | Нативные средства (D6) | — |

## Проверка фазы

1. `npm test`, `npm run typecheck`, `npm run build`.
2. Браузер: партия ИИ vs ИИ за меню (ходы во времени), нет баннера/кнопки меню,
   перезапуск после партии, запуск реальной игры сменяет демо.
3. `getDemoPlayers`/`createDemoSession` покрыты тестами.

## Вне объёма

Пауза/CPU демо (BACKLOG), «нет естественного демо» (BACKLOG), хот-сит (09),
сеть (10).

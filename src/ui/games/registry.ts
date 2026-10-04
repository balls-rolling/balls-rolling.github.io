import { markRaw, type Component } from "vue";
import TicTacToeUi from "./tic-tac/TicTacToeUi.vue";

// Реестр UI игр: id игры → Vue-компонент. UI игры обязан жить в `src/ui/**`,
// потому что архитектурный тест запрещает `vue` под `src/games/**`. Платформа
// монтирует компонент активной игры в слой игрового UI.
//
// Импорты явные (tree-shaking); неизвестная игра — не ошибка, UI просто нет.
const registry: Readonly<Record<string, Component>> = Object.freeze({
  "tic-tac-toe": markRaw(TicTacToeUi),
});

/** Vue-компонент UI по id игры или `null`, если UI не зарегистрирован. */
export function gameUiFor(id: string): Component | null {
  return registry[id] ?? null;
}

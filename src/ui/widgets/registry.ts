import { markRaw, type Component } from "vue";
import BallsRow from "@/ui/games/billiards/BallsRow.vue";
import BonusChip from "@/ui/games/billiards/BonusChip.vue";
import GroupChip from "@/ui/games/billiards/GroupChip.vue";

// Реестр виджетов панели игрока: токен → компонент игры. Токен — обычная строка,
// поэтому Vue в ядро не протекает (как у иконок и контроллов). Сторону (левый/
// правый) виджет узнаёт из контекста панели, а не из параметров.
const widgets: Readonly<Record<string, Component>> = Object.freeze({
  "billiards.bonus": markRaw(BonusChip),
  "billiards.balls": markRaw(BallsRow),
  "billiards.group": markRaw(GroupChip),
});

/** Компонент виджета по токену; `null` — токен неизвестен. */
export function widgetFor(token: string): Component | null {
  return widgets[token] ?? null;
}

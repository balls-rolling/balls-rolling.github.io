// Сторона панели игрока, в которой рендерится игровой контролл: контроллы
// панели объявляются игрой один раз, а показываются слева и справа, поэтому
// сторону они получают отсюда, а не из схемы.
import { inject, type InjectionKey } from "vue";

export type PlayerSide = "left" | "right";

export const playerSideKey: InjectionKey<PlayerSide> = Symbol("player-side");

/** Сторона текущей панели игрока. */
export function usePlayerSide(): PlayerSide {
  return inject(playerSideKey, "left");
}

import { shallowRef, type InjectionKey, type ShallowRef } from "vue";
import { ZERO_INSETS, type UiZones, type ZoneInsets } from "@/core/ui-zones";

// Слот зон активной игры: их создаёт composition root экрана преднастройки,
// читает — оболочка (игровой слой). Один хендл на игру: и игра (через
// окружение), и рендер работают с одним состоянием, а не с двумя.

export interface ZonesSlot {
  readonly zones: ShallowRef<UiZones | null>;
  /**
   * Измеренное место панелей — наблюдаемая копия `UiZones.insets`. Само поле
   * зон остаётся обычным (игра читает его каждый кадр), а UI слота, которому
   * измерение приходит после монтирования игры, подписывается здесь.
   */
  readonly insets: ShallowRef<ZoneInsets>;
  set(zones: UiZones): void;
  /** Записать измеренное место: игре — в поле зон, подписчикам — в ref. */
  setInsets(insets: ZoneInsets): void;
  clear(): void;
}

export const zonesKey: InjectionKey<ZonesSlot> = Symbol("ui-zones");

export function createZonesSlot(): ZonesSlot {
  const zones = shallowRef<UiZones | null>(null);
  const insets = shallowRef<ZoneInsets>({ ...ZERO_INSETS });
  return {
    zones,
    insets,
    set(next: UiZones): void {
      zones.value?.handle.destroy();
      insets.value = { ...ZERO_INSETS };
      zones.value = next;
    },
    setInsets(next: ZoneInsets): void {
      zones.value && (zones.value.insets = next);
      const current = insets.value;
      // Замер повторяется на каждый resize: без сравнения подписчики
      // пересчитывали бы геометрию на каждый кадр без изменений.
      if (next.top === current.top && next.right === current.right
        && next.bottom === current.bottom && next.left === current.left) return;
      insets.value = { ...next };
    },
    clear(): void {
      zones.value?.handle.destroy();
      insets.value = { ...ZERO_INSETS };
      zones.value = null;
    },
  };
}

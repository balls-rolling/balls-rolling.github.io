import { shallowRef, type InjectionKey, type ShallowRef } from "vue";
import type { UiZones } from "@/core/ui-zones";

// Слот зон активной игры: их создаёт composition root экрана преднастройки,
// читает — оболочка (игровой слой). Один хендл на игру: и игра (через
// окружение), и рендер работают с одним состоянием, а не с двумя.

export interface ZonesSlot {
  readonly zones: ShallowRef<UiZones | null>;
  set(zones: UiZones): void;
  clear(): void;
}

export const zonesKey: InjectionKey<ZonesSlot> = Symbol("ui-zones");

export function createZonesSlot(): ZonesSlot {
  const zones = shallowRef<UiZones | null>(null);
  return {
    zones,
    set(next: UiZones): void {
      zones.value?.handle.destroy();
      zones.value = next;
    },
    clear(): void {
      zones.value?.handle.destroy();
      zones.value = null;
    },
  };
}

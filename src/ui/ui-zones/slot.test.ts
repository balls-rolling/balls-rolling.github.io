import { watch } from "vue";
import { describe, expect, it } from "vitest";
import { createUiZones, ZERO_INSETS, type ZoneInsets } from "@/core/ui-zones";
import { createZonesSlot, type ZonesSlot } from "./slot";

/** Подписка на инсеты слота с колбэком по значению и функцией отписки.
 *  `flush: "sync"` — компонентный watcher сработал бы на следующем тике, а здесь
 *  проверяем сам факт наблюдаемости. */
function watchSlot(slot: ZonesSlot, onInsets: (value: ZoneInsets) => void): () => void {
  return watch(() => slot.insets.value, onInsets, { flush: "sync" });
}

// Измеренные инсеты — обычное поле `UiZones.insets` (игра читает его каждый
// кадр), но UI слота узнаёт о них через реактивный ref слота: измерение приходит
// после монтирования игры. Здесь проверяется именно эта наблюдаемость.

describe("слот зон: наблюдаемость измеренных инсетов", () => {
  it("измеренные инсеты попадают и в зоны, и в ref слота", () => {
    const slot = createZonesSlot();
    const ui = createUiZones({ zones: {} });
    slot.set(ui);
    const insets: ZoneInsets = { top: 81, right: 8, bottom: 12, left: 4 };

    slot.setInsets(insets);

    expect(ui.insets).toEqual(insets);
    expect(slot.insets.value).toEqual(insets);
  });

  it("подписчик узнаёт о новых инсетах после монтирования игры", () => {
    const slot = createZonesSlot();
    slot.set(createUiZones({ zones: {} }));
    const seen: number[] = [];
    const stop = watchSlot(slot, (value) => seen.push(value.top));

    slot.setInsets({ top: 81, right: 0, bottom: 0, left: 0 });
    slot.setInsets({ top: 100, right: 0, bottom: 0, left: 0 });

    stop();
    expect(seen).toEqual([81, 100]);
  });

  it("повторный замер тех же инсетов подписчика не будит", () => {
    const slot = createZonesSlot();
    slot.set(createUiZones({ zones: {} }));
    const insets: ZoneInsets = { top: 81, right: 0, bottom: 0, left: 0 };
    let calls = 0;
    const stop = watchSlot(slot, () => { calls += 1; });

    slot.setInsets(insets);
    slot.setInsets({ ...insets });
    slot.setInsets({ top: 81, right: 0, bottom: 0, left: 0 });

    stop();
    expect(calls).toBe(1);
  });

  it("смена и сброс зон обнуляют инсеты", () => {
    const slot = createZonesSlot();
    const first = createUiZones({ zones: {} });
    slot.set(first);
    slot.setInsets({ top: 81, right: 0, bottom: 0, left: 0 });

    slot.set(createUiZones({ zones: {} }));
    expect(slot.insets.value).toEqual(ZERO_INSETS);

    slot.setInsets({ top: 50, right: 0, bottom: 0, left: 0 });
    slot.clear();
    expect(slot.insets.value).toEqual(ZERO_INSETS);
  });

  it("без зон замер ничего не пишет в ref игры, но ref слота обновляет", () => {
    const slot = createZonesSlot();
    const seen: number[] = [];
    const stop = watchSlot(slot, (value) => seen.push(value.top));

    slot.setInsets({ top: 30, right: 0, bottom: 0, left: 0 });

    stop();
    expect(slot.insets.value.top).toBe(30);
    expect(seen).toEqual([30]);
  });
});
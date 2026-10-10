import { createFormController } from "../form";
import type { FormNode } from "../form";
import {
  DEFAULT_ZONE_ORIENTATION,
  ZERO_INSETS,
  ZONE_ORDER,
  type UiLayoutSchema,
  type UiZone,
  type UiZones,
  type ZoneName,
} from "./types";

// Контроллер зон. Состояние и доставка сигналов — общий контроллер формы по всем
// зонам сразу: имена контроллов уникальны, вторая система не нужна.
// Рендером не занимается — это дело UI-слоя.

export function createUiZones(schema: UiLayoutSchema): UiZones {
  const zones: UiZone[] = [];
  const allNodes: FormNode[] = [];

  for (const name of ZONE_ORDER) {
    const zone = schema.zones[name];
    if (!zone) continue;
    zones.push({
      name,
      orientation: zone.orientation ?? DEFAULT_ZONE_ORIENTATION[name],
      nodes: zone.nodes,
    });
    allNodes.push(...zone.nodes);
  }

  return {
    zones,
    zone(name: ZoneName): UiZone | null {
      return zones.find((item) => item.name === name) ?? null;
    },
    handle: createFormController({ nodes: allNodes }),
    insets: { ...ZERO_INSETS },
  };
}

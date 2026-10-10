// Разложение состава партии по сторонам панели участников. Чистая функция —
// без Vue и DOM: слева всегда главный игрок (хост), справа гость.

export interface SidePlayer {
  readonly id: string;
  readonly name: string;
  readonly isCurrent: boolean;
}

export interface PlayerSides {
  readonly left: SidePlayer | null;
  readonly right: SidePlayer | null;
}

/** Разложить игроков по сторонам: `players[0]` — слева, `players[1]` — справа. */
export function playerSides(
  players: readonly { readonly id: string; readonly name: string }[],
  currentPlayerId: string | null,
): PlayerSides {
  const side = (index: number): SidePlayer | null => {
    const player = players[index];
    if (!player) return null;
    return { id: player.id, name: player.name, isCurrent: player.id === currentPlayerId };
  };
  return { left: side(0), right: side(1) };
}

/** Буква для аватара: первый видимый символ имени. Пусто — «?». */
export function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "?";
}

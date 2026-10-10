import type { Session } from "@/core/session";
import type { TransportState } from "@/core/net";

// Определение роли в сетевой партии и признака обрыва (12-b, D11–D13).
// Чистые функции без Vue — используются компонентом восстановления и тестами.

export type NetRole = "host" | "guest" | null;

/**
 * Роль локальной стороны: `null`, если партия не сетевая. Сетевой состав ведёт
 * хост и он идёт первым (`players[0]`); если human-local первый — это хост, иначе
 * гость. Так роль не зависит от конкретных id.
 */
export function networkRole(session: Session): NetRole {
  const players = session.snapshot().players;
  if (!players.some((player) => player.transport === "remote")) return null;
  const local = players.find((player) => player.transport === "local");
  if (!local) return null;
  return players[0]?.id === local.id ? "host" : "guest";
}

/** Соединение потеряно: партнёр ушёл или транспорт закрыт/сломан. */
export function isDisconnected(status: TransportState, peerLeft: boolean): boolean {
  return peerLeft || status === "closed" || status === "failed";
}

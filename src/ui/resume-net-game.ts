import type { Game, GameEntry } from "@/core/game";
import type { Platform } from "@/core/platform";
import { Session } from "@/core/session";
import type { DialogManager } from "@/ui/dialog/manager";
import type { NetLink } from "@/ui/net/link";
import type { SessionHost } from "@/ui/session-host";
import type { RestoreLobby, RestoreLobbyResult } from "@/ui/lobby/restore";
import { attachSessionSave } from "@/ui/session-save";

// Сетевое восстановление (12-b). Замысел (CONTEXT D11–D15): сетевую партию
// помнит и восстанавливает **только хост**; гость снимок не хранит, а при
// переподключении получает состояние от хоста (`sync` → `Session.adoptState`).
//
// Модуль живёт в UI, но не тянет Vue и не импортирует `.vue`: зависимости —
// type-only, поэтому его можно прогонять в node-тестах.

export interface ResumeNetworkDeps {
  readonly platform: Platform;
  readonly sessionHost: SessionHost;
  readonly dialog: DialogManager;
  readonly netLink: NetLink;
  readonly restoreLobby: RestoreLobby;
}

/** Хост: подключить восстановленную сессию к свежему транспорту и раздавать состояние. */
function activateHost(
  deps: ResumeNetworkDeps,
  result: RestoreLobbyResult,
  session: Session,
  game: Game,
): void {
  const { sessionHost, netLink, platform } = deps;

  netLink.configure({
    transport: result.transport,
    remotePlayerId: result.remotePlayerId,
    ownName: result.ownName,
    ownPlayerId: result.ownPlayerId,
    // Хост — источник истины: по `hello`/открытию канала отдаёт снимок гостю.
    outgoingState: () => session.save(),
  });
  sessionHost.set(session, game);
  netLink.attach(session);
  attachSessionSave({ session, game, platform });
  session.resume();
}

/**
 * Хост: восстановить локальный снимок и раздать свежую ссылку с составом.
 * Возвращает `false`, если сохранения нет, human-local не `p1`, либо хост
 * отменил лобби — тогда сессия освобождается.
 */
export async function resumeNetworkHost(
  entry: GameEntry,
  deps: ResumeNetworkDeps,
): Promise<boolean> {
  const { platform, restoreLobby } = deps;

  const game = await platform.createGame(entry);
  const session = await platform.resumeSession(game);
  if (!session) return false;

  const players = session.snapshot().players;
  const local = players.find((player) => player.transport === "local");
  // Хост — тот, кто первый в составе и сохранил снимок (`players[0]`).
  if (!local || players[0]?.id !== local.id) {
    session.destroy();
    return false;
  }

  const preset = players.map((player) => ({ id: player.id, name: player.name }));
  const result = await restoreLobby.showHostRestore({
    gameId: entry.id,
    ownPlayerId: local.id,
    players: preset,
  });
  if (!result) {
    session.destroy();
    return false;
  }

  activateHost(deps, result, session, game);
  return finishHost(entry, deps);
}

/**
 * Хост: переподключиться к тому же гостю, не теряя живую сессию (R5). Открывает
 * лобби восстановления с текущим составом; на успехе — свежий транспорт и
 * продолжение. Сессия не пересоздаётся.
 */
export async function recoverNetworkHost(
  game: Game,
  session: Session,
  deps: ResumeNetworkDeps,
): Promise<boolean> {
  const preset = session.snapshot().players.map((player) => ({
    id: player.id,
    name: player.name,
  }));
  const local = session.snapshot().players.find((player) => player.transport === "local");
  const result = await deps.restoreLobby.showHostRestore({
    gameId: game.id,
    ownPlayerId: local?.id ?? preset[0]?.id ?? "p1",
    players: preset,
  });
  if (!result) return false;

  activateHost(deps, result, session, game);
  return finishHost({ id: game.id, label: game.label, entry: async () => game }, deps);
}

/** Общая концовка хоста: запомнить игру и закрыть диалог. */
async function finishHost(entry: GameEntry, deps: ResumeNetworkDeps): Promise<true> {
  const settings = await deps.platform.loadGlobalSettings();
  await deps.platform.saveGlobalSettings({ ...settings, lastGameId: entry.id });
  deps.dialog.close();
  return true;
}

/**
 * Гость: подключиться по свежей ссылке хоста **заново** (снимка у гостя нет).
 * Сессия создаётся заново из известного состава (`p1` — хост, `p2` — гость);
 * после открытия канала хост присылает `sync`, и `NetLink` применяет состояние.
 */
export async function resumeNetworkGuest(
  entry: GameEntry,
  offer: string,
  deps: ResumeNetworkDeps,
): Promise<boolean> {
  const { platform, restoreLobby, netLink, sessionHost } = deps;

  const game = await platform.createGame(entry);
  const settings = await platform.loadGlobalSettings();
  const result = await restoreLobby.showClientRestore({
    gameId: entry.id,
    ownPlayerId: settings.playerId,
    offer,
  });
  if (!result) return false;

  const session = new Session({
    game,
    players: [
      { id: result.remotePlayerId, name: "Хост", agent: "human", transport: "remote" },
      { id: result.ownPlayerId, name: result.ownName, agent: "human", transport: "local" },
    ],
  });
  session.start();

  netLink.configure({
    transport: result.transport,
    remotePlayerId: result.remotePlayerId,
    ownName: result.ownName,
    ownPlayerId: result.ownPlayerId,
  });
  sessionHost.set(session, game);
  netLink.attach(session);

  await platform.saveGlobalSettings({ ...settings, lastGameId: entry.id });

  deps.dialog.close();
  return true;
}

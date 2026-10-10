import type { GameEntry } from "@/core/game";
import type { Platform } from "@/core/platform";
import type { DialogManager } from "@/ui/dialog/manager";
import type { RestoreLobby } from "@/ui/lobby/restore";
import type { NetLink } from "@/ui/net/link";
import type { SessionHost } from "@/ui/session-host";
import { resumeNetworkHost } from "@/ui/resume-net-game";
import { attachSessionSave } from "@/ui/session-save";

// Возобновление сохранённой партии. Живёт в UI: точке восстановления нужны
// платформа, слот активной сессии и менеджер диалогов. Ядро остаётся без Vue.
//
// Зависимости описаны type-only импортами: модуль не тянет классы и не
// импортирует `.vue`, поэтому его можно прогонять в node-тестах без плагина Vue.

export interface ResumeGameDeps {
  readonly platform: Platform;
  readonly sessionHost: SessionHost;
  readonly dialog: DialogManager;
  // Сетевые зависимости нужны только для восстановления сетевой партии (12-b):
  // без них локальный путь работает как раньше.
  readonly netLink?: NetLink;
  readonly restoreLobby?: RestoreLobby;
}

/**
 * Восстановить партию по записи игры. Возвращает `false`, если сохранения нет
 * либо оно непригодно — тогда вызывающий открывает экран преднастройки.
 *
 * Маршрутизация: если в снимке есть игрок с `transport: "remote"`, партия
 * сетевая — сессию освобождаем и передаём управление `resumeNetworkHost`
 * (свежее лобби восстановления и транспорт). Без `netLink`/`restoreLobby` такой
 * путь невозможен и вернётся `false`. Иначе — прежний локальный путь: сессия
 * кладётся в слот, включается автосохранение, партия продолжается с того же
 * места, запоминается последняя игра, и диалог закрывается.
 */
export async function resumeGame(entry: GameEntry, deps: ResumeGameDeps): Promise<boolean> {
  const { platform, sessionHost, dialog } = deps;

  const game = await platform.createGame(entry);
  const session = await platform.resumeSession(game);
  if (!session) return false;

  // Снимок читается дважды (здесь и внутри `resumeNetworkHost`): это дешёвая и
  // безопасная операция, зато не плодим промежуточный контракт.
  const isNetwork = session.snapshot().players.some((player) => player.transport === "remote");
  if (isNetwork) {
    session.destroy();
    const { netLink, restoreLobby } = deps;
    if (!netLink || !restoreLobby) return false;
    return resumeNetworkHost(entry, {
      platform,
      sessionHost,
      dialog,
      netLink,
      restoreLobby,
    });
  }

  sessionHost.set(session, game);
  attachSessionSave({ session, game, platform });
  session.resume();

  const settings = await platform.loadGlobalSettings();
  await platform.saveGlobalSettings({ ...settings, lastGameId: entry.id });

  dialog.close();
  return true;
}

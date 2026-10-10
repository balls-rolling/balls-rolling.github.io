import { markRaw, reactive } from "vue";
import type { Lobby, LobbyOptions } from "@/core/game";
import {
  PROTOCOL_VERSION,
  buildInviteLink,
  decodeInvite,
  encodeInvite,
  inviteOfferFromInput,
  parseInviteLink,
  type LobbyPlayer,
  type Transport,
} from "@/core/net";
import type { Platform } from "@/core/platform";
import type { PlayerInit } from "@/core/player";
import type { DialogManager } from "@/ui/dialog/manager";
import type { NetLink } from "@/ui/net";
import type { NotificationCenter } from "@/ui/notifications";
import { startGuest, startHost, type HostHandle } from "@/net";
import LobbyView from "./LobbyView.vue";
import { GuestLobbySession, HostLobbySession } from "./session";
import type { LobbyViewState } from "./types";

// Сетевое лобби: диалог открывается сразу, транспорт и состав готовятся внутри;
// состав ведёт хост, партия стартует только по «Начать». Сессия лобби живёт до
// `start`, затем транспорт переходит игровому мосту `NetLink`.

export interface NetworkLobbyDeps {
  readonly platform: Platform;
  readonly dialog: DialogManager;
  readonly netLink: NetLink;
  readonly notifications: NotificationCenter;
  readonly gameId: string;
}

const BAD_ANSWER = "Плохой код ответа";
const BAD_INVITE = "Плохой код приглашения";
const REMATCH_NOOP = {
  rematchOffer: () => {},
  rematchAccept: () => {},
  rematchDecline: () => {},
};

export function createNetworkLobby(deps: NetworkLobbyDeps): Pick<Lobby, "showHost" | "showClient"> {
  const games = [deps.gameId];

  function baseUrl(): string {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function showHost(_options?: LobbyOptions): Promise<readonly PlayerInit[] | null> {
    const state = reactive<LobbyViewState>({
      role: "host",
      players: [],
      inviteLink: "",
      answerCode: "",
      preparing: true,
      joined: true,
      busy: false,
      error: "",
    });
    let session: HostLobbySession | null = null;
    let host: HostHandle | null = null;
    let name = "";
    let playerId = "";
    let cancelled = false;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (players: readonly PlayerInit[] | null): void => {
        if (settled) return;
        settled = true;
        resolve(players);
      };

      const startGame = (): void => {
        if (!session) return;
        const roster = session.players;
        const seatHost = roster[0];
        const seatGuest = roster[1];
        session.start();
        session.dispose();
        deps.netLink.configure({
          transport: transportOf(host),
          remotePlayerId: seatGuest?.id ?? "p2",
          ownName: name,
          ownPlayerId: seatHost?.id ?? playerId,
        });
        finish([
          {
            id: seatHost?.id ?? playerId,
            name,
            agent: "human",
            transport: "local",
          },
          {
            id: seatGuest?.id ?? "p2",
            name: seatGuest?.name ?? "Гость",
            agent: "human",
            transport: "remote",
          },
        ]);
        deps.dialog.close();
      };

      const submitAnswer = async (code: string): Promise<void> => {
        if (!host) return;
        state.error = "";
        state.busy = true;
        try {
          const invite = await decodeInvite(inviteOfferFromInput(code), {
            games,
            version: PROTOCOL_VERSION,
            expectedRole: "guest",
          });
          await host.accept({ type: invite.sdp.type, sdp: invite.sdp.sdp });
        } catch {
          state.error = BAD_ANSWER;
        } finally {
          state.busy = false;
        }
      };

      deps.dialog.show({
        component: markRaw(LobbyView),
        title: "Лобби",
        props: {
          state,
          onKick: (id: string) => session?.kick(id),
          onStart: startGame,
          onAnswer: (code: string) => void submitAnswer(code),
          onScan: (text: string) => {
            const link = parseInviteLink(text);
            void submitAnswer(link?.offer ?? text);
          },
        },
        handle: {
          destroy: () => {
            cancelled = true;
            if (!settled) {
              session?.dispose();
              host?.transport.close();
            }
            finish(null);
          },
        },
      });

      void (async () => {
        try {
          const settings = await deps.platform.loadGlobalSettings();
          name = settings.name;
          playerId = settings.playerId;
          if (cancelled) return;
          host = await startHost();
          if (cancelled) {
            host.transport.close();
            return;
          }
          session = new HostLobbySession(
            name,
            host.transport,
            {
              players: (players: readonly LobbyPlayer[]) => {
                state.players = [...players];
              },
              ...REMATCH_NOOP,
            },
            { hostId: playerId },
          );
          state.players = [...session.players];
          state.inviteLink = buildInviteLink(
            {
              gameId: deps.gameId,
              offer: await encodeInvite({
                v: PROTOCOL_VERSION,
                game: deps.gameId,
                role: "host",
                name,
                sdp: { type: "offer", sdp: host.description.sdp ?? "" },
              }),
            },
            baseUrl(),
          );
        } catch {
          state.error = "Не удалось подготовить приглашение";
        } finally {
          state.preparing = false;
        }
      })();
    });
  }

  function showClient(options?: LobbyOptions): Promise<readonly PlayerInit[] | null> {
    const state = reactive<LobbyViewState>({
      role: "guest",
      players: [],
      inviteLink: "",
      answerCode: "",
      preparing: false,
      joined: false,
      busy: false,
      error: "",
    });
    let session: GuestLobbySession | null = null;
    let name = "";
    let playerId = "";
    let transport: Transport | null = null;
    let cancelled = false;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (players: readonly PlayerInit[] | null): void => {
        if (settled) return;
        settled = true;
        resolve(players);
      };

      const join = async (offerCode: string): Promise<void> => {
        state.busy = true;
        state.error = "";
        try {
          const settings = await deps.platform.loadGlobalSettings();
          name = settings.name;
          playerId = settings.playerId;
          if (cancelled) return;
          const invite = await decodeInvite(inviteOfferFromInput(offerCode), {
            games,
            version: PROTOCOL_VERSION,
            expectedRole: "host",
          });
          const guest = await startGuest({ type: invite.sdp.type, sdp: invite.sdp.sdp });
          transport = guest.transport;
          if (cancelled) {
            transport.close();
            return;
          }
          session = new GuestLobbySession(
            name,
            guest.transport,
            {
              players: (players) => {
                state.players = [...players];
              },
              start: (players) => {
                session?.dispose();
                const hostSeat = players.find((item) => item.id !== playerId);
                const hostId = hostSeat?.id ?? invite.playerId ?? "p1";
                deps.netLink.configure({
                  transport: guest.transport,
                  remotePlayerId: hostId,
                  ownName: name,
                  ownPlayerId: playerId,
                });
                transport = null; // транспорт перешёл игровому мосту
                finish([
                  {
                    id: hostId,
                    name: hostSeat?.name ?? "Хост",
                    agent: "human",
                    transport: "remote",
                  },
                  { id: playerId, name, agent: "human", transport: "local" },
                ]);
                deps.dialog.close();
              },
              kicked: () => {
                deps.notifications.notify("error", "Вы исключены из лобби");
                session?.dispose();
                transport?.close();
                finish(null);
                deps.dialog.close();
              },
              ...REMATCH_NOOP,
            },
            { playerId },
          );
          session.join();
          state.answerCode = await encodeInvite({
            v: PROTOCOL_VERSION,
            game: deps.gameId,
            role: "guest",
            name,
            sdp: { type: "answer", sdp: guest.description.sdp ?? "" },
          });
          state.joined = true;
        } catch {
          state.error = BAD_INVITE;
        } finally {
          state.busy = false;
        }
      };

      deps.dialog.show({
        component: markRaw(LobbyView),
        title: "Лобби",
        props: {
          state,
          onJoin: (code: string) => void join(code),
          onScan: (text: string) => {
            const link = parseInviteLink(text);
            void join(link?.offer ?? text);
          },
          onLeave: () => {
            session?.leave();
            session?.dispose();
            transport?.close();
            transport = null;
            finish(null);
            deps.dialog.close();
          },
        },
        handle: {
          destroy: () => {
            cancelled = true;
            if (!settled) {
              session?.dispose();
              transport?.close();
              transport = null;
            }
            finish(null);
          },
        },
      });

      if (options?.offer) {
        state.preparing = true;
        void join(options.offer).finally(() => {
          state.preparing = false;
        });
      }
    });
  }

  return { showHost, showClient };
}

/** Транспорт хоста уже создан — достаём его из handle. */
function transportOf(host: HostHandle | null) {
  if (!host) throw new Error("Хост не подготовлен");
  return host.transport;
}

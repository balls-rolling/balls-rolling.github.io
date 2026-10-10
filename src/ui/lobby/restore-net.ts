import { markRaw, reactive } from "vue";
import {
  PROTOCOL_VERSION,
  buildInviteLink,
  decodeInvite,
  encodeInvite,
  parseInviteLink,
  type LobbyPlayer,
  type Transport,
} from "@/core/net";
import { startGuest, startHost, type HostHandle } from "@/net";
import LobbyView from "./LobbyView.vue";
import type { NetworkLobbyDeps } from "./net";
import type {
  RestoreGuestInput,
  RestoreHostInput,
  RestoreLobby,
  RestoreLobbyResult,
} from "./restore";
import { GuestLobbySession, HostLobbySession } from "./session";
import type { LobbyViewState } from "./types";

// Реализация лобби восстановления поверх `LobbyView` и оркестраторов лобби
// (`session.ts`). Отличие от `net.ts`: предопределённый состав из снимка
// (`preset`), идентичность (`playerId`) на проводе и результат — готовый
// транспорт с id, а не состав `PlayerInit[]`. Транспорт не уходит в `NetLink`
// здесь: это делает координатор восстановления (T7).

const BAD_ANSWER = "Плохой код ответа";
const BAD_INVITE = "Плохой код приглашения";
const REMATCH_NOOP = {
  rematchOffer: () => {},
  rematchAccept: () => {},
  rematchDecline: () => {},
};

export function createRestoreLobby(deps: NetworkLobbyDeps): RestoreLobby {
  function baseUrl(): string {
    return `${window.location.origin}${window.location.pathname}`;
  }

  function showHostRestore(input: RestoreHostInput): Promise<RestoreLobbyResult | null> {
    const state = reactive<LobbyViewState>({
      role: "host",
      players: [],
      inviteLink: "",
      answerCode: "",
      preparing: true,
      joined: true,
      busy: false,
      error: "",
      restore: true,
      canStart: false,
    });
    const presetName = input.players.find((player) => player.id === input.ownPlayerId)?.name;
    const remotePlayerId =
      input.players.find((player) => player.id !== input.ownPlayerId)?.id ?? "p2";
    let session: HostLobbySession | null = null;
    let host: HostHandle | null = null;
    let name = "";
    let cancelled = false;
    let accepted = false;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: RestoreLobbyResult | null): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const startGame = (): void => {
        if (!session || !host || !session.canStart) return;
        const transport = host.transport;
        session.start();
        session.dispose();
        finish({
          transport,
          ownPlayerId: input.ownPlayerId,
          remotePlayerId,
          ownName: name,
        });
      };

      const submitAnswer = async (code: string): Promise<void> => {
        if (!host || accepted) return;
        state.error = "";
        state.busy = true;
        try {
          const invite = await decodeInvite(code, {
            games: [input.gameId],
            version: PROTOCOL_VERSION,
            expectedRole: "guest",
          });
          await host.accept({ type: invite.sdp.type, sdp: invite.sdp.sdp });
          // Ответ принят один раз: повторный accept сломает соединение.
          accepted = true;
        } catch {
          state.error = BAD_ANSWER;
        } finally {
          state.busy = false;
        }
      };

      deps.dialog.show({
        component: markRaw(LobbyView),
        title: "Восстановление партии",
        props: {
          state,
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
          name = presetName ?? (await deps.platform.loadGlobalSettings()).name;
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
                state.canStart = session?.canStart ?? false;
              },
              ...REMATCH_NOOP,
            },
            { preset: input.players },
          );
          state.players = [...session.players];
          state.canStart = session.canStart;
          state.inviteLink = buildInviteLink(
            {
              gameId: input.gameId,
              offer: await encodeInvite({
                v: PROTOCOL_VERSION,
                game: input.gameId,
                role: "host",
                name,
                sdp: { type: "offer", sdp: host.description.sdp ?? "" },
                restore: true,
                playerId: input.ownPlayerId,
                sessionId: input.gameId,
              }),
            },
            baseUrl(),
          );
        } catch {
          state.error = "Не удалось подготовить восстановление";
          finish(null);
        } finally {
          state.preparing = false;
        }
      })();
    });
  }

  function showClientRestore(input: RestoreGuestInput): Promise<RestoreLobbyResult | null> {
    const state = reactive<LobbyViewState>({
      role: "guest",
      players: [],
      inviteLink: "",
      answerCode: "",
      preparing: true,
      joined: false,
      busy: false,
      error: "",
      restore: true,
      waiting: "Ожидание хоста",
    });
    let session: GuestLobbySession | null = null;
    let transport: Transport | null = null;
    let name = "";
    let remotePlayerId = "p1";
    let cancelled = false;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: RestoreLobbyResult | null): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      void (async () => {
        try {
          name = (await deps.platform.loadGlobalSettings()).name;
          if (cancelled) return;
          // `restore` допускаем отсутствующим: старые клиенты и мягкая проверка.
          const invite = await decodeInvite(input.offer, {
            games: [input.gameId],
            version: PROTOCOL_VERSION,
            expectedRole: "host",
          });
          remotePlayerId = invite.playerId ?? "p1";
          // Свой постоянный id гость знает сам (из настроек) и прислал его в
          // `RestoreGuestInput.ownPlayerId`; хост допускает по нему.
          const ownId = input.ownPlayerId;
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
              start: () => {
                session?.dispose();
                const handed = guest.transport;
                transport = null; // транспорт переходит координатору восстановления
                finish({
                  transport: handed,
                  ownPlayerId: ownId,
                  remotePlayerId,
                  ownName: name,
                });
              },
              kicked: () => {
                deps.notifications.notify("error", "Вы исключены из лобби");
                session?.dispose();
                transport?.close();
                transport = null;
                finish(null);
                deps.dialog.close();
              },
              ...REMATCH_NOOP,
            },
            { playerId: ownId },
          );
          session.join();
          state.answerCode = await encodeInvite({
            v: PROTOCOL_VERSION,
            game: input.gameId,
            role: "guest",
            name,
            sdp: { type: "answer", sdp: guest.description.sdp ?? "" },
          });
          state.joined = true;
        } catch {
          state.error = BAD_INVITE;
          finish(null);
        } finally {
          state.preparing = false;
        }
      })();

      deps.dialog.show({
        component: markRaw(LobbyView),
        title: "Восстановление партии",
        props: {
          state,
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
    });
  }

  return { showHostRestore, showClientRestore };
}

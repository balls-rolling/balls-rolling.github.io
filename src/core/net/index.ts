// Публичный API сетевого слоя ядра: канал, кодек приглашения, протокол.
export type { Transport, TransportState, MessageListener, StateListener } from "./transport";
export { LocalTransport } from "./local-transport";
export {
  BadCodeError,
  decodeBase64Url,
  encodeBase64Url,
  decodeInvite,
  encodeInvite,
} from "./codec";
export type { Invite, InviteRole, InviteSdp, DecodeInviteOptions } from "./codec";
export { PROTOCOL_VERSION, applyNetMessage } from "./protocol";
export type { NetApi, NetMessage } from "./protocol";
export { applyLobbyMessage } from "./lobby-protocol";
export type { LobbyApi, LobbyMessage, LobbyPlayer } from "./lobby-protocol";
export { LobbyRoster } from "./lobby-roster";
export {
  buildInviteLink,
  parseInviteLink,
  inviteOfferFromInput,
  NET_GAME_OPEN,
} from "./invite-link";
export type { InviteLinkParams } from "./invite-link";

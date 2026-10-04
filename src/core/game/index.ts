// Публичный API игр: записи реестра, базовый класс и контракты окружения.
export { Game } from "./game";
export type { GameEntry } from "./entry";
export type {
  GameEnvironment,
  LaunchOptions,
  Lobby,
  LobbyOptions,
  LocalPlayersOptions,
  SessionAccess,
} from "./environment";
export type { GameState, Move, MoveResult } from "./move";
export type { GameRenderFrame, BoardColors } from "./render";
export type { ExitCustomization, ExitRequest, GameMenuItem } from "./menu";
export { listGames } from "./registry";

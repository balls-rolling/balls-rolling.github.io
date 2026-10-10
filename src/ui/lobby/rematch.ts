import { applyLobbyMessage, type Transport } from "@/core/net";

// Реванш поверх лобби-протокола. Схема простая: нажавший шлёт `rematch-offer`;
// получивший соглашается автоматически (`rematch-accept`), обе стороны
// перезапускают партию. Первое согласие = старт заново с тем же составом.

export interface Rematch {
  /** Предложить реванш. */
  request(): void;
  dispose(): void;
}

export function createRematch(transport: Transport, onRestart: () => void): Rematch {
  const off = transport.onMessage((message) => {
    applyLobbyMessage(message, {
      rematchOffer: () => {
        transport.send({ t: "rematch-accept" });
        onRestart();
      },
      rematchAccept: () => onRestart(),
      rematchDecline: () => {},
      join: () => {},
      players: () => {},
      kick: () => {},
      start: () => {},
      leave: () => {},
    });
  });

  return {
    request: () => transport.send({ t: "rematch-offer" }),
    dispose: off,
  };
}
